# Codegraph foundation, cross-service feature graph, and reuse-reviewer subsystem

Authored: 2026-05-26.

## Goal

Establish a persistent, queryable code-graph as the single source of truth for artifact, feature, symbol, entity, and contract-op relationships across **both** the specification surface (`docs/**`) and the implementation surface (`src/**`). Build the cross-service feature graph and a reuse-reviewer subsystem on top of it so the model is forced to update existing artifacts and existing source rather than create duplicates of either.

## Two surfaces, one graph

A consumer repository carries two distinct authoring surfaces:

- **Specification surface** — `docs/**` chain artifacts (PRD, FRS, SAD, ADR, TDD, openapi, asyncapi, clientapi, TSR) plus the `.orchestra/**` runtime data.
- **Implementation surface** — `src/**` business code (Java first; other languages deferred).

Both surfaces suffer the same two failure modes documented in `stories.md`. The graph stores nodes across both surfaces, edges across the boundary (a `symbol` node `implements` a `contract-op` node which `declares` a `feature` node), and every behaviour in this brief — sync hook, reuse-reviewer, context-pack closure injection, provenance, diagnostics — applies to both unless explicitly scoped narrower.

## Story grounding

This motion answers two real-world failure patterns documented in `stories.md`. Each pattern surfaces independently on **both** surfaces.

**Story #1 — 3-week multi-repo spec extraction post-mortem.** Six errors documented: (E1) partitioning by repository instead of by feature, (E2) undefined batch boundaries, (E3) lack of shared context across batches, (E4) lack of cross-referencing IDs between specs, (E5) no verification before merging, (E6) failing to separate confirmed-by-evidence from inferred-by-pattern knowledge. Story author's closing: *"The most effective agent is not the smartest agent. It is the agent provided with context structured by business logic, delivered at the right time, in the correct format."* The errors reproduce on the implementation surface as well — code partitioned by repository misses cross-service feature spans the same way specs do; source files lack shared context (a DTO class named differently across services); merge phase exposes drift between implementations.

**Story #2 — useful hook for reuse over duplication.** A hook intercepts writes to a target directory; on detection it launches a separate Claude Code instance to review the candidate against existing files; the reviewer returns an advice signal; the primary instance updates the existing file rather than creating a duplicate. Story author's framing: *"the upside is that I'm going to end up with a lot less duplicate code"*; the trade-off is review latency and review cost per write inside the watched directory. The story's original case is literally about source code (a `src/queries/` directory); the same pattern applies one layer up to chain artifacts.

## Pain points addressed

- Cross-service features have no canonical binding today. Per-service `features.yaml` is intra-service only; cross-service relationships are explicitly not modelled. This reproduces Story #1's E1 at the service boundary on the specification surface and at the package boundary on the implementation surface.
- Stale-link rot, drift after upstream renames, and `link_id` merge-collision are all symptoms of "no canonical relationship store" — patching each in isolation is duct tape; a graph primitive is the proper home. The same rot affects source code: renamed methods leave dangling `@Autowired` injections and broken Feign client signatures unless the graph re-resolves edges on every write.
- The plugin accretes new chain artifacts every motion instead of upserting existing ones. Source code in consumer repositories accretes duplicate utilities, near-identical query methods, and parallel DTO classes for the same logical entity. Story #2's pattern, applied as a pre-write reviewer driven by graph similarity, enforces upsert-over-create at runtime on both surfaces rather than relying on policy.
- Confirmed (deterministic, evidence-anchored) and inferred (heuristic, pattern-driven) knowledge today carry identical weight in chain artifacts. The same problem surfaces in code-side reverse derivation: a symbol attributed to a feature via AST analysis is empirical; a symbol attributed by name-matching is heuristic; both look identical in the graph without provenance.

## Approach: three sequenced stages

Stage 1 ships the graph primitive standalone, wired only to the existing per-service feature DAG. Stage 2 builds the cross-service tier and the reuse-reviewer subsystem on the graph. Stage 3 polishes the reviewer UX, the link lifecycle, and adds optional feature grouping.

Three stages, three reviewable PRs, three independent rollback boundaries. The primitive lands first because Stages 2 and 3 cannot ship correctly without it; bundling them risks an unreviewable mega-PR.

