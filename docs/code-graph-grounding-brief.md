# Code-graph grounding brief

Target state for the deterministic Java code-graph layer that grounds the brownfield reverse chain. Three tiers. Java-first.

## Problem

The `code-to-spec` reverse chain derives `openapi.yaml` / TDD / SAD from an LLM reading `src/**`. Source structure (endpoints, entities, call edges) is re-inferred by prose each run — the fabrication surface flagged in reverse-pass prompt discipline. There is no deterministic floor.

## Principle

The LLM does semantic judgment (summaries, feature boundaries, ADR-worthiness). A bundled script does all structural extraction. The script is the **sole** extraction path — agents never hand-walk `src/**` to re-derive structure when a graph exists. Trust the graph; do not re-parse.

## Parser decision

- Parser is **native `tree-sitter` bindings, provisioned on demand** — the model UA uses (`/understand` Phase 0 runs `pnpm install` + build in the cached plugin on first invocation).
- `skills/java-development/package.json` pins `tree-sitter@0.21.1` + `tree-sitter-java@0.23.5`. The skill preflight runs `npm install --prefix <skill-dir>` once per session; the extractor resolves the bindings via the upward `node_modules` walk. `node_modules` is gitignored — never committed, never shipped.
- Consumer requirement: Node ≥18, npm, and a C toolchain (node-gyp / python3 / compiler). Missing toolchain → preflight STOPs with an explicit message; no LLM structural fallback.
- CI provisions via `pretest:java-graph` (`npm install --prefix skills/java-development`); the native build stays opt-in so unrelated `npm install` runs are not taxed.
- Native over WASM: full tree-sitter language breadth and the canonical binding; the cost is the build toolchain, surfaced as a hard preflight gate.

## Graph schema

Persisted JSON validated against `schemas/code-graph.schema.json`. Stable deterministic IDs enable dedup + incremental diff.

Node id grammar:

| Kind | id |
|---|---|
| type | `class:<fqcn>` · `interface:<fqcn>` · `enum:<fqcn>` |
| method | `method:<fqcn>#<name>` |
| field | `field:<fqcn>#<name>` |
| endpoint | `endpoint:<HTTP-METHOD> <path>` |
| table | `table:<name>` |

Type nodes carry `stereotype` (`rest-controller` · `service` · `repository` · `entity` · `component` · `config` · `kafka-listener` · `scheduled` · `null`), `annotations`, `file`, `range`. Method nodes carry `signature`, `transactional`, `annotations`.

Edge types: `contains` (type→member), `imports` (type→type, from import stmts), `injects` (type→type, DI field/ctor), `exposes` (controller→endpoint), `persists` (entity→table), `extends` / `implements`, `listens` (method→topic via `target` channel), `calls` (method→method, heuristic — receiver resolved through injected field type within the declaring class; `confidence` field marks it). Each edge carries `evidence`.

Resolution rules (deterministic):

- `imports` target = FQCN from the `import` statement. External (non-project) targets dropped at merge.
- Same-package simple-name reference resolves via `package + simpleName`.
- `injects` from `@Autowired` field type and constructor parameter types.
- `calls` only when the receiver is a field whose declared type resolves to a project type; otherwise omitted (no speculative edges).

## Tier 1 — extractor + grounding

- `skills/java-development/scripts/extract-java-graph.mjs` — input: JSON `{ projectRoot, files:[{path}] }` + output path. Loads native `tree-sitter`/`tree-sitter-java`, walks each file's AST, emits one graph JSON `{ version, nodes, edges, unresolved, parseErrors }`. Self-resolves intra-run imports/injects/calls (interface/enum targets included); leaves external + cross-batch targets in `unresolved` for the merge step. Per-file parse errors are recorded, not fatal.
- `@explorer` runs the extractor FIRST, then authors `S-FEATURES-DISCOVERED-001` / `S-ADR-CANDIDATES-001` from graph facts — endpoint count + entity count + integration edges feed the complexity rubric instead of eyeballed LOC. Read-only on source preserved; the graph JSON lands under the discovery dir, not `docs/`.
- `@architect` reverse-pass derives `openapi.yaml` paths from `exposes`→`endpoint` nodes, entities from `persists`→`table`, `S-CONFIG-001` liveness from `injects`/`calls` edges. The graph is the canonical structural input; `src/**` re-reads only for semantics the graph does not carry.
- `skills/java-development/SKILL.md` documents the extractor as the sole structural path (no hand-rolled fallback parser).

## Tier 2 — batching + merge-recover

- `compute-graph-batches.mjs` — dependency-free light scan (package/import line regex); partitions the file list into import-neighborhood batches (union-find + same-package cohesion) bounded by `maxBatch` (default 40); emits `batches.json` with a per-batch `neighbors` list (project FQCNs imported from other batches) as a resolution hint.
- Batching is **intra-`@explorer`**, not a new cross-agent fan-out: one `@explorer` per service stays the parallelism axis (single-writer discovery report). A large service's `@explorer` extracts each batch sequentially into `graph-batch-<i>.json`, then merges. Cross-service parallelism is unchanged (dispatcher fans out one `@explorer` per service in one message).
- `merge-java-graph.mjs` — unions batch fragments, promotes each batch's cross-batch `unresolved` ref to a real edge when the target type now exists in the union, dedups nodes by id + edges by `(source,target,type)`, drops dangling, emits a stderr report (`recovered` / `dropped-dangling` / `deduped` / `still-unresolved`). Batch+merge is provably equal to the single-pass graph.
- `@architect` reverse-pass reads the merged graph + `merge.stillUnresolved` tail; recovers only graph-backed edges, never speculative ones. Deterministic-fix-first, LLM-recover-second.

## Tier 3 — fingerprints + incremental

- Baseline persists per-service at `<context_path>/.orchestra/<service>/code-graph/{graph.json, fingerprints.json, meta.json}` (`meta.json` = `{ commit, builtAt }`). `@architect` writes it at reverse-chain close.
- `build-graph-fingerprints.mjs` — hashes each file's structural identity (node id+kind+stereotype+signature+transactional+route, plus source-anchored edges) into `fingerprints.json`. Line ranges are excluded, so comment/whitespace edits hash identically.
- `classify-graph-diff.mjs` — diffs a re-extracted graph against the baseline; emits `{ structural, added, removed, unchanged, rederiveCount }`. The dispatcher pins Phase-3 reverse-pass to features touching `structural` + `added`; `unchanged` features keep locked artifacts.
- `hooks/scripts/code-graph-stale.js` — `SessionStart` + `PostToolUse(Bash)` git-commit: scans `.orchestra/*/code-graph/meta.json`; on stored commit ≠ HEAD, emits a one-line notice (SessionStart → additionalContext; post-commit → stderr). Silent when no graph / not a git repo. Toggle `ORCHESTRA_HOOK_CODE_GRAPH_STALE`; registered in `hooks.json` + both manifests.

## Out of scope

- Non-Java grammars (Go/Python/Kotlin) — per Java-first focus; the extractor is grammar-pluggable but ships Java only.
- Full type resolution / overload disambiguation — `calls` stays heuristic at field-type granularity. jdtls-grade resolution is not a shipped-plugin dependency.
- Dashboard / visualization — orchestra emits specs, not graphs-as-product.

## Distribution checks

- Only `package.json` + `scripts/*.mjs` ship under the skill; `node_modules` is gitignored and provisioned at consumer preflight.
- No migration paths (blank-install assumption).
- Graph JSON lives under `.orchestra/plans/<session>/discovery/` — never `docs/`, never `src/**`.
- `schemas/code-graph.schema.json` carries shape only.