---

## Stage 1 — codegraph primitive

**Goal.** A `.orchestra/codegraph.db` SQLite store representing artifact, feature, symbol, entity, contract-op, and ADR nodes plus edges between them, updated automatically on every chain-artifact or `.orchestra/**` write. Brownfield bootstrap on first invocation populates the initial graph.

**Touchpoints.**

- New MCP server `mcp-servers/orchestra-graph.js` exposes `graph_query`, `graph_upsert_node`, `graph_upsert_edge`, `graph_diagnostics`.
- New hook script `hooks/scripts/codegraph-sync.js` runs PostToolUse on `Write|Edit|MultiEdit`, matchers scoped to `docs/**/*.{md,yaml}`, `.orchestra/**/*.{md,yaml}`, and `src/**/*.java` (other language patterns deferred until each language gains AST extraction). Indirect mutators (the existing `mcp__orchestra-utils__*` write tools) invoke sync via a shared library at `hooks/lib/codegraph-sync.js`.
- New bootstrap script `hooks/scripts/codegraph-bootstrap.js` runs on first `/orchestra` invocation when `.orchestra/codegraph.db` is absent. Walks consumer project `docs/**`, `.orchestra/**`, and `src/**`; derives initial nodes and edges. Source-side `symbol` nodes derive via AST on Java first; other languages deferred.
- New schema document `schemas/codegraph.schema.md` defines node kinds, edge kinds, attribute schema, and diagnostic format.
- `schemas/pipeline-artifact.schema.md` extended to declare `.orchestra/codegraph.db` as a chain artifact subject to audit-trail conformance.
- `hooks/hooks.json` registers the new sync hook with matchers.
- `commands/orchestra.md` preflight surfaces graph-diagnostic count plus the top five dangling-reference rows; first-run triggers bootstrap.
- `agents/evaluator.md` Phase 4 reads `graph_diagnostics` for broken edges before pipeline lock.
- `.gitignore` excludes `.orchestra/codegraph.db-journal`; the `.db` itself is committed.
- `package.json` adds `better-sqlite3` dependency.

**Functional requirements.**

- The graph store lives at `.orchestra/codegraph.db`; schema in `schemas/codegraph.schema.md` is authoritative.
- Node kinds: feature, artifact, symbol, entity, contract-op, adr. Attributes per kind defined in schema.
- Edge kinds: declares, references, depends-on, supersedes, implements, calls, publishes, consumes, shares-entity.
- The sync hook triggers PostToolUse on Write, Edit, and MultiEdit with path matchers scoped to chain artifacts, `.orchestra/**`, and source files for languages with AST extraction (Java first). Indirect mutators must invoke sync through the shared library.
- Bootstrap runs on first invocation when the database is absent. Walks `docs/**`, `.orchestra/**`, and `src/**`. Java AST symbol extraction is in scope for the initial release; other language symbol extraction is deferred.
- Edge integrity check runs on every write. Dangling references emit rows into `graph_diagnostics`; preflight surfaces the count and a top-five sample.
- Graph mutations are atomic per tool-call via SQLite `BEGIN IMMEDIATE`. Concurrent agent writes serialize through a `.orchestra/codegraph.lock` file held for the duration of the transaction.
- Every graph mutation appends a row to `events.jsonl` via the existing `metrics-collector.js` hook, satisfying audit-trail conformance.
- Env-var opt-out: `ORCHESTRA_HOOK_CODEGRAPH_SYNC=off` skips the sync hook; `ORCHESTRA_MCP_ORCHESTRA_GRAPH=off` disables the MCP. Disabling both is rejected at dispatcher startup.

**Acceptance criteria.**

- Blank install plus `/orchestra spec-to-code` authoring a single PRD results in a feature node, an artifact node, and a `declares` edge in the graph.
- Brownfield install plus `/orchestra code-to-spec` triggers bootstrap; graph contains symbol nodes for Java source files in `src/**`.
- Renaming an existing openapi operation produces a dangling `contract-op` edge; `graph_diagnostics` surfaces it; the next preflight reports it.
- `graph_query` returns the transitive closure for any `feature/<svc>/<id>` in under 100 ms on graphs of up to 10 000 nodes.
- Sync hook disabled, then a manual write, then sync re-enabled, results in a drift row surfaced at next preflight.

---

## Stage 2 — cross-service tier and reuse-reviewer subsystem

**Goal.** Project a workspace-level view of cross-service edges, surface candidates via dispatcher questions, enforce reciprocal-contract and shared-entity gates via graph lookups, and add a two-stage reuse-reviewer (graph similarity pre-filter plus sub-agent semantic review) that forces upsert-over-create on new chain artifacts.

### Cross-service tier touchpoints

- `.orchestra/system-features.yaml` is a projection of `cross-service-link` edges from the graph; hand-edits are reconciled at next sync.
- New schema `schemas/system-features.schema.json` carries the workspace-tier edge shape.
- New schema `schemas/glossary.schema.md` carries the entity glossary shape; `shared_entities` references on links resolve here.
- New schema `schemas/brownfield-heuristics.schema.md` defines the named heuristic registry; `provenance.evidence` of form `tool:<heuristic-id>` resolves here.
- `schemas/pipeline-artifact.schema.md` extends to declare `system-features.yaml` and `glossary.yaml` as chain artifacts.
- `hooks/scripts/pre-write-check.js` adds gates: link-provenance-anchor (confirmed mode requires deterministic evidence) and link-glossary-presence (shared-entity links require glossary entries on both sides).
- `commands/orchestra.md` Phase 3 dispatcher computes a one-hop closure via `graph_query` and injects a `## Linked context` section into every spawn brief. Closure depth is configurable; default one hop.
- `agents/product.md` opens with a cross-service interaction question whose options are populated from `graph_query` of cross-service features. The same question mirrors in `agents/analyst.md` during FRS authoring.
- `agents/architect.md` brownfield derivation routes through the heuristic registry and writes `provenance.evidence` of form `tool:<heuristic-id>:<ref>` for every derived link.
- `agents/reviewer.md` gains an `S-LINK-REVIEW-001` TSR section and an accept-provenance flow.
- `agents/evaluator.md` Phase 4 blocks pipeline lock when any link in the active feature set has `provenance.review_status: pending`.
- `mcp-servers/orchestra-utils.js` adds `upsert_system_features`, `accept_link_provenance`, and `upsert_glossary` tools.

### Reuse-reviewer subsystem touchpoints

- New hook script `hooks/scripts/reuse-review-gate.js` runs PreToolUse on `Write|Edit|MultiEdit` for path matchers covering both surfaces. Chain-artifact creation paths: `docs/**/*-PRD.md`, `docs/**/*-FRS.md`, `docs/**/*-TDD.md`, `docs/**/*-openapi.yaml`, `docs/**/*-clientapi.yaml`, `docs/adr/*.md`. Implementation-surface creation paths (Java first): `src/**/*.java` filtered to new file creation (not edits to existing files, which target a different motion). The hook is opt-out per surface via `ORCHESTRA_HOOK_REUSE_REVIEW_DOCS=off` and `ORCHESTRA_HOOK_REUSE_REVIEW_SRC=off`.
- New agent `agents/reuse-reviewer.md` is a strict read-only sub-agent invoked by the gate when graph similarity surfaces candidates. Allowed tools: `Read`, `mcp__orchestra-graph__graph_query`. Disallowed: `Bash`, `Write`, `Edit`, `MultiEdit`.
- New MCP tool `mcp__orchestra-graph__similar_nodes(kind, content_hash, attribute_hint, top_k)` returns ranked candidates with similarity scores.
- `commands/orchestra.md` documents the reuse-review interaction protocol so primary agents (`@product`, `@analyst`, `@architect`) handle the advice signal cleanly.

### Reuse-reviewer subsystem behaviour

The subsystem is two-stage by design: a fast deterministic pre-filter via the graph, and a slower semantic review via a sub-agent. This split matches Story #2's trade-off explicitly — the cost of the review only fires when the cheaper filter says there is something worth reviewing.

**Pre-filter stage.** The reuse-review hook fires PreToolUse on chain-artifact creation **and** on new source-file creation. It computes a similarity signature on the candidate content. For chain artifacts: kind (PRD, FRS, TDD, openapi, ADR), declared title or summary, declared scope (service, feature-id, domain), and a content fingerprint over identifier-bearing sections. For source files: kind (class, interface, enum, record), declared type name, package, top-level method signatures, and a content fingerprint over method bodies. The signature feeds `similar_nodes` against the graph, requesting top-three candidates of the same node-kind above a configurable similarity threshold (default 0.55 for chain artifacts, 0.65 for source — code tolerates less false-positive friction). If the call returns empty, the gate allows the write to proceed and emits no signal.

**Semantic-review stage.** If candidates exist, the gate suspends the write and spawns `@reuse-reviewer` with a structured brief containing: the candidate content, the top-three similar nodes (loaded by path from the graph), and the canonical question — "is the candidate genuinely new, or should the user update an existing node?" The sub-agent reads candidate plus each similar node in full, applies semantic comparison (for chain artifacts: the candidate's intent, scope, contract surface; for source: the candidate's responsibilities, public API, dependencies), and returns a structured verdict.

**Verdict shape.**

- `reuse_existing(node_id, rationale)` — the candidate is functionally redundant; the primary agent should abandon the new write and add to or refine the existing node.
- `modify_existing(node_id, suggested_diff, rationale)` — the candidate refines an existing node; the primary agent should update the existing node with the candidate's substance instead of creating a duplicate.
- `merge_with(node_id, rationale)` — the candidate covers ground partially overlapping the existing node; the primary agent should consolidate both into the existing node.
- `proceed_new(rationale)` — the candidate is genuinely orthogonal; the gate allows the write.

**Signal protocol.** The hook returns its decision to Claude Code via the standard PreToolUse contract. On `proceed_new` the hook allows the write. On any other verdict the hook returns `decision: "block"` with a structured reason embedding the verdict and the candidate node identifiers; the primary agent is expected to honour the advice (update the existing node) and may retry the write only on a `proceed_new` verdict after reconsidering.

**Cost model.** A semantic review costs one sub-agent invocation per affected write. The pre-filter ensures the sub-agent fires only when candidates exist above the threshold. Story #2's explicit downside (latency and cost per write inside the watched directory) is preserved; the trade is named and accepted.

### Functional requirements (Stage 2)

- Cross-service edges live in the graph as `cross-service-link` edges with attributes `kind`, `contract_ref`, `shared_entities`, `provenance.mode`, `provenance.evidence`, `provenance.review_status`, `rationale`. The workspace YAML is a read-only projection.
- Edge `kind` enum: calls-sync, calls-async-poll, publishes, consumes, shares-entity, shares-db-table, webhook-target.
- Pre-write gates query the graph for endpoint resolution, glossary presence, and reciprocal contract-op existence. JSONPointer parsing is replaced by graph lookup.
- Promotion is manual. Dispatcher reads candidate edges from the graph and surfaces each via `AskUserQuestion`. Brownfield candidates surface as `inferred` rows; user confirms each before write.
- Dispatcher pre-spawn closure walks the graph for any feature appearing in the spawned brief. The closure injects a `## Linked context` section containing linked PRD goals, openapi operation excerpts, and BR-AC slices, capped at 400 tokens per link and 2 000 tokens total, with a summarisation fallback when exceeded.
- Provenance modes: confirmed (requires deterministic evidence — file-line, AST symbol, or named heuristic) and inferred (any evidence including user attestation). `review_status: pending` on inferred edges blocks transitive close in spawn briefs until `@reviewer` accepts.
- `@product` and `@analyst` first-turn questions ask whether the feature interacts with any other service's feature, with options populated from the graph.
- Workspace-global glossary exists before any link with `shared_entities`. Glossary rows carry an `aliases:` map enumerating per-service spellings.
- Brownfield heuristic registry initially ships: feign-client, rest-template, kafka-producer, jdbc-cross-schema, outbox-table, scheduled-poll. The skip-set is enumerated in the registry document.
- The reuse-review hook fires PreToolUse on chain-artifact creation and on new source-file creation, runs the pre-filter against the graph, spawns `@reuse-reviewer` only when candidates exist above the per-surface threshold, and returns a blocking decision on any non-`proceed_new` verdict.
- `@reuse-reviewer` is strict read-only. Allowed tools: `Read` and the graph MCP. The agent receives the candidate content, the top-K similar nodes, the canonical reuse question, and the surface tag (chain-artifact or source); it returns one of the four verdict shapes with a rationale.
- The reuse-review subsystem is env-var opt-out per surface; the default-on posture is intentional per Story #2's framing. Operators may disable on source while keeping it on chain artifacts (or vice versa) via separate env vars.

### Acceptance criteria (Stage 2)

- A three-service test repo with a feature spanning all three services projects two link rows in the workspace YAML; per-service `features.yaml` files are unchanged.
- `@backend` spawn for a linked feature has `## Linked context` populated automatically with linked PRD goals, openapi op excerpts, and BR-AC slices.
- `code-to-spec system` on the test repo surfaces sync HTTP, Kafka producer, and outbox cross-service relationships as inferred link candidates; each candidate carries the heuristic id and evidence path.
- Marking `order/order-001-checkout` deprecated causes all links from or to it to flip to `superseded` at next graph sync.
- Renaming an upstream openapi operation produces a dangling edge in the graph and a preflight diagnostic row.
- A `/orchestra spec-to-code` invocation for a refund flow has `@product` ask the cross-service question; payment-service features appear as options.
- Authoring a new PRD highly similar to an existing one triggers the reuse-review gate; the graph similarity pre-filter returns the existing PRD as a candidate; `@reuse-reviewer` returns `modify_existing` with rationale; the hook blocks the write; the primary agent updates the existing PRD instead of creating a duplicate.
- Authoring a genuinely orthogonal new PRD triggers the pre-filter, returns no candidates above threshold, and the write proceeds with zero sub-agent cost.
- Creating a new Java class with a public API substantially overlapping an existing class in the same module triggers the source-surface reuse-review gate; `@reuse-reviewer` returns `merge_with` pointing at the existing class with a method-level diff suggestion; the hook blocks the create; the primary agent extends the existing class instead.
- Creating a new Java class for a genuinely new responsibility (no similar public API in the graph) proceeds with a single pre-filter call and zero sub-agent cost.

---

## Stage 3 — reviewer UX, link lifecycle, epic grouping

**Goal.** Batch reviewer questions during parallel spawn phases, decouple link authoring from contract authoring ordering, extend audit-trail to workspace YAML, and add optional feature grouping.

**Touchpoints.**

- `commands/orchestra.md` Phase 3 gains a candidate-reconciliation sub-phase after parallel spawns complete; candidate links surfaced grouped by downstream feature.
- `hooks/scripts/pre-write-check.js` extends the changelog-append-only gate to `.orchestra/**/*.yaml`.
- `mcp-servers/orchestra-utils.js` adds a `mutate_link` tool enforcing row mutation plus `# Changelog:` row in a single Write.
- `schemas/system-features.schema.json` extends with a lifecycle field (`provisional` or `promoted`) and an optional `epic_id`.
- `schemas/codegraph.schema.md` extends with an `epic` node kind and grouping edges.
- `agents/architect.md` adds epic authoring during the SAD phase.

**Functional requirements.**

- Parallel spawns write candidate links to `.orchestra/plans/<session>/link-candidates/<agent>.md` (single-writer per agent). The dispatcher reconciles candidates after Phase 3 closes, batched via grouped `AskUserQuestion` per downstream feature.
- Link lifecycle: provisional (both endpoints exist, contracts may be draft) and promoted (full reciprocal-contract verification passes). Phase 4 blocks pipeline lock on any link still provisional.
- The changelog-append-only gate covers `.orchestra/**/*.yaml`. Row mutation on workspace YAML happens through `mutate_link`, which requires the changelog row and the row mutation in one write.
- Epic is an optional node kind in the graph grouping cross-service features into named epics. `graph_query("epic/<id>")` returns the full transitive closure: features in the epic plus links between them.
- A new dispatcher render shape surfaces the epic walk on demand for reviewer consumption.

**Acceptance criteria.**

- Four parallel spawns each surfacing three candidate links result in four grouped reviewer questions, not twelve sequential prompts.
- A greenfield motion authoring an upstream feature before the downstream service's contracts exist proceeds through provisional state; pipeline lock at Phase 4 blocks until all provisional links promote.
- A hand-edit to `system-features.yaml` outside `mutate_link` is rejected by the changelog-append-only gate.
- An epic grouping four service-features and six cross-service links returns the full set in one `graph_query`.

---

## Cross-stage locked decisions

- Graph store format: SQLite at `.orchestra/codegraph.db`.
- Bootstrap timing: first `/orchestra` invocation when the database is absent.
- Sync-hook scope: narrow path matchers (chain artifacts plus `.orchestra/**`), all write-capable tools (Write, Edit, MultiEdit, indirect MCP writers via shared library).
- Stage sequencing: codegraph primitive first; cross-service tier and reuse-reviewer second; UX polish third.
- Provenance modes: two — confirmed and inferred.
- Closure depth: one hop by default; configurable to N hops with cycle break.
- Spawn-brief token budget: 400 tokens per link, 2 000 tokens total, summarisation fallback.
- `link_id` allocation: monotonic projection label; the graph node-id is the canonical identity.
- Provisional vs promoted lifecycle: in scope (Stage 3).
- Multi-agent candidate reconciliation: in scope (Stage 3).
- Workspace YAML audit-trail extension: in scope (Stage 3).
- Epic grouping: in scope (Stage 3).
- Stale-link rot, drift after upstream rename, and `link_id` merge-collision: subsumed by the graph primitive in Stage 1.
- Reuse-reviewer: in scope (Stage 2). Default-on. Env-var opt-out.

---

## Open design questions

These resolve during the design phase, not in this brief.

- SQLite schema DDL: exact column types, indexes, foreign-key constraints, and edge attribute serialisation (JSON blob versus normalised tables).
- Bootstrap walk order: `docs/` first or `src/**` first.
- Concurrency control: file-lock plus SQLite `BEGIN IMMEDIATE`, or `BEGIN IMMEDIATE` alone.
- `graph_query` MCP surface: SQL pass-through versus fixed query grammar.
- Glossary file location: `.orchestra/glossary.yaml` versus `docs/glossary.md`.
- Heuristic-id namespace: per-language or workspace-global.
- Epic node versus feature-group edge representation in the graph.
- Reuse-review similarity thresholds: per-surface defaults (0.55 chain, 0.65 source) need empirical tuning from preflight metrics. Token-overlap fraction versus embedding cosine (requires an additional MCP) versus combined heuristic is a separate sub-question.
- `@reuse-reviewer` token budget: how much of each top-K candidate to load (full file versus declared-sections-only versus method-signatures-only) given the per-write latency cost. Source-side budget likely tighter than docs-side because writes are more frequent.
- Source-surface AST extractor location: ships inside the codegraph MCP, as a sidecar process, or as a Tree-sitter integration. Affects cold-start cost and bootstrap walk speed.
- Source-surface language rollout sequencing: which non-Java language ships second (Kotlin closest to Java AST, TypeScript highest user prevalence, Python easiest grammar). Tracked as language-pack motions, not folded here.
- Cost-model calibration: chain-artifact writes happen tens of times per pipeline run; source-file creations happen hundreds of times. The reuse-review hook latency budget must respect the higher source-side frequency without bottlenecking implementation.

---

## Non-goals

- Cross-workspace federation (multiple monorepos sharing a graph).
- Language coverage beyond Java AST extraction in this motion. Kotlin, TypeScript, Python, and Go ingestion are language-pack motions added once each language gains an AST extractor; they reuse the same graph, sync hook, and reuse-reviewer infrastructure.
- Replacement of existing per-service `features.yaml` files; they remain authoritative for intra-service edges and are projected into the graph.
- Real-time graph synchronisation across multiple concurrent Claude Code sessions on the same workspace.
- Embedding-based semantic search; the graph is symbolic. Embedding similarity for the reuse-reviewer is an open question, not a commitment.
- Replacement of `@evaluator` or `@reviewer` capability; both gain new TSR rows but their authorities are unchanged. `@reuse-reviewer` is a new, narrowly-scoped agent — it does not displace either of the existing evaluators.
- Reuse-review on *edits* to existing source files. The source-surface gate covers new-file creation only; in-place edit deduplication (refactoring duplicate logic inside an existing class) is a separate motion if pursued.
