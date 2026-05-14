# Changelog

All notable changes to orchestra are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **Root `LICENSE` file** — MIT text matching `package.json` / `plugin.json` declarations. Makes SPDX scanners and GitHub auto-detect work.

### Changed

- **README rewrite** — restructured against the per-plugin reference style: counts in section headers (`## Skills (10)`, `## Agents (8)`, `## Hooks (7)`, etc.), one table per component kind, env-var opt-out registry inlined, dev-surface markdown links removed. Fixes drift the 2026-05-14 audit caught (stale counts, phantom `project-discovery` skill, fictional subcommand names `ship`/`report`/`resume`/`help` that no longer exist in `commands/orchestra.md`, links into `manifests/` and `scripts/`).
- **CLAUDE.md rewrite** — top-loaded with a tight Rules section mirroring the reference repo's discipline; substantive sections (two-surface, version-stamp, annotation-creep, release-workflow) preserved below the fold. Dropped the standalone "Scope discipline" block (folded into Rules) and the "Hook script comments — lower priority" subsection (already covered by fold-up principle).

### Removed

- **`hooks/scripts/orchestra-statusline.sh`** — never wired into `plugin.json.statusLine`; trimmed as dormant orphan along with its `4i.*` test block in `scripts/tests/metrics.test.js`. The v4.1 entry below remains as the historical record of when the script was first added.

## [4.3.2] — 2026-05-14

Patch release covering the consumer-side plugin install summary, an audience-boundary seal on `docs/`, removal of the T-A/B/C/D tier enumeration from consumer surface + validator + dev docs (replaced by per-role `disallowedTools`), a terse-pass over agents and the `/orchestra` dispatcher prose, and a tightening of the C4 zoom-continuity Step 1b protocol after it failed to bite in an authoring session.

### Added

- **`docs/` link discipline** — normative section in `schemas/pipeline-artifact.schema.md` forbidding codebase paths, external URLs, `.orchestra/` siblings, and project-root files inside any `docs/*` artifact body. SAD template + CSD schema carry one-line pointers, not restatements.
- **Workspace-global ADR index** — `S-ADR-INDEX-001` relocates out of SAD and per-service CSD to `.orchestra/inventory/adr/index.md` with `S-GLOBAL-001` + `S-SERVICES-001` anchors. Schema at `schemas/inventory.adr-index.schema.md`. Individual ADR bodies stay under `docs/`; only the index relocates.

### Changed

- **Agent frontmatter shape** — all 8 agents migrate from the closed T-A/T-B/T-C/T-D tier allowlist to Claude Code's official `disallowedTools` denylist (`@product` / `@architect` / `@lead` / `@evaluator` ban Bash/Edit/MultiEdit; `@reviewer` keeps Bash for static analysis; `@backend` / `@frontend` ban Bash; `@test` declares neither). Each agent's `## Tier` body heading becomes `## Allowed surface`.
- **Agent validator** (`scripts/tests/agents.test.js`) — Check 4 drops the closed-tier toolset enumeration in favor of a per-role `FORBIDDEN_TOOLS_PER_AGENT` map; accepts either allowlist or denylist shape per agent (XOR), and now parses the comma-separated `tools:` string form documented in the official subagents docs.
- **"Tier-A" rule names** — three sites rename "Tier-A single-writer invariant" → "Single-writer invariant" (`skills/code-review/SKILL.md`, `agents/evaluator.md`, `agents/reviewer.md`). Two dev-surface narratives drop residual T-A / T-C labels (`README.md` Architecture + table row, `docs/blog-orchestra-technical.md` Tier Separation heading + table). Repo-wide `\bT-[ABCD]\b` now matches only `CHANGELOG.md` history.
- **Consumer-surface terse pass** — prose tightening across the 8 agents and `commands/orchestra.md`. Same rules, shorter wording. Stale v4.0/v4.1 planning briefs drop from `docs/`; three official-doc scrapes (agent-teams, hook-guide, skill-authoring) added under `docs/` for maintainer reference.

### Fixed

- **`plugin.json` install summary** — drop the explicit `agents` + `commands` arrays. Claude Code's manifest treats custom paths as supplements (not replacements) for the default `agents/` and `commands/` auto-discovery, so listing every file caused each component to register twice and the consumer-side "Installed components:" summary lost the Agents/Commands buckets in the dedup.
- **C4 zoom-continuity Step 1b** (`skills/c4-diagrams/SKILL.md`) — restructure the three declarative rules into a four-step numbered action protocol opening with a literal Read-parent step. Lead with the three named failure modes (missing parent boundary, dropped actor across the seam, wrong outer wrap at L2/L3). Generalize the wrong-outer-wrap rule to cover the symmetric L3 trap. Worked counter-examples relocate to `references/c4-rules.md` with abstract placeholders so consumers can't lift them as ghost templates.

## [4.3.1] — 2026-05-14

Patch release: align consumer-surface lifecycle prose with `pre-write-check.js` Gate-A semantics. Six sites where sequential `Edit` calls could trip Gate-A mid-sequence — the on-disk `status: locked` read meant the second Edit was rejected when prose listed the status-flip first. Fix shape across the family: state status-flip LAST in every ordered lifecycle; drop phantom "carve-out matching the local.yaml exception" cross-cites that referenced a hook exception that never existed.

### Fixed

- **`skills/brownfield-inventory/SKILL.md`** — inventory accept step flips `user_gate: pending → accepted` before `status: draft → locked`; `decisions.pending_count == 0` precondition moved up-front.
- **`commands/orchestra.md` run-plan approval** — both brownfield (line 208) and greenfield (line 215) branches reordered so `run_plan_status: drafted → approved` lands before `status: draft → locked` on `run-plan.md`, and `local.yaml`'s three terminal-state writes (`auto_mode`, `run_plan_status`, `status`) land with `status` last.
- **`commands/orchestra.md` lock-lifecycle invariant** (line 178) — clarified staggered lock points: `system.yaml` at step 12 cache-persist, `local.yaml` at run-plan approval (no "after first answer cache" claim that contradicted the run-plan-approval writes).
- **`commands/orchestra.md` phantom carve-outs** (lines 513, 532) — dropped "(parent-context carve-out, mirrors `system.yaml` / `local.yaml` exception)" parentheticals. Metrics-runs `<run-id>.json` has no frontmatter so no gate fires; TSR top-level `status` stays `draft` through `/orchestra ship`'s `ship:` write so Gate-A doesn't trip.
- **`hooks/scripts/pre-write-check.js` Gate-A stderr** — dropped the "or transition status to draft via Edit" suggestion. That recovery path is impossible because the corrective Edit is itself rejected by Gate-A; only `ORCHESTRA_HOOK_PRE_WRITE_CHECK=off` works.
- **`agents/architect.md` CSD lock** — explicit "then flip `status: locked`" so the three-count + status frontmatter sequence is unambiguously ordered.

## [4.3.0] — 2026-05-14

Minor release: post-v4.2 hardening across consumer-surface discipline, brownfield workflow, and artifact-grain rules. PRD/FRS gain business-rule anchors (BR/AC) and a tech-leakage prohibition; FRS use-case diagrams require an end-user actor; C4 placement moves L3/L4 into service folders with parent→child zoom continuity enforced. CSD becomes living service-grain state (no feature attribution; `S-CONTRACT-001` dropped, stability shifts to the `.yaml` extension). ADRs split global vs service-scoped, gated by a three-test worthiness check. Brownfield source-explore dual-modes implementers, mints `S-FEATURES-001` rows at user-journey grain, and folds slug-minting into the inventory accept; `local.yaml` lock flip is now atomic. Cost-tier toggles let evaluator/reviewer run on Sonnet 4.6 with a `verdict_mode` opt-back to Opus. `validate.js` adds version-stamp, phase-tag, and hook-parity predicates; `bootstrap-consumer-claude-md` moves to `hooks/lib/` for the hook-dir contract. `S-OPEN-Q-001` is dropped — open questions become a hard-pause before lock, not an artifact anchor. Workflow doc updated to commit-derived CHANGELOG aligned with Conventional Commits 1.0.0.

### Added

- **`clientapi.yaml`** — consumer-side OpenAPI doc for outbound HTTP dependencies (companion to `openapi.yaml` for inbound surface). Implementers author one per service in brownfield + greenfield.
- **BR/AC anchors** — `S-BR-001` (business rules) + `S-AC-001` (acceptance criteria) on PRD (system grain) and FRS (service grain). Anchors complement the existing chain instead of replacing it.
- **Three-gate ADR worthiness test** in `skills/write-adr/SKILL.md` — routes a decision to ADR vs lighter artifact (inline note, CSD invariant, FRS anchor). Prevents ADR sprawl on every routine choice.
- **Brownfield source-explore dual mode** — implementers (`@be`, `@fe`, etc.) run an exploratory pass before drafting, producing an `intel` artifact captured under the run. `S-FEATURES-001` rows mint at user-journey grain (not technical grain) and slug-minting folds into the inventory user-accept.
- **`verdict_mode` toggle** on `local.yaml` — `cost` (default; evaluator + reviewer on Sonnet 4.6) vs `quality` (Opus 4.7). Verdict-tier downgrade is opt-out, not opt-in.
- **`validate.js` predicates** — `findVersionStamps` (catches `v4.X`-style stamps + migration narration in consumer surface), phase-tag presence on `Agent({...})` spawns, hook-parity between `hooks/scripts/` and `hooks/lib/`. All wired into the main walk.
- **End-user actor requirement** on every FRS use-case PlantUML diagram — caught a class of diagrams that drew internal-call flows masquerading as use cases.
- **C4 parent→child zoom continuity** rule — every child diagram must zoom into a parent container/component; orphan diagrams fail diagram-lint.

### Changed

- **CSD lifecycle → living service-grain state.** `<service_name>-CSD.md` no longer attributes lines to features; it represents the *current* shape of the service. Feature-diff context moves to line comments on C4-L3/L4 diagrams.
- **C4-L3/L4 placement** — diagrams live under `docs/<service_name>/diagrams/` (not the feature folder), with feature-diff line comments tagging what changed per pipeline run.
- **ADR scope split** — global ADRs at `docs/decisions/`, service-scoped ADRs at `docs/<service_name>/decisions/`. The worthiness gate routes a decision to one or the other.
- **PRD/FRS discipline** — body MUST NOT contain tech-leakage (framework names, library choices, infra terms). Tech choices belong in TDD / ADR / CSD, never in product or functional prose.
- **Agents** — minimal-lift persona graft (each role gains a short voice block without bloating the system prompt), phase-tag emission canonical rule consolidated, tone hits added, routing taxonomy unified across `commands/orchestra.md` and per-agent prompts.
- **Hooks dir contract** — `bootstrap-consumer-claude-md` moved from `hooks/scripts/` to `hooks/lib/` (it's a library imported by other handlers, not a top-level event handler). `validate.js` enforces the script/lib split.
- **Agent frontmatter** — `context_mode` aligned across `agents/*.md`; `agents/test.md` description tightened.
- **Implementer model tier** — downgraded to Sonnet 4.6 (was Opus 4.7) for cost; quality-mode opt-in still routes Opus.
- **Manifests** — `agent-plan-sync` registered in `manifests/install-modules.json`.
- **`commands/orchestra.md` consumer-surface scrub** — version stamps + migration narration removed (matches the no-version-stamps rule in CLAUDE.md).
- **Release workflow doc** — `docs/sdlc_knowledge.md` aligned with Conventional Commits 1.0.0; CHANGELOG is now explicitly commit-derived (group by type, compute SemVer as max).

### Removed

- **`S-OPEN-Q-001` anchor** from PRD/FRS — open questions no longer materialize as a chain artifact. Authoring agents hard-pause and surface unresolved questions in the approval dialogue before lock; once locked, no open-question anchor persists. (Breaking for any consumer that referenced `S-OPEN-Q-001` cells — none exist in blank installs.)
- **`S-CONTRACT-001` anchor** from CSD — contract stability moves to file extension semantics (`.yaml` = stable, `.draft.yaml` = drafting). The anchor was double-bookkeeping with the OpenAPI file itself.

### Fixed

- **Brownfield inventory accept** — `local.yaml` lock flip is atomic on user-accept (was previously two writes with a window where lock was unset but mode was committed).
- **Consumer-surface version stamps** — removed lingering `v4.0` / `v4.2` stamps and migration narration ("X is GONE in v4.Y") missed by the v4.2.0 scrub.

---

## [4.2.0] — 2026-05-13

Minor release: bundled six-track refactor producing the v4.2 layout. Drops `scope_path` for `service_name`, collapses the two-tier `.orchestra/` into a workspace-root partition (`.orchestra/<service_name>/`), splits `inventory.md` into workspace-classification + per-service CSD, adds `scope_level` and `tsr_gate_mode` enums (deferred-TSR fan-out + ship-time tolerance), wires a completion-parity probe with `INCOMPLETE` marker, simplifies `/orchestra ship` to a commit gate (no smoke, no RELEASE/RUNBOOK authoring, no push/tag), and lands the new `commit-message` skill carrying Conventional Commits 1.0.0 + mandatory AI `Co-Authored-By:` trailer. Phase-tag emission (originally drafted as v4.1.3) merges into v4.2.0. Forensic motivation: a real 2h, $84.68 brownfield reverse-doc run on `vngg-pay-docs/new-docs/project-poc/services/order/` shipped 3 of 6 promised features with `cost-by-phase.json` collapsed to bucket `unknown`, `inventory.md` mixing workspace + per-service concerns, and `/orchestra ship` opinionated for release flows the consumer doesn't run. Spec-panel + background-swarm findings consolidated in `/Users/lap16318/.claude/plans/spicy-napping-kay.md`.

### Added

- **CSD per-service singleton** — `docs/<service_name>/<service_name>-CSD.md`. Required anchors: `S-OWNED-001` (owned schema + tables + error namespace), `S-CONTRACT-001` (frozen HTTP/Kafka surface), `S-INVARIANTS-001` (cross-feature invariants), `S-SUB-CAPABILITIES-001` (index). Authored once per service under `mode: brownfield` + `scope_level ∈ {container, service}`. New `schemas/csd.schema.md` documents the shape; `@architect` is the sole writer at `phase: discovery`.
- **`local.yaml` fields**: `service_name` (required; directory-basename identity), `scope_level` (`service | container | capability`), `tsr_gate_mode` (`blocking | deferred`, default `blocking`), `incomplete` (boolean). Closed allowlist preserved (`additionalProperties: false`).
- **`<feature-id>-DRAFT-COMPLETE.md` marker** — written by `@lead` at openapi-locked fan-out join under `tsr_gate_mode: deferred`. The dispatcher's ship-gate reads it to tolerate absent verdict cells when `@evaluator` / `@reviewer` are still running async.
- **`<run-id>-INCOMPLETE.md` artifact type** — written by the dispatcher's terminal-state parity probe when `S-FEATURES-001` rows lack their full chain-artifact set per `chain_rigor`. `runs/<id>.json.incomplete: true` patched alongside. New `INCOMPLETE` entry in the artifact-type taxonomy in `schemas/pipeline-artifact.schema.md`.
- **`skills/commit-message/SKILL.md`** — 96-line skill carrying Conventional Commits 1.0.0 canonical format (`<type>[(<scope>)][!]: <description>` + body + footers) with mandatory AI `Co-Authored-By: <model-name> <noreply@anthropic.com>` trailer. Invoked by `/orchestra ship` Step 3; usable standalone for any commit.
- **`S-GATES-001` `tsr_gate_mode_override` column** (optional) in `schemas/run-plan.schema.md` — per-run override of the default blocking gate-mode; `@lead` surfaces this row in approval dialogue when the user requested deferred mode at bootstrap.
- **Phase-tag emission canonical rule** — `commands/orchestra.md` `### Shared rules → ### Phase-tag emission` subsection. Every `Agent({...})` spawn MUST prepend a `phase: <name>\n` line; five literal values: `discovery`, `spec-draft`, `verification`, `gap-resolution`, `gate`. `metrics-collector.js:166` parser unchanged (was already correct; bug was in writers).

### Changed

- **`.orchestra/` layout** — workspace-global state (`system.yaml`, `inventory.md`, `manifest.json`, `events.jsonl`, `metrics/`) at `<context_path>/.orchestra/` root; per-service execution state partitioned under `<context_path>/.orchestra/<service_name>/` (`local.yaml`, `run-plan.md`, `pipeline/`, `tasks/`). Symmetric with the `docs/` layout: project-level singletons at `docs/` root, per-service prose under `docs/<service_name>/`.
- **`docs/` layout** — per-service partition under `docs/<service_name>/`; per-feature artifacts under `docs/<service_name>/<feature-id>/`. Single-service workspaces still nest (uniform partition, not conditional on `workspace_kind`).
- **`inventory.md`** — workspace-classification only. Required anchors restricted to `S-SCAN-001`, `S-CLASSIFICATION-001`, `S-DECISIONS-001`, `S-WARNINGS-001`. Per-service shape migrated: invariants + contract surface → CSD; feature slugs + chain plan → `run-plan.md S-FEATURES-001` / `S-PHASES-001`; per-feature open questions → PRD `S-OPEN-Q-001`.
- **`/orchestra ship` algorithm** — 5 steps → 3: (1) verify gates from TSR frontmatter with deferred-mode tolerance via `DRAFT-COMPLETE.md`; (2) set TSR `ship:` frontmatter (parent-context carve-out); (3) commit via `skills/commit-message`. **MUST NOT** `git push`, `git push --tags`, or `git tag` — those are external-visibility actions the user owns.
- **`@lead` openapi-locked fan-out join** — branches on `local.yaml.tsr_gate_mode`. `blocking` (default): Stage-2 → `@evaluator` → `@reviewer` sequential before turn end (today's behavior). `deferred`: Stage-2 runs, then `@lead` writes `DRAFT-COMPLETE.md`, spawns `@evaluator ‖ @reviewer` in parallel with `phase: verification`, hands back immediately.
- **Auto-mode invariant** (`commands/orchestra.md` `## Invariants`) — reviewer verdicts (`REVISE` / `BLOCK` / `ALLOW_WITH_GAP`) preserved as blocking by default; deferred per-run via `S-GATES-001 tsr_gate_mode: deferred` row that the user accepted at run-plan approval. Structural-failure halts and `ESCALATE` / `DEADLOCK` emission remain always-preserved (no override).
- **`run-plan.md S-FEATURES-001`** — row shape gains `Sub-capabilities`, `Source anchors`, `State-machine role` columns (absorbing what `S-REGEN-PLAN-001` used to carry in inventory).
- **`@architect`** — CSD added to allowed-set; authored once per service at `phase: discovery`. SAD scope-election precedent reused (singleton shape, scope collapsed to always-per-service for CSD).
- **`@product` PRD authorship** — references CSD by anchor (`see CSD S-INVARIANTS-001`) instead of re-narrating invariants. Soft target ~150 lines per PRD.
- **`schemas/pipeline-artifact.schema.md`** — `## Round-trip gate` → `## TSR gate mode`. Ship-verdict mapping rewritten: `eval_verdict: PASS` + `rev_verdict: APPROVED` → `ALLOW`; `rev_verdict: ALLOW_WITH_GAP` → `ALLOW_WITH_GAP`; (`eval_verdict: FAIL` OR `rev_verdict: REQUEST_CHANGES` OR `rev_verdict: PENDING`) → `HOLD`. Under `tsr_gate_mode: deferred`, absent verdict cells → `ALLOW_WITH_GAP` only when `DRAFT-COMPLETE.md` exists; otherwise `HOLD`.
- **Parent-context carve-out** (`commands/orchestra.md`) — enumerates 5 narrowly-authorized parent writes: `system.yaml`, `<service_name>/local.yaml`, pipeline `INCOMPLETE.md`, `metrics/runs/<run-id>.json incomplete: true` patch, TSR `ship:` frontmatter.

### Removed

- **`scope_path` field** from `local.yaml` (replaced by `service_name`; closed-allowlist rejection on load).
- **`round_trip` field** from `local.yaml` (replaced by `tsr_gate_mode`; v4.1's 4-state enum encoded both intent AND verdict state — split: `tsr_gate_mode` is 2-state intent-only, verdict state lives in TSR frontmatter `eval_verdict` + `rev_verdict`).
- **`registered_services` field** from `system.yaml` (per-service state lives at `.orchestra/<service_name>/` partition, no registry needed).
- **Two-tier `.orchestra/`** placement (workspace `.orchestra/` + per-scope `.orchestra/`). Collapses to single workspace-root `.orchestra/` with per-service subfolders.
- **`inventory.md` per-service anchors**: `S-REGEN-PLAN-001`, `S-INVARIANTS-001`, `S-CONTRACT-FREEZE-001`, `S-OPEN-Q-001`, `S-CHAIN-PLAN-001`. Migrated as documented above.
- **`/orchestra ship` smoke-test step** (pre-RELEASE 5-step install loop). The plugin doesn't match every consumer's deploy/release flow; smoke discipline moves to project CLAUDE.md `## Release-doc authoring` as a user-driven post-commit check.
- **`/orchestra ship` RELEASE / RUNBOOK / ANNOUNCEMENT authoring**. Release artifact authoring is opinionated for one release flow; varied consumer flows mean the plugin authors a commit only. RELEASE-vX.Y.Z.md and RUNBOOK-vX.Y.Z.md still exist as artifact types in the taxonomy for consumers who choose to author them manually.
- **`@ship` agent references** in `skills/task-breakdown/SKILL.md` (owner table, dependency-edge rules, worked example). There was no `@ship` agent in production — `/orchestra ship` is a dispatcher subcommand. T-007 row dropped from worked example; totals updated to 12 SP / 8 SP critical path.
- **Reviewer auto-soften rule** (`agents/reviewer.md`) — `APPROVED → ALLOW_WITH_GAP` conversion under `round_trip: DEFERRED` is gone. `ALLOW_WITH_GAP` remains a legitimate reviewer verdict for "approved with caveat" cases (probe-gap, accepted-as-noted finding) but is NEVER auto-converted. Deferred-mode ship-time tolerance is handled by the dispatcher via the `DRAFT-COMPLETE.md` marker, not by reviewer-side softening.

### Breaking changes (v4.1.x consumer migration)

- `scope_path` rejected by `local.yaml` closed allowlist — workspaces using it fail schema-load.
- Two-tier `.orchestra/` placement no longer recognized — `<scope_path>/.orchestra/local.yaml` won't load.
- `inventory.md` per-service anchors removed — workspaces with the old shape need a manual split per the migration script.
- `/orchestra ship` no longer authors `RELEASE-vX.Y.Z.md` / `RUNBOOK-vX.Y.Z.md` — consumers relying on automated release-doc authoring author them manually post-ship.

The v4.2 dispatcher detects v4.1.x layout (presence of `scope_path` field in any `local.yaml`) and writes `<context_path>/.orchestra/MIGRATION-REQUIRED.md` listing the steps below, halting before any chain spawn.

Manual migration (one-time, per service):

```bash
SVC=order   # repeat per service in registered_services
mkdir -p <context_path>/.orchestra/${SVC}
mv <context_path>/<scope_path>/.orchestra/local.yaml     <context_path>/.orchestra/${SVC}/
mv <context_path>/<scope_path>/.orchestra/inventory.md   <context_path>/.orchestra/${SVC}/inventory-old.md
mv <context_path>/<scope_path>/.orchestra/run-plan.md    <context_path>/.orchestra/${SVC}/
mv <context_path>/<scope_path>/.orchestra/pipeline       <context_path>/.orchestra/${SVC}/
mv <context_path>/<scope_path>/.orchestra/tasks          <context_path>/.orchestra/${SVC}/
mv <context_path>/<scope_path>/docs/*                    <context_path>/docs/${SVC}/
# edit local.yaml: replace `scope_path: <abs>` with `service_name: ${SVC}`
# edit local.yaml: rename `round_trip: DEFERRED` to `tsr_gate_mode: deferred` (or drop entirely for default blocking)
# edit system.yaml: remove `registered_services` array
# manually split inventory-old.md per the CHANGELOG: workspace-classification stays at .orchestra/inventory.md; invariants + contract → docs/${SVC}/${SVC}-CSD.md (new); feature slugs + chain plan → .orchestra/${SVC}/run-plan.md S-FEATURES-001 / S-PHASES-001
```

### Why this is a minor, not a patch

Closed-allowlist invariants of `system.yaml` + `local.yaml` shifted: existing v4.1.x `.orchestra/` layouts won't load against the v4.2 schemas (`scope_path` and `round_trip` rejected; `registered_services` rejected). The PRD / FRS / TDD / openapi / TSR + frontmatter contract is unchanged — consumers' authored chain artifacts survive bytewise. Not a major (v5.0.0) because chain-artifact shape, agent ownership, and the cross-tier write contract are all stable; only bootstrap state and the ship algorithm move.

### Coupling guards (post-merge invariants)

- `validate.js: OK` against v4.2 fixtures (inverse-sanity local.yaml uses `tsr_gate_mode: blocking`, no `round_trip` reference remains).
- Zero `round_trip` / `@ship` hits across `agents/` + `commands/` + `skills/` + `schemas/` (`grep -rn 'round_trip\|@ship' agents commands skills schemas` returns exit 1).
- `tsr_gate_mode` reachable from 7 consumer-surface files spanning agents/commands/skills/schemas.
- Track A schema landed in same commit as the auto-mode invariant rewrite (no silently-inconsistent doc state between schema + invariant).

## [4.1.2] — 2026-05-12

Patch release: run-plan approval gate splits by `local.yaml.mode`. Brownfield now uses Claude Code plan mode (`EnterPlanMode` for source exploration + `ExitPlanMode` for native approval) so `@lead` verifies the inventory's regen feature list against actual source under `<scope_path>/src/**` before proposing the run plan. Greenfield is unchanged.

### Changed

- **`agents/lead.md` §"Bootstrap: run-plan authoring"** — split into brownfield branch (`EnterPlanMode` → explore `<scope_path>/src/**` via Glob/Grep/Read → author plan body into plan-mode designated plan file → `ExitPlanMode` native approval → on accept `Write` body + orchestra frontmatter to canonical `<scope_path>/.orchestra/run-plan.md`; on reject end turn without canonical write) and greenfield branch (direct `Write` to canonical path; no plan mode). Required anchors and frontmatter shape deduped into shared steps — `run-plan.md` schema shape identical across branches.
- **`commands/orchestra.md`** — decision-tree step 14 + "Approval gate (dispatcher, not lead)" now split by `local.yaml.mode`. Brownfield path: dispatcher checks file presence at canonical path post-end-of-turn (present = ExitPlanMode accept; absent = reject + revise loop). Greenfield path: retains `AskUserQuestion(approve|revise)`. Revise-loop semantics, 3-cycle cap, and `auto_mode` / `run_plan_status` writes are unchanged across both branches.
- **`docs/v4.1-brief.md` §16, `docs/v4.1-workflow.md` row 3.5** — target-state prose + workflow row updated to describe the mode split + per-branch verification fixtures.

### Why this is a patch, not a minor

Schema shape is unchanged: `run-plan.md` body, `local.yaml` allowlist, and the dispatcher's approval-outcome contract (`auto_mode: true` + `run_plan_status: approved` on accept) are byte-identical across branches. Greenfield behavior is unchanged from v4.1.1. The brownfield branch adds a verification-only mechanism — plan mode cannot mutate the run-plan schema, skip any failure gate, or bypass the 3-cycle revise cap.

### Smoke status

**Pending.** Doc-only release. The brownfield branch assumes (a) `EnterPlanMode` / `ExitPlanMode` are exposed inside a spawned-subagent context, and (b) plan-mode-exit preserves @lead's turn-context body so the post-accept `Write` to the canonical path doesn't need to re-read the designated plan file. Both need a real brownfield smoke chain to verify; if either fails the brownfield branch needs reshape (dispatcher-side plan-mode wrapper, or two-file shape with explicit body re-read).

## [4.1.1] — 2026-05-12

Patch release: drop the `adapted_template` chain-deviation feature, tighten feature-id slug discipline so brownfield feature folders name *features of the service* (not meta-actions on the codebase), and split `<workspace>/.orchestra/` into two tiers so multi-service microservices workspaces can share workspace-level state across sessions while keeping per-service chain state isolated.

### Removed

- **`template_source` + `chain_mode` fields** — gone from `schemas/local.schema.json`, the `commands/orchestra.md` decision tree (Step 7 elicitation deleted; subsequent steps renumbered), the `local.yaml` YAML block, the `docs/v4.1-brief.md` closed-allowlist table, and the v4.1-workflow Phase 3 task spec. The plugin no longer supports authoring outputs that mirror a consumer-supplied template — agents always emit the canonical PRD/FRS/TDD/openapi/TSR shape. Consumer-supplied intake templates (e.g. `regeneration-doc-template.md`) remain READ-ONLY input whose questions answer inside PRD/FRS/TDD bodies (item #11 rule, unchanged).

### Changed

- **Feature-id minting (`commands/orchestra.md`)** — Step 2 of the minting algorithm now requires brownfield slugs to come from `<scope_path>/.orchestra/inventory.md.S-REGEN-PLAN-001` "Feature slug" column rather than the user's prompt verb. Greenfield / empty-workspace fallback still slugs from the prompt but rejects verb-prefixed names (`regen-*`, `refactor-*`, `redoc-*`, `fix-*`). The previous algorithm produced folders like `001-order-regen` (an action) instead of `001-order-placement` (a feature) because no inventory walk had constrained the slug.
- **`skills/brownfield-inventory/SKILL.md`** — `S-REGEN-PLAN-001` row spec gained a "Feature-slug discipline" clause: domain noun-phrases only, verb prefixes rejected at inventory authoring time. Candidates derive from `project-discovery`'s per-stack "Major feature" heuristic.
- **`skills/project-discovery/SKILL.md`** — "Major feature" heuristic broken out by stack (Spring/Java, Go, Node/TS, Python) with explicit slug-candidate sources (controllers, use-case handlers, domain packages, routers).
- **Two-tier `.orchestra/` for multi-* workspaces** — `<context_path>/.orchestra/` holds workspace-level state (`system.yaml` + `metrics/` aggregated rollup); `<scope_path>/.orchestra/` holds per-service chain state (`local.yaml`, `inventory.md`, `run-plan.md`, `pipeline/`, `tasks/`). Single-repo workspaces collapse both tiers into one dir. The v4.1 brief's `mv <context_path>/.orchestra <scope_path>/.orchestra` rule is replaced with create-don't-move + auto-register: bootstrap creates each tier as needed and appends each new `scope_path` to `system.yaml.registered_services` so subsequent sessions targeting other services under the same context skip the workspace-level prompts.
- **`agents/architect.md`, `skills/brownfield-inventory/SKILL.md`** — `local.yaml.workspace_kind` reads switched to `system.yaml.workspace_kind`.

### Added

- **`schemas/system.schema.json` (new)** — Closed allowlist for `<context_path>/.orchestra/system.yaml`: `workspace_kind` (enum), `context_path` (path), `registered_services` (list of `scope_path`), optional `status`. `additionalProperties: false`.
- **`scripts/validate.js` — `validateSystemYamlContent` pure function** — Mirrors `validateLocalYamlContent` against the new schema; exported for mutation testing. New mutations: (13b) `workspace_kind` in `local.yaml` rejected (must live in `system.yaml`); (13c) unknown field in `system.yaml` rejected by closed allowlist; (13d) invalid `workspace_kind` enum value rejected.

### Why this is a patch, not a minor

The `adapted_template` removal is technically a feature deletion, but the feature was never functional in production — it was schema-allowed and decision-tree-elicited but no chain logic ever branched on `chain_mode: adapted_template` (only the pilot regression at v4.0.x attempted to use it freeform). The two-tier `.orchestra/` is a corrective placement refactor — the v4.1.0 brief's `mv`-based migration was broken for the multi-session microservices case it was supposed to enable. Both changes restore intended behavior rather than ship new capability.

## [4.1.0] — 2026-05-12

Minor release: brownfield-aware bootstrap with the new `brownfield-inventory` skill, closed-allowlist `local.yaml` schema, and `run-plan.md` auto-mode gate replacing N per-phase confirmations with one upfront trust grant. TSR shape consolidated — `S-TEST-001` is a single row table (Stage-1 authors rows with empty `status`/`evidence` cells; Stage-2 fills those cells in place), `S-EVAL-001` collapses to `| id | verdict | reason |` keyed on the row ids. `CONTRACT-NNN.md` artifact type dropped — `openapi.yaml` / `asyncapi.yaml` are first-class types written directly by the `write-contract` skill, with CONTRACT narrative folded into `description:` fields. Three-tier placement (system / service / feature) for SAD / ADR / diagrams formalised in `schemas/pipeline-artifact.schema.md`.

### Added

- **`schemas/local.schema.json` (new)** — Closed 10-field allowlist for `<cwd>/.orchestra/local.yaml`. `additionalProperties: false` — unknown top-level fields fail load. Forbids freeform-prose adapter fields. Validates `autonomy.level` enum, `run_plan_status` enum, and the `auto_mode:true requires run_plan_status:approved` invariant.
- **`schemas/inventory.schema.md` (new)** — Frontmatter + body anchors for `<scope_path>/.orchestra/inventory.md`: `S-SCAN-001` (depth-limited tree), `S-CLASSIFICATION-001`, `S-DECISIONS-001`, `S-REGEN-PLAN-001` (one row per feature the chain will author), `S-WARNINGS-001`. Frontmatter counts must balance against `scan.entries_scanned` when `empty_workspace: false`.
- **`schemas/run-plan.schema.md` (new)** — Frontmatter + body anchors for `<scope_path>/.orchestra/run-plan.md`: `S-CONTEXT-001`, `S-PHASES-001`, `S-FEATURES-001`, `S-GATES-001`, `S-APPROVAL-001`. `revision_cycle ≤ 3` invariant; cycle 4 escalates.
- **`skills/brownfield-inventory/` (new)** — Adaptive-depth tree scan on `<context_path>` (L1–L5 with progressive descent), 6-row first-match classifier (plugin-equivalent SAD, plugin-equivalent ADR, diagram, redundant, stale, out-of-taxonomy), bucket-at-a-time `AskUserQuestion` for migration decisions, empty-workspace short-circuit (emits stub when zero doc-bearing entries). Output gates the chain at `user_gate: accepted` AND `status: locked`.
- **`hooks/lib/safe-fs.js` (new)** — `safeRead` / `safeWrite` / `safeAppend` with `lstat` symlink-rejection, `O_NOFOLLOW` open, and atomic `rename` on writes. `metrics-collector.js` and `agent-plan-sync.js` migrated off bare `appendFileSync` / `writeFileSync`.
- **`hooks/scripts/orchestra-statusline.sh` (new)** — Reads `<cwd>/.orchestra/local.yaml` and emits `[ORCH:<phase>]` for the user's statusline. Whitelist-validates phase name, strips non-alphanumeric, rejects symlinks, caps at 64 bytes.
- **`docs/v4.1-brief.md` (new)** + **`docs/v4.1-workflow.md` (new)** — Plan-of-record for the v4.1 refactor (dev-surface; not shipped to consumers).

### Changed

- **`commands/orchestra.md` bootstrap decision tree** — `workspace_kind` → `scope_path` (candidate-walk for `pom.xml` / `build.gradle` / `package.json` / `go.mod`; free-text fallback) → invoke `brownfield-inventory` → `template_source` → `test_depth` → chain-rigor → autonomy diagnostic → run-plan author + approval gate. `.orchestra/` migration via `mv` when `scope_path != context_path`. Approval flips `auto_mode: true` + `run_plan_status: approved`; subsequent runs skip per-phase confirmation gates while preserving `REVISE` / `BLOCK` / structural-failure halts.
- **`schemas/pipeline-artifact.schema.md`** — Added `ALLOW_WITH_GAP` verdict; `openapi.yaml` / `asyncapi.yaml` promoted to first-class artifact types under the existing taxonomy; three-tier placement table (system at `<context_path>/docs/`, service at `<scope_path>/docs/`, feature at `<scope_path>/docs/<feature-slug>/`). C4 L3 component diagrams capped at 12 components (no methods, no fields, no parameter lists).
- **Agent prompt fan-out** — `@lead` emits `pipeline.phase.start`/`end` events + gap-resolution + `retroactive_adr` handoff. `@architect` gains a Divergences row shape (brownfield, pre-TSR), the writing-style block (assertions not descriptions; no hedging), and the C3 12-component cap. `@product` / `@reviewer` / `@architect` adopt writing-style + allowed-set + diagram-allowlist rules. `@reviewer` gains `ALLOW_WITH_GAP` verdict and openapi/asyncapi presence checks.
- **TSR shape consolidation** — `S-TEST-001` collapses to a single row table; Stage-1 authors rows with empty `status` / `evidence` cells; Stage-2 fills those cells in place (no second table). `S-EVAL-001` becomes `| id | verdict | reason |` keyed on `S-TEST-001` row ids; `validate.js` rejects unknown ids. `validate.js` enforces row-id coverage from `S-TEST-001` into `S-EVAL-001`.
- **`skills/write-contract/` rewritten** — Emits `<feature-id>-openapi.yaml` / `<feature-id>-asyncapi.yaml` directly. CONTRACT narrative folds inline via `description:` fields and a top-of-file `# orchestra:` comment block.
- **`hooks/scripts/metrics-collector.js`** — `pipeline.phase.start` / `pipeline.phase.end` aggregation on spawn-phase transitions; `UserPromptSubmit` injects `local.yaml` `phase` / `round_trip` / `source_lock` context into the model's prompt; reads both subagent transcript layouts (sibling-dir `<parent_sid>/subagents/agent-*.jsonl` and project-root `<sid>.jsonl` fallback) regardless of `spawn_mode`.

### Removed

- **`CONTRACT-NNN.md` artifact type** — folded into `openapi.yaml` / `asyncapi.yaml` `description:` fields. `write-contract` skill no longer emits separate CONTRACT files.

## [4.0.6] — 2026-05-10

Patch release: per-agent execution-plan artifacts wired across all 8 agents, the dispatcher, and a new sync hook. Each spawned agent now drops a PLAN file at `<cwd>/.orchestra/tasks/<run-id>/<agent>/<feature-id>.md` BEFORE its first artifact write or `TaskCreate` call, narrating its approach in `## Approach` and (via the new `agent-plan-sync` hook) mirroring its native Claude Code task list into the file's frontmatter. `/orchestra resume` consults PLAN files first (fine-grained interrupt resumption) before walking the global TASKS.md DAG. Autonomy level (`local.yaml.autonomy.level`) gates whether the agent runs an `AskUserQuestion` to confirm its plan or proceeds silently.

### Added

- **`hooks/scripts/agent-plan-sync.js` (new, sixth hook)** — Owns mutation of per-agent PLAN files. Subscribes to `PreToolUse:TaskCreate|TaskUpdate`, `PostToolUse:TaskCreate`, and `SubagentStop`. Two-phase capture: PostToolUse on `TaskCreate` binds Claude Code's assigned taskId to a `T-NNN` entry in `tasks:` frontmatter; PreToolUse on `TaskUpdate` flips status by that bound id. `SubagentStop` with any non-`completed` task → `status: interrupted`; all completed → `status: done`. Reuses metrics-collector's parent-sid lookup pattern (walks `~/.claude/projects/<encoded-cwd>/*/subagents/agent-<sub_sid>.jsonl` to recover the dispatcher run-id from a subagent's session id). Three-tier feature-id discovery: spawn-prompt grep → most-recent `intent.yaml` → most-recent pipeline dir mtime. Crash-safe: never blocks the underlying tool; opt-out via `ORCHESTRA_HOOK_AGENT_PLAN_SYNC=off`.
- **`schemas/pipeline-artifact.schema.md`** — New artifact type `PLAN`. Stable filename `<feature-id>.md` under `<cwd>/.orchestra/tasks/<run-id>/<agent>/`. Frontmatter: `id`, `type: PLAN`, `agent: "@<role>"`, `run_id`, `feature_id`, `created`, `updated`, `status: pending|in_progress|interrupted|done`, `tasks_pending|in_progress|done` counts, `tasks: [{id, claude_task_id, description, status}]`. Body grammar: `## Approach` (agent-owned narrative) + `## Tasks` (hook-mirrored checklist). Body-grammar carve-out (no `<a id>` anchors), joining `intent.yaml` / `<feature-id>-TASKS.md` / `ESCALATE` / `DEADLOCK` as agent-internal coordination. Distinct from the v3 PLAN type (`--think` artifact under `docs/`, dropped in v4.0); this is a per-agent runtime working-memory artifact under `.orchestra/`, different audience and lifetime.
- **`commands/orchestra.md` "Per-agent plan discipline" shared rule** — Single canonical block under "Shared rules" naming the lifecycle, autonomy-gate table (5 levels × confirm-vs-skip semantics), and source-of-truth boundary (`## Approach` agent-owned; `tasks:` + counts + status + `## Tasks` checklist hook-owned). Invariants block updated to credit `agent-plan-sync` with `tasks:` mutation. Runtime-hooks table grows from 5 to 6 entries with the new hook documented. `/orchestra resume` algorithm Step 3 split into 3a (PLAN scan, fine-grained, primary) and 3b (TASKS.md walk, coarse-grained, fallback).
- **All 8 agents (`product`, `architect`, `lead`, `backend`, `frontend`, `test`, `evaluator`, `reviewer`)** — Workflow Step `0.` added as the first item in each numbered Workflow list. Single line per agent referencing the canonical block (per the project's `update-discipline — fold up, don't sprinkle` rule); `test.md` and `reviewer.md` additionally clarify that one PLAN spans both stages / both review modes.
- **`hooks/scripts/metrics-collector.js`** — Two new event shapes: `agent.plan.task` (PreToolUse on `TaskCreate|TaskUpdate`, tagged with `agent_role`, `claude_task_id`, `task_subject`, `task_status` — gives a per-agent activity audit on every Task* call) and `artifact.written` for plan-file Writes/Edits (recognizes `<cwd>/.orchestra/tasks/<run-id>/<agent>/<feature-id>.md` paths, emits `artifact_type: PLAN` with `agent_role`, `plan_run_id` keys).
- **`scripts/tests/agent-plan-sync.test.js` (new)** — 25 assertions across 6 cases: opt-out (env=off emits allow envelope), `PostToolUse(TaskCreate)` creates plan + appends `T-001` with bound `claude_task_id`, `TaskUpdate` flips status + counts + checklist annotation, last-task completion flips plan to `status: done`, `SubagentStop` with open tasks flips to `status: interrupted`, idempotent reopen on duplicate `TaskCreate`. Sandboxes a fake `~/.claude/projects/<encoded-cwd>/<parent_sid>/subagents/` layout under tmp HOME so the hook's session-walk runs deterministically against UUID-shaped parent sids and short-hex subagent ids (matches Claude Code's actual file-naming).

### Changed

- **`hooks/hooks.json`** — Three new registrations: `PreToolUse:TaskCreate|TaskUpdate` (agent-plan-sync + metrics-collector), `PostToolUse:TaskCreate` (agent-plan-sync), `SubagentStop` (agent-plan-sync runs alongside metrics-collector).
- **`scripts/tests/hooks.test.js` `KNOWN_TOOLS` allowlist** — Added `TaskCreate`, `TaskUpdate`, `TaskList`, `TaskGet`, `TaskOutput`, `TaskStop` so the hooks.json matcher-validation block accepts the new matchers.

### Why no schema revision

`schemas/pipeline-artifact.schema.md` revision unchanged (still `6`). Adding a new artifact type to the type enum is additive — older readers ignoring the new type incur no behavior change since the path namespace (`<cwd>/.orchestra/tasks/`) is also new. No frontmatter-shape changes for any pre-existing artifact. No hook-contract changes for the 5 pre-existing hooks. No env-var toggles removed. `local.yaml` schema unchanged. Existing pipelines under `<cwd>/.orchestra/pipeline/<id>/` and `<cwd>/docs/<feature-id>/` remain valid; the new `<cwd>/.orchestra/tasks/` subtree is greenfield.

### Migration

- **First spawned-agent run after upgrade** writes its PLAN under `<cwd>/.orchestra/tasks/<run-id>/<agent>/<feature-id>.md`. No retroactive backfill for in-flight runs that started under v4.0.5.
- **`/orchestra resume`** prefers PLAN files when present; falls back to the v4.0.3+ TASKS.md walk for runs that pre-date this release.
- **Opt-out**: `ORCHESTRA_HOOK_AGENT_PLAN_SYNC=off` disables the new hook entirely; agents will still narrate PLAN bodies but no `tasks:` mirroring or interrupt detection occurs. Useful for diagnosing PLAN-related test/CI failures.

### Tests

13 test files green, +1 new (`agent-plan-sync.test.js`, 25 assertions). `hooks.test.js`: 96 → 97 assertions (+1 from KNOWN_TOOLS allowlist expansion).

## [4.0.3] — 2026-05-10

Patch release driven by smoke-test feedback at `/tmp/orchestra-smoke-greenfield-v4-0-2`. Five gaps surfaced: (1) `spawn_mode` cached silently as `subagent` with no user-visible prompt; (2) `autonomy.level` never elicited (PAUSE-1 lived inside `@lead` per v4.0.2 CHANGELOG, but the smoke run produced no autonomy field in `local.yaml`); (3) C4 diagrams used inconsistent naming (`c4-l1-context` from architect alongside `001-todo-api-c4-l3-component` from lead) and were emitted into one folder; (4) C4 Level-4 (Code) absent everywhere; (5) `@product` authored PRD without `AskUserQuestion`-driven consultant dialogue at non-HIGH confidence.

### Changed

- **`commands/orchestra.md` — autonomy + spawn_mode gates promoted into the dispatcher decision tree.** Two new `AskUserQuestion` steps: spawn_mode (subagent | teams; default subagent) and autonomy.level (5-tag enum sourced from `skills/task-breakdown/references/autonomy-diagnostic.md`; suggestion derived by running the 5-Q diagnostic against `$ARGUMENTS` + `local.yaml.discovery`). `local.yaml` schema gains `autonomy:` block (`level`, `resolved_by` provenance). Two new flags: `--autonomy {EXECUTION_ONLY,JOINT_PROCESSING,OPTION_SYNTHESIS,DRAFT_AND_GATE,FULL_AUTONOMY}` and `--spawn-mode {subagent,teams}`. Resolution precedence unchanged: CLI flag > `local.yaml.autonomy.level` > diagnostic suggestion > `DRAFT_AND_GATE`. v3 PAUSE-N terminology stays forbidden — gates live in decision-tree prose, not in named pause hooks.
- **`skills/c4-architecture/SKILL.md` — diagram naming + filesystem layout rationalized.** L1/L2/L3 templates renamed to `Level N — <name>` headers with explicit filename hints (`c4-l1-context.puml`, `c4-l2-container.puml`, `c4-l3-<service>.puml`). New "Two folders, one source of truth" section: project-level singletons under `<cwd>/docs/diagrams/` (latest-state, updated in place by `@architect` for L1/L2 and `@lead` for L3/L4); per-feature copies under `<cwd>/docs/<feature-id>/diagrams/` with `<feature-id>-` prefix and feature-touched elements highlighted via `UpdateElementStyle($bgColor="LightSalmon", $borderColor="Red")`. Step 6 self-check gains the "two-folder rule" bullet. Worked example rewritten end-to-end against the Todo-service flow.
- **`agents/architect.md` — L1/L2 paths updated.** `docs/diagrams/c4-context.puml` → `c4-l1-context.puml`; same for container. New `clean-architecture` skill invocation when authoring SAD `S-CONTAINERS-001` (Dependency Rule applied to container layout).
- **`agents/lead.md` — L3/L4 ownership + per-feature copy protocol.** Outputs section enumerates project singletons (`docs/diagrams/c4-l3-<service>.puml`, `c4-l4-<service>.puml`) plus per-feature highlighted copies (`docs/<feature-id>/diagrams/<feature-id>-c4-l1-context.puml`, etc.). Workflow Step 6 ("Author TDD + diagrams") now describes the copy-with-highlight protocol explicitly. New `clean-architecture` and `clean-code` skill invocations.
- **`agents/backend.md` — Clean Architecture + Clean Code wired into authoring loop.** Skills section adds both. Workflow gains a self-score step before flipping `Status: done` (≥8/10 on each rubric, else another pass or ESCALATE).
- **`agents/reviewer.md` — `S-VERDICT-REVIEW-001` scoring rubrics added.** Two new workflow steps (5a, 5b) walk the diff against `clean-architecture` (6 principles) and `clean-code` (6 disciplines); scores recorded in the verdict body alongside the finding list.
- **`agents/product.md` — consultant-mode self-check.** Step 3 now mandates ≥1 `AskUserQuestion` at MEDIUM confidence and 2–3 at LOW (HIGH still 0). PRD `status: locked` blocks until the dialogue happened; otherwise `<feature-id>-DEADLOCK-consultant-skipped.md` is written. Frames LOW-confidence dialogue around problem-before-feature ("what problem are you trying to solve?", "MVP / production / experimental?", existing constraints).

### Added

- **`skills/clean-architecture/`** — vendored verbatim from `github.com/wondelai/skills@1.1.0` (MIT, Wondel.ai sp. z o.o.). Six principles: Dependency Rule, Entities & Use Cases, Interface Adapters & Frameworks, Component Principles (REP/CCP/CRP/ADP/SDP/SAP), SOLID, Boundaries & Humble Object. Six `references/*.md` deep-dives. `SKILL.md` frontmatter trimmed to ≤200-char description and gains `origin:` declaration; body and references unchanged. `LICENSE` file ships next to `SKILL.md`.
- **`skills/clean-code/`** — vendored verbatim from same source. Six disciplines: Meaningful Names, Functions, Comments & Formatting, Error Handling, Unit Testing (F.I.R.S.T.), Code Smells & Heuristics. Same vendoring shape: trimmed frontmatter, `origin:` declaration, paired `LICENSE`.
- **`skills/c4-architecture/SKILL.md` — Level 4 (Code) template added.** PlantUML class diagram (no `C4_Code` macro exists in stdlib) showing the full layer cake — Controller / Use Case / Port / Repository implementation / Entity — with `<<adapter>>` / `<<usecase>>` / `<<port>>` / `<<entity>>` stereotypes. Inward-pointing arrows enforce the Dependency Rule visually. Required under `chain_rigor=Full` when service has ≥3 classes; omittable with `<!-- OMIT: trivial code surface -->`.
- **`scripts/tests/hooks.test.js` — v4.0.3 assertions added.** Replaces v3-vestige guards on `--autonomy` / 5-tag / spawn_mode (regression rule inverted: now REQUIRED, not forbidden). New blocks: `c4-architecture` skill enumerates all four levels + `clean-architecture` cross-reference + highlight protocol; vendored skills load cleanly with `origin: vendored` frontmatter and shipping `LICENSE`. 78 → 97 assertions (+19).

### Why no schema revision

`schemas/pipeline-artifact.schema.md` revision unchanged. No anchor renames, no frontmatter shape changes for chain artifacts, no hook-contract changes, no removed env-var toggles. `local.yaml` schema gains `autonomy:` block as additive optional fields; the existing `validate.js` `VALID_AUTONOMY_LEVELS` enum already accommodated the 5 tags. All 11 test files green (validate, hooks, agents, bash-strip, bootstrap, cite-purity, metrics, probe, removability, report, scaffold, validate-extensions). Existing pipelines under `<cwd>/.orchestra/pipeline/<id>/` remain valid; consumers upgrading from 4.0.2 see two new dispatcher prompts on first `/orchestra` run after upgrade.

### Migration

- **First `/orchestra <intent>` run after upgrade** prompts twice for new fields (spawn_mode + autonomy.level). Both cache to `local.yaml`; subsequent runs do not re-prompt unless the user clears the file or re-elicits via `--autonomy=<tag>` / `--spawn-mode=<mode>`.
- **Existing C4 diagrams** with v4.0.2-era filenames (`c4-context.puml`, `c4-component.puml`) keep working — the `post-write-puml` hook is generic and renders any `.puml`. New feature runs author the new naming. To re-canonicalize, rename in place; no automated migration shipped.

## [3.0.0] — 2026-05-07

Major release: coordinated prompt + artifact tightening sweep across 30+ consumer-surface files (8 agents, 14 skills, `commands/orchestra.md`, 7 schema manifests). Closes the v2.* release window. The surface is rewritten end-to-end against new canonical templates documented in `docs/v3.0-canonical-{agent,skill}-template.md` (dev-trace).

Net consumer-pipeline delta: zero. Anchor IDs (`S-NAME-NNN`), frontmatter shapes, hook contracts, env-var toggles, pipeline-artifact types, and `<artifact>.lock.yaml` sidecar pairing all unchanged. `schemas/pipeline-artifact.schema.md` revision stays at `5`. Existing pipelines under `.claude/.orchestra/pipeline/<id>/` remain valid; no migration required. `claude plugin update orchestra` is a non-breaking upgrade.

Behavior change is restorative: prompts normalized to canonical templates, dev-doc cite leaks dropped (phantom anchors for consumers — `docs/` doesn't ship with the plugin install), v1→v2 fold leftovers corrected (stale references to removed `verify/<NNN>-CODE-REVIEW.md` / `verify/<NNN>-VERDICT.md` artifacts now correctly point at TSR halves `S-REV-VERDICT-001` + `S-REV-FINDINGS-001` / `S-EVAL-VERDICT-001` + `S-EVAL-TABLE-001`). Every load-bearing rule preserved.

### Changed

- **`agents/{backend,frontend,evaluator,ship,test,reviewer,product,lead}.md` — canonical agent template applied to all 8.** Section sequence normalized to Identity / Tier / Skills / Inputs / Outputs / Workflow / Example. Drop list: "You may invoke:" / "You should/must" / "Action steps:" preambles + trailing rationale narration. "Tier discipline" → "Tier" rename. Path placeholders normalized to `<NNN>`. v1→v2 fold leftovers corrected on agents that referenced removed artifacts. 616 → 622 lines (+1%; rule preservation cost lines back — word/char drop is the win). First-draft `agents/backend.md` AFTER caught 7 high-severity rule-loss bugs in audit (path glob inconsistency, lost section-anchor prefix, lost collision-prevention rule, lost rule-activation mechanism, stale verdict-file ref preserved by elision, lost author attribution, lost skill timing); fixes propagated to remaining 7 agents.
- **`skills/*/SKILL.md` × 14 + new `skills/c4-architecture/references/c4-rules.md` — canonical skill template applied to all 14.** Section sequence: Identity / When-to-use / Approach OR Algorithm / [Reference table] / [Output shape] / [Escalate] / Worked example / [References]. Bimodal reduction: `plantuml` 304 → 152 (-50%, deletion of duplicated content already in pre-existing `references/`); `c4-architecture` 404 → 319 (-21%, new `references/c4-rules.md` absorbs deep MUST/MUST-NOT framework-internals prose); `write-contract` 203 → 173 (-15%). Tool-shaped + procedure skills 1–5% line drop (rule preservation enforced). Total: 2063 → 1816 (-12%). `code-review` Step 6 corrected from removed `verify/<NNN>-CODE-REVIEW.md` to TSR halves `S-REV-VERDICT-001` + `S-REV-FINDINGS-001`. `commit-work` "per WORKFLOW PR boundaries" leaky cite dropped.
- **`commands/orchestra.md` — Step 1 / Step 5(a,a',a'') / Step 7 cost banner tightened.** ~3% word drop; lines unchanged (load-bearing routing tables + canon enumerations dominate). PAUSE-4 narration corrected from "after `@reviewer` writes CODE-REVIEW" → "fills `S-REV-VERDICT-001` + `S-REV-FINDINGS-001` in TSR" (v1→v2 fold leftover; `verify/<NNN>-CODE-REVIEW.md` was retired in v2.0). `docs/HOOKS.md` leaky cite dropped.
- **`schemas/pipeline-artifact.schema.md` — narrative tightening.** ~1% word drop. Dropped "per `docs/DESIGN-005-doc-output-overhaul.md` §S-CANON-001" leaky cite. Schema revision unchanged (still at `5`).
- **`schemas/{routing-taxonomy.md, lockfile.schema.md, install-modules.schema.json, known-models.schema.json, runtime-toggles.schema.json, templates/ADR.template.md}` — 10 surgical leaky-cite cleanups.** Consumer-surface schemas referenced `docs/PRD-*.md` / `docs/DESIGN-*.md` sections by anchor — phantom anchors for consumers (the `docs/` folder doesn't ship). Defense-in-depth grep with stricter regex (`DESIGN-[0-9]+(-[a-z-]+)?\s*§`) caught patterns the streamline fixture's narrower regex missed.

### Added

- **`skills/c4-architecture/references/c4-rules.md`** — new (100 lines). Framework-internals table, Component-diagrams-optional protocol + omission pattern, microservices ownership-pattern examples (single-team / multi-team / event-driven). Absorbs deep prose previously inline in `SKILL.md`.
- **`docs/v3.0-{prompt-tightening-brief, canonical-agent-template, canonical-skill-template}.md`** — new dev-surface planning artifacts (decision summary, per-section rules, drop list, worked BEFORE/AFTER examples, post-sweep reconciliation tables capturing predicted-vs-actual reduction gap). Not shipped to consumers — per project CLAUDE.md, `docs/` is dev-only.

### Why no schema revision

`schemas/pipeline-artifact.schema.md` revision stays at `5`. Anchor IDs (`S-NAME-NNN`), frontmatter shapes, hook contracts, env-var toggles, pipeline-artifact types, and `<artifact>.lock.yaml` sidecar pairing all unchanged. All 12 `npm test` suites (`validate / hooks / hash-stamper / scaffold / extensions / agents / bash-strip / drift / removability / metrics / bootstrap / probe`) green without modification.

### Why MAJOR

The sweep introduces no backwards-incompatible changes for consumer pipelines (no anchor renames, no frontmatter shape changes, no schema revision bump, no hook-contract changes, no removed env-var toggles, no removed pipeline-artifact types). MAJOR signal is maintainer prerogative — closes the v2.* release window per `docs/v3.0-prompt-tightening-brief.md` and signals a coordinated surface-wide refactor (30+ files touched, every agent + skill body rewritten against a new canonical template). Consumers upgrading from v2.x experience a non-breaking refactor: existing pipelines remain valid, every load-bearing rule preserved.

### Migration

1. Pre-upgrade: no action required. Existing pipelines under `.claude/.orchestra/pipeline/<id>/` remain valid.
2. Upgrade: `claude plugin update orchestra` (or reinstall via marketplace).
3. Post-upgrade: start new pipelines via `/orchestra <intent>`. Old artifacts continue to validate against `schemas/pipeline-artifact.schema.md` revision `5`.

---
*Release-time provenance: 12 internal validators + streamline fixture all green at commit time. Consumer-install smoke chain steps (b)–(e) (`/plugin marketplace add`, `/plugin install`, `/orchestra help`, `/orchestra <intent>` in throwaway dir) deferred at maintainer discretion. Step (a) (`claude plugin validate .` against `marketplace.json`) ran green prior to commit motion.*

## [2.2.2] — 2026-05-07

Patch release closing two follow-up gaps surfaced during the smoke run at `/tmp/orchestra-smoke-9` after v2.2.1 shipped. (1) The greenfield stack-elicitation override added in v2.2.1 (`agents/product.md` step 5) **existed but never fired**: bootstrap writes `primary_language` / `framework` at the top level of `local.yaml`, while the override predicate read `local.yaml.discovery.{language,framework}` — a path that never existed (predicate mismatch). Compounding this, `@lead` volunteered a stack recommendation in `intent.yaml.rationale` ("Recommended stack: Python 3.x + Flask"), which downstream `@product` read as authoritative and used to skip its own elicitation gate (context-bleed override). The result: smoke-9 wrote CHARTER + PRD + ADR-0001 with Python+Flask end-to-end, then the user intervened at PAUSE-3 to redirect to "Java + Spring Boot" — re-baking the stack across already-authored artifacts. (2) Every agent's `<example>` block carried domain-specific priors (URL shortener, `com.acme.transfer`, idempotency keys, Toast component, `transaction_id`, etc.) which biased the LLM toward pattern-matching its actual request onto the example scenario. Example was supposed to teach procedure; instead it was teaching shape.

Net consumer-surface delta: 7 agents touched (`product`, `lead`, `reviewer`, `evaluator`, `backend`, `frontend`, `test`); zero new pipeline-artifact types, flags, env-vars, or schema revisions. Behavior change is restorative: the elicitation gate now fires unconditionally on greenfield (no signal-detection clauses for the LLM to talk itself out of), and `@lead` is forbidden from naming a stack in `intent.yaml.rationale`. Examples are rewritten as numbered-step procedural cheat-sheets with generic identifiers — same procedural arc, no domain priors.

### Changed

- **`agents/product.md` — stack-elicitation gate hardened (RC1+RC2 fix).** Step 5's override predicate is now purely structural: `local.yaml.mode == greenfield` → ask, unconditionally. The previous predicate ("greenfield AND no signal in user prompt OR `local.yaml.discovery.{language,framework}`") had two failure modes: (a) the `discovery.*` path never exists in `local.yaml` (bootstrap writes top-level keys), so the predicate was structurally undefined; (b) the LLM widened "no signal" to include upstream agent recommendations, letting `intent.yaml.rationale` mentions of a stack disarm the gate. New wording adds explicit "treat upstream stack mentions in user prompt / `intent.yaml.rationale` / spawn prompt / `local.yaml` as advisory only; the user's answer is authoritative." Step 1's "read its `discovery:` block" prose dropped (no such block exists). Step 5 example context updated to drop the `discovery.{language,framework}` reference.
- **`agents/lead.md` — no stack recommendation in `intent.yaml.rationale` (RC2 source fix).** Tier discipline section gains one bullet, parallel-shaped to the existing "No PRD/FRS authoring — that's `@product`'s tier" rule: `@lead` MUST NOT name a stack in `intent.yaml.rationale`. Stack elicitation is `@product`'s gate (greenfield) or comes from existing repo signal (brownfield); `@lead` records the decision later via `ADR-0001-stack-choice` only when PRD `S-OPEN-001` carries `ADR-WORTHY:`. This closes the upstream context-bleed that disarmed `@product`'s gate even after RC1 was fixed.
- **`agents/{product,lead,reviewer,evaluator,backend,frontend,test}.md` — example-block prior scrub.** Every `<example>` block on the consumer surface now follows a `Context: <generic situation>` + numbered `Action steps:` shape with placeholder identifiers (`<NNN>`, `<lang>`, `<feature>`). Removed: URL shortener (product, lead), `com.acme.transfer` + `TransferService.transferFunds` + `IOException` (reviewer), `ADR-0001-use-sqlite-wal` + SQLite-vs-Postgres ADR walkthrough (lead, reviewer), `transaction_id` + idempotency-keys + HTTP 409 (backend, evaluator), Toast component + `useToast` hook + 500ms collapse (frontend), `transfer.audit_logs` + log-shipping side channel (test), C-001..C-005 transfer-flavored probe walkthrough (evaluator). The two-block reviewer.md (TSR review + ADR review) keeps both blocks; the two-block evaluator.md collapses to one (the second block was a per-criterion FAIL narration covered by Tier-A's existing line 18 read-only rule). `scripts/test-agents.js`'s structural invariant (`≥1 <example>...</example> per agent body`) stays satisfied.
- **`agents/test.md` — fold-up of the "never invent a fake probe" guard.** The rule lived only inside the example narration; it's now folded into Workflow step 4 as a one-liner: unprobable criteria (no `http_probe` / `db_state` path) → mark `manual_evaluation: true` and append a "Probe gap" row noting why; never invent a fake probe. Per project CLAUDE.md "fold up, don't sprinkle".

### Why no schema revision

These are prompt-content fixes inside agent bodies. No new pipeline-artifact types, frontmatter fields, anchor IDs, or hook contracts. `schemas/pipeline-artifact.schema.md` revision stays at `5`. `validate.js`, `validate-drift.js`, `test-agents.js`, `test-bootstrap.js` all green without modification.

## [2.2.1] — 2026-05-07

Patch release closing two execution-drift gaps surfaced during smoke runs at `/tmp/orchestra-smoke-7` and `/tmp/orchestra-smoke-8`: (1) `@product` silently defaulted greenfield projects to Node.js instead of asking the user for a stack, forcing a CHARTER+PRD revision round at PAUSE-2 once the user redirected to "Java + Spring Boot"; and (2) `@lead` authored `.puml` diagrams using raw `rectangle`/`actor` + `skinparam` shapes styled to look C4 but missing the C4 type semantics — including modeling Tomcat, DispatcherServlet, and Jackson as Components on the L3 Component diagram.

Net consumer-surface delta: 4 files touched (2 agents + 2 skills); zero new pipeline-artifact types, flags, env-vars, or schema revisions. Behavior change is additive: greenfield runs with no stack signal now hit one combined `language + framework` AskUserQuestion before CHARTER `S-FEASIBILITY-001`; `@lead` opens `ADR-0001-stack-choice` before SAD `S-CONTAINERS-001`; all C4 `.puml` files use C4-PlantUML stdlib macros (`Person`/`System`/`Container`/`Component`/`Rel`) — raw shapes are forbidden.

### Changed

- **`agents/product.md` — stack elicitation override (greenfield only).** Step 5 gains a hard-block: when `local.yaml.mode == greenfield` AND no language/framework signal exists in the user prompt or `local.yaml.discovery.{language,framework}`, `@product` MUST emit ONE combined AskUserQuestion (language + framework) BEFORE writing CHARTER `S-FEASIBILITY-001`. The override fires regardless of overall confidence rating and counts toward the 3-question cap (other LOW-confidence questions defer to the revision round if the cap is tight). Fixes the silent Node.js default observed at smoke-7 PAUSE-2.
- **`agents/product.md` — stack-choice ADR seeding in PRD `S-OPEN-001`.** When the stack-elicitation override fires, Step 8 now requires `@product` to (a) write CHARTER `S-FEASIBILITY-001` with the stack as a one-line user-supplied constraint (NOT as an architectural decision under debate), and (b) append `ADR-WORTHY: stack choice — <user-supplied stack> (user-supplied constraint; alternatives = "user constraint, no alternatives evaluated").` to PRD `S-OPEN-001`. This reuses the existing `ADR-WORTHY:` channel — no new trigger added to `@lead`'s ADR-open list.
- **`agents/product.md` — PRD goals stay stack-agnostic.** Step 8 now explicitly forbids stack-specific run/build commands (`./mvnw spring-boot:run`, `npm start`, `python -m uvicorn ...`) and JDK/runtime-version pins from PRD `S-GOALS-001` and `S-METRICS-001`. PRD goals describe HTTP-shaped or behavior-shaped acceptance only; build tool, runtime version, and run commands belong in TDD `S-CONFIG-001` (`@lead`'s tier).
- **`agents/lead.md` — stack-choice ADR sequencing.** Greenfield SAD bootstrap section gains a "Sequencing — stack-choice ADR" paragraph: `@lead` MUST open `ADR-0001-stack-choice.md` and resolve `Status: Accepted` BEFORE finalizing SAD `S-CONTAINERS-001`. SAD container `technology` labels reference the resolved ADR via the lockfile `references[]` array. `S-CONFIG-001` in TDD is named as the canonical home for build-tool/JDK/run commands; PRD-as-stack-agnostic constraint is restated.
- **`skills/c4-architecture/SKILL.md` — MUST/MUST-NOT block (binding).** Every C4 `.puml` MUST start with `!include <C4/C4_Context|C4_Container|C4_Component|C4_Dynamic|C4_Deployment>`, MUST use stdlib macros (`Person`/`System`/`Container`/`Component` plus `*_Ext`/`*Db`/`*Queue`/`*_Boundary` variants and `Rel(...)`), and MUST carry a `title` line. MUST NOT use raw `rectangle`/`actor`/`component`/`package`/`node`/`database` for body elements (they erase C4 type semantics), MUST NOT use raw arrow syntax (`-->`/`->`/`..>`) for relationships, MUST NOT use `skinparam` for body styling, and MUST NOT use generic relationship verbs ("Uses", "Calls"). Closes the smoke-8 violation pattern where labels said "Container" but the macro was `rectangle`.
- **`skills/c4-architecture/SKILL.md` — framework internals are NOT components.** New "What to avoid" subsection plus a forbidden-as-component table (servlet container, `DispatcherServlet`/`FrontController`, HTTP message converters like Jackson/Gson, ORM `SessionFactory`/`EntityManagerFactory`, framework HTTP clients like `RestTemplate`/`WebClient`/`OkHttpClient`). The chain `Tomcat → DispatcherServlet → MyController → Jackson → Client` is request-flow narration, not structure — if needed, it goes in a Dynamic diagram (`<C4/C4_Dynamic>`), not a Component diagram. Closes the smoke-8 TDD Component diagram which modeled all of these as Components.
- **`skills/c4-architecture/SKILL.md` — Component diagrams are optional.** Single-component containers should write `<!-- OMIT: trivial container; single component -->` in the TDD `§S-COMPONENTS` section and set frontmatter `component_count: 0` (mirrors the existing pattern for omitted state-machines: `<!-- OMIT: no lifecycle states -->` + `state_machine_count: 0`). Long-lived containers should prefer auto-generation (Structurizr DSL or annotation-driven) over hand-drawn Component diagrams that rot.
- **`skills/c4-architecture/SKILL.md` — self-check checklist (run before rendering).** New checklist before the "Summary" section enumerating: title present, stdlib `!include` used, every element has name/type-by-macro/description/technology, L1 has no transport protocols, L3 has no framework internals, `Rel(...)` carries a label and protocol/technology, no generic verbs, all arrows unidirectional, plus a stand-alone test ("could a stranger tell what it does, who uses it, and how it's built — without your narration?"). Mirrors c4model.com/diagrams/checklist with orchestra-specific additions.
- **`skills/c4-architecture/SKILL.md` — what-to-avoid additions.** Four new bullets in the "What to avoid" subsection: framework internals as components (cross-link to forbidden table); trivial Component diagrams (cross-link to omit pattern); transport/protocol detail in L1 System Context labels (move to L2); deployment detail (LBs, replicas, K8s pods) on Container diagrams (move to Deployment).
- **`skills/plantuml/SKILL.md` — Graphviz upgraded from optional to required for C4.** Prerequisites table line for Graphviz changed from "optional / Complex layouts" to "REQUIRED for C4 Container/Component diagrams". The C4-PlantUML stdlib's container/component macros invoke Graphviz layout under the hood; without it the render silently falls back to Smetana with poorer layout quality on dense diagrams.

### Why no schema revision

These changes tighten authoring rules inside agent prompts and a skill — they do not introduce new artifact types, frontmatter fields, or anchor IDs. `schemas/pipeline-artifact.schema.md` revision stays at `5` (set by v2.2.0). `validate-drift.js` and `scaffold-artifact.js` continue to pass without modification. The `ADR-WORTHY: stack choice` rule is a new instance of the existing `ADR-WORTHY:` mechanism (introduced pre-v2.0), not a new mechanism.

## [2.2.0] — 2026-05-06

Minor release shipping three coordinated themes from `docs/PRD-004` + `docs/DESIGN-007` + `docs/WORKFLOW-004` (5 PRs):

- **Theme α — backlog mechanism + curation pass.** Replaces five scattered "deferred to v1.1+" sites (PRD-001 §14, PRD-002 §8, PRD-003 §11, DESIGN-005 §14, DESIGN-006 §8, WORKFLOW-002 §5.5 + risk rows) with a single canonical `docs/BACKLOG.md` (28 entries: 12 killed + 16 deferred). Adds `scripts/validate-backlog.js` enforcing the grammar on every `npm test`. Drops consumer-surface roadmap leaks (`agents/backend.md`, `agents/frontend.md`, `commands/orchestra.md`, `skills/task-breakdown/SKILL.md`, `README.md`).
- **Theme β — opt-in design fork.** Adds `--think` and `--delegate` flags to the dispatcher, plus the **PLAN** pipeline-artifact type (5 anchors: Problem / Options ≥3 / Trade-offs / Recommendation / Open). `--think` triggers a one-shot scaffold at `<feature-dir>/planning/<NNN>-PLAN.md` before the first `@lead` spawn; `--delegate` (implies `--think`) adds one user-facing AskUserQuestion gate on `S-OPTIONS-001`, persisting the choice at `planning/PLAN.choice.yaml`. Both flags are no-ops on docs/template/hotfix/review-only intents.
- **Theme γ — consumer-observed cost.** Adds USD cost surfaces to the existing token telemetry. `hooks/lib/rate-card.js` is the single source of truth (Opus 4.7 list price); `metrics-collector.js` computes USD at write-time and persists into `tokens.jsonl` rows (`usd`) + `runs/<id>.json` (`cost_usd`). `scripts/metrics-summary.py` adds three columns (`Cost`, `Δ avg`, `Heaviest`) + cost-trend footer; `scripts/aggregate-metrics.py --cost` adds 30-day daily trend / per-intent distribution / top-5 most-expensive runs. Optional one-line cost banner at `/orchestra` Step 7 closure (default off; opt-in via `ORCHESTRA_METRICS_COST_BANNER=on`).

Net consumer-surface delta: 1 new pipeline-artifact type (PLAN), 2 new dispatcher flags (`--think`, `--delegate`), 1 new env-var toggle (`ORCHESTRA_METRICS_COST_BANNER`). Schema revision `pipeline-artifact.schema.md` 4 → 5. Word counts on the consumer surface decrease net `−37` after Sweep 2 cleanup. `npm test` green: 13/13 chain entries (`validate / hooks / hash-stamper / scaffold / extensions / backlog / agents / bash-strip / drift / removability / metrics / bootstrap / probe`), 122 scaffold + 101 metrics assertions.

### Added

- **Theme α** — `docs/BACKLOG.md` (canonical site for deferred/killed proposals; 28 entries with `BL-NNNN-<slug>` IDs, status enum `proposed | accepted | in-flight | shipped | killed | deferred`); `scripts/validate-backlog.js` (180 lines; hard-fails on missing-body / orphan-section / bad-status / bad-ID / schema-version; soft-warns on ID gaps; wired into `npm test`).
- **Theme β** — `schemas/templates/PLAN.template.md` (new template, slim frontmatter: `id / type / created / revision / feature_id / option_count / recommendation`); PLAN entry in `scripts/scaffold-artifact.js` `TYPE_SPEC` (feature-scoped, `folder=planning`, 5 anchors, no diagrams); PLAN row in `schemas/pipeline-artifact.schema.md` (revision 4 → 5: `planning/` folder layout, type→folder map, no-diagram-required list, type-specific frontmatter section); `agents/lead.md` Workflow step 7 fills the scaffolded PLAN under `--think` (subsequent steps renumbered 7→8 ... 10→11); `commands/orchestra.md` Step 4b intent gate, Step 5(a') one-shot scaffold, Step 5(a'') `--delegate` AskUserQuestion + `PLAN.choice.yaml` sidecar.
- **Theme γ** — `hooks/lib/rate-card.js` (NEW; `RATES_USD_PER_MTOK` constant — Opus 4.7 list price `input $15` / `output $75` / `cache_read $1.50` / `cache_create $18.75` per MTok — and `computeUsd(tokens)` helper); `manifests/runtime-toggles.json` entry `config.metrics-cost-banner` (envVar `ORCHESTRA_METRICS_COST_BANNER`, default off; reserves the `config.*` namespace for dispatcher-side display toggles with no `install-modules` counterpart); `commands/orchestra.md` Step 7 sub-step 2 emits a one-line banner reading `tokens.jsonl` filtered by `run_id` (banner is subagent-only — parent dispatcher cost lands later in `runs/<id>.json` after the Stop hook fires; timing constraint documented inline).
- `docs/PRD-004-backlog-mechanism-and-v2-curation.md`, `docs/DESIGN-007-backlog-and-v2-curation.md`, `docs/WORKFLOW-004-backlog-and-v2-curation.md` — dev-trace for the v2.2.0 motion (none ship to consumers).

### Changed

- **Theme α — dev-surface cleanup (Sweep 1).** `docs/PRD-001.md §14` 50-item body → 1-line pointer to BACKLOG; `docs/PRD-002` + `docs/PRD-003` frontmatter `status: planned` → `shipped` with `shipped_in:`; `docs/DESIGN-005 §14` F-6 row removed (already in BACKLOG); `docs/DESIGN-006 §8` license-clarification + frontend-component-patterns bullets dropped; `docs/WORKFLOW-002` four multi-touch edits (§5.5 list → pointer; line ~227 async PROPOSAL/PAUSE → `BL-0020`/`BL-0021`; line ~266 R12 telemetry promise dropped; lines ~317-318 R11 + R12 risk rows reworded). Net dev-surface diff: 13 insertions, 290 deletions across 7 files.
- **Theme α — consumer-surface cleanup (Sweep 2).** `agents/backend.md` ~L18 + `agents/frontend.md` ~L19 — drop `(deferred to v1.1+)` parentheticals from FE/BE separation rules (active rules retained); `agents/frontend.md` ~L27 — delete orphan FE-skill roadmap line (now `BL-0016`); `skills/task-breakdown/SKILL.md` ~L116 — reword `v1.0.0 / v1.1+` version refs to "current agent role / needs-future-specialist" preserving the defer semantic; `commands/orchestra.md` ~L257 — delete orphan `Deferred (v1.1+):` line that leaked roadmap into `/orchestra help` (`/save`, `/load`, `/orchestra-disagree` → `BL-0028`; `/orchestra legacy` → `BL-0015`); `README.md` bottom — replace `Status: v1.0.0 released 2026-05-03` with `Status: v2.1.0 (current). See CHANGELOG.md`.
- **Theme γ — metrics surfaces.** `hooks/scripts/metrics-collector.js` — `emitSubagentTokens` row gains `usd` field; `emitRunSummary` summary gains `cost_usd` field. `scripts/metrics-summary.py` — three new columns (`Cost`, `Δ avg`, `Heaviest`) + two-line cost-trend footer (median/p90 tokens + USD over last-10 + 15%-warn threshold); older runs without `cost_usd` render `—`. `scripts/aggregate-metrics.py` — new `--cost` flag triggers 30-day daily trend / per-intent distribution / top-5 most-expensive runs; reads pre-computed `cost_usd` (no rate-card duplication on the read side).
- **Theme β/γ schema additions.** `schemas/runtime-toggles.schema.json` — description docs the `config.*` namespace carve-out; `scripts/test-removability.js` skips bidirectional check on `config.*` toggles (no `install-modules` entry expected).
- **Test coverage.** `scripts/test-scaffold.js` — PLAN added to `EXPECTED_ANCHORS`, `EXPECTED_DIAGRAM_KINDS`, `typeFolder` map, `FEATURE_TYPES`, M9 anchor parity loop (113 → 122 assertions). `scripts/test-metrics.js` — 10 new assertions on `computeUsd()` unit shape + `cost_usd` integration shape (91 → 101 assertions).

### Removed

- `docs/optimization-pr-gamma-plan.md` — stale; v2.0 PR #5 already trimmed `commands/orchestra.md` beyond this plan's targets.
- Five scattered "deferred to v1.1+" sections (PRD-001 §14 body, PRD-002 §8 body, PRD-003 §11 body, DESIGN-005 §14 F-6 row, DESIGN-006 §8 follow-up bullets, WORKFLOW-002 §5.5 list) — content reconciled into `docs/BACKLOG.md` (canonical) or dropped where shipped/killed.
- Consumer-surface inline `(deferred to v1.1+)` parentheticals + roadmap lines on `agents/backend.md`, `agents/frontend.md`, `commands/orchestra.md`, `skills/task-breakdown/SKILL.md`, `README.md` (all reconciled into BACKLOG entries).

### Dev-trace

- `docs/PRD-004-backlog-mechanism-and-v2-curation.md` — `/sc:sc-brainstorm` output: problem / decisions / curation / FRS / non-goals / open Qs.
- `docs/DESIGN-007-backlog-and-v2-curation.md` — `/sc:sc-design` output: scope / infra delta / BACKLOG schema / cleanup / PLAN artifact / cost-visibility / OQ resolutions / PR sequencing / risks.
- `docs/WORKFLOW-004-backlog-and-v2-curation.md` — `/sc:sc-workflow` output: 5-PR dependency graph with task IDs, exit gates, smoke gates, risk attachments, release motion §8 hand-off.

## [2.1.0] — 2026-05-06

Minor release. Adds a single consumer-surface skill that packages Andrej Karpathy's observations on LLM coding pitfalls (via [`forrestchang/andrej-karpathy-skills`](https://github.com/forrestchang/andrej-karpathy-skills)) and wires it into the five orchestra agents whose workflows benefit. Skipped for `@evaluator`, `@reviewer`, and `@ship` — their tier-A/B invariants supersede or conflict with the rules.

Net consumer-surface delta: 1 new skill, +5 lines across 5 agent files. Zero behavior change in existing flows; consumers opting into the new skill receive light behavioral nudges during artifact authoring and code editing. See [`docs/DESIGN-006-karpathy-guidelines.md`](docs/DESIGN-006-karpathy-guidelines.md) for the full design rationale.

### Added

- `skills/karpathy-guidelines/SKILL.md` — new consumer-surface skill packaging four behavioral guidelines (*think before authoring*, *minimum surface*, *surgical edits*, *verifiable goals*) rephrased in orchestra's tier vocabulary (scaffolded artifact spans, AskUserQuestion confidence cap, `ESCALATE-<id>.md` gaps, CONTRACT criteria, structural-diff anchors). Includes a tier-by-tier applicability table so the canonical site stays single (per project `CLAUDE.md` "no annotation creep"). No license claim in frontmatter — upstream repository carries `license: null` at GitHub at time of import; text rewritten in orchestra's voice rather than copied verbatim.
- `agents/product.md`, `agents/lead.md`, `agents/backend.md`, `agents/frontend.md`, `agents/test.md` — one-line invocation entry under each agent's `## Skills` block. The same invocation text is used uniformly; per-agent emphasis lives in the skill body's applicability table, NOT duplicated into agent files.
- `README.md` — `## Acknowledgments` section crediting karpathy-guidelines, plantuml, and c4-architecture upstream sources.
- `docs/DESIGN-006-karpathy-guidelines.md` — dev-trace document persisting `/sc:sc-brainstorm` decisions (shape B + adapted-per-tier + skip-3), the tier-mapping rationale per agent, and the file-level change manifest.

### Unchanged (deliberate skip-3)

- `agents/evaluator.md`, `agents/reviewer.md`, `agents/ship.md` — these three agents do NOT invoke `karpathy-guidelines`. `@evaluator`'s `≥80% calibration-anchor` rule supersedes the new skill's "ask if uncertain" guidance; `@reviewer`'s `code-review` severity rubric is the canonical site for review wisdom and conflicts with the diff-shaped rules; `@ship`'s gate-driven release flow + `commit-work`'s "one coherent commit per logical feature" already encode the same ground. Layering the new skill on these tiers would create rule-against-rule noise.

### Attribution

- Andrej Karpathy's original observations on LLM coding pitfalls: <https://x.com/karpathy/status/2015883857489522876>
- forrestchang's compilation: <https://github.com/forrestchang/andrej-karpathy-skills>

## [2.0.0] — 2026-05-06

Major release. Two motions ship under the 2.0.0 umbrella: (1) the **doc-output overhaul** (`docs/DESIGN-005-doc-output-overhaul.md`) — pipeline artifact canon collapsed from 14 → 12 + conditional ADRs, provenance moved to `<artifact>.lock.yaml` sidecar, mandatory PlantUML diagrams, scaffold-then-fill template engine, ADR pattern, TSR fold, ANNOUNCEMENT folded into RELEASE; and (2) the **v1.0.1 streamline initiative** (originally targeted for a 1.0.1 patch that never tagged) — agent-body trims, references-file demotions, status-output compression, routing-taxonomy externalization. No automated migration — v1.x consumer projects rerun from intent.

Composite token reduction across the whole release vs pre-streamline baseline: `commands/orchestra.md` 3,141 → 2,520 words (−20%); mean `agents/*.md` 785 → ~660 words (−16%); 11-PR new-feature surface adds the lockfile primitive, scaffold engine, two new skills, validator extensions, schema rewrite, and dispatcher integration.

### BREAKING (doc-output overhaul)

- **Pipeline artifact canon collapsed from 14 → 12 (+ conditional ADRs):**
  - `verify/<NNN>-VERDICT.md` + `verify/<NNN>-CODE-REVIEW.md` → folded into `verify/<NNN>-TSR.md` (single file with single-writer-per-section discipline; `@evaluator` writes `S-EVAL-VERDICT-001` + `S-EVAL-TABLE-001`; `@reviewer` writes `S-REV-VERDICT-001` + `S-REV-FINDINGS-001`; `@ship` writes `S-SHIP-001`).
  - `ANNOUNCEMENT-<NNN>.md` / `ANNOUNCEMENT-vX.Y.Z.md` → folded into `RELEASE-vX.Y.Z.md` `S-ANNOUNCEMENT-001` section.
  - **6 routing-orphan types dropped:** `DOC`, `IMPL-NOTES`, `IMPL-BE`, `IMPL-FE`, `CODE-DESIGN-BE`, `CODE-DESIGN-FE` (declared in v1 schema but no intent ever emitted them). `COMMIT-MSG` is no longer a file artifact (string output of `commit-work` skill only).
  - **3 new types:** `<NNN>-CHARTER.md` (Planning, `mode: full | brief`), `ADR-<NNNN>-<slug>.md` (global flat numbering at `architecture/decisions/`), `<NNN>-TSR.md` (folded VERDICT + CODE-REVIEW).
- **Provenance moved from artifact frontmatter to paired `<artifact>.lock.yaml` sidecar.** Body frontmatter retains only `id`, `type`, `created`, `revision`, `status`, `version` (where applicable), and type-specific minimal fields. `sections:` and `references:` blocks are NO longer in body frontmatter — they live in the lockfile alongside a NEW `diagrams:` block tracking PlantUML source + rendered hashes.
- **Diagrams MANDATORY per artifact type** (PlantUML source `.puml` → SVG via the `/plantuml` skill; both hashed in lockfile):
  - FRS: use-case
  - SAD: C4 L1 (Context) + C4 L2 (Container)
  - TDD: C4 L3 (Component) + sequence-per-flow + ER + state-machine *(omittable when no lifecycle)*
  - CONTRACT: service-contract + sequence-per-critical-criterion
  - TASKS: DAG
  - RUNBOOK: deploy + rollback
  - ADR: status state-machine (NON-omittable)
- **Authoring switched to scaffold-then-fill.** Dispatcher (parent context, has `Bash`) runs `scripts/scaffold-artifact.js` before each agent spawn; agents fill `<!-- FILL: -->` placeholders and Write back. The validator's `structural-diff` mode rejects anchor drift; `lockfile-presence` rejects scaffold-managed artifacts without a paired lockfile.
- **`hooks/scripts/hash-stamper.js` now operates only-when-paired** — writes to `<artifact>.lock.yaml` only when one exists alongside; legacy v1 hand-authored writes pass through unstamped. `validate-drift.js` retains a backward-compat path that reads from inline frontmatter when no lockfile is paired (so v1 dev fixtures still pass).
- **v2.0 ADR workflow:** `@lead` proposes (`status: proposed`); `@reviewer` reviews (APPROVED → flip to `accepted`; REQUEST_CHANGES → bump `review_round`); 3-round circuit breaker → `DEADLOCK-ADR-<NNNN>.md`. State-machine diagram is MANDATORY for every ADR.
- **No automated migration.** v1.x consumer projects with existing `pipeline/` artifacts must rerun from intent. Mid-flight features that started under v1 should be re-routed via `/orchestra resume` after a clean `git init` of the feature dir, OR finished manually under v1 frontmatter conventions before upgrading.

### Added (doc-output overhaul, 11 commits)

- `scripts/scaffold-artifact.js` — Node ESM atomic template engine; single CLI; idempotent-by-default with `--force` override; ADR auto-numbers next NNNN; CHARTER mode dispatch; non-orchestra path refused.
- `scripts/bump-version.js` — atomic 3-file version updater (VERSION + package.json + plugin.json); surgical regex on the JSON `"version"` field preserves all other formatting + key order; SemVer 2.0.0 input validation.
- `schemas/lockfile.schema.md` — normative spec for `<artifact>.lock.yaml` (top-level keys, grammar constraint, bidirectional invariant with body anchors, diagram-kind enum).
- `schemas/templates/_lockfile.template.yaml` + 14 type templates: `CHARTER-full`, `CHARTER-brief`, `PRD`, `FRS`, `SAD`, `TDD`, `API.openapi.yaml`, `CONTRACT`, `TASKS`, `TEST`, `TSR`, `RELEASE`, `RUNBOOK`, `ADR`.
- `skills/plantuml/` — cloned from upstream `SpillwaveSolutions/plantuml@MIT` (license verified). Trimmed `examples/` (orchestra is language-agnostic). Ships `convert_puml.py` + `process_markdown_puml.py` + 19-diagram-type reference docs.
- `skills/c4-architecture/` — single-file skill with C4-PlantUML stdlib output (`!include <C4/C4_Container>` + macros). Structure adapted from Mermaid-output upstream; output is original work (`origin: orchestra-internal`).
- `scripts/validate.js` 7 new pure-function validators: `validateStructuralDiff`, `validateLockfilePresence`, `validateLockfileGrammar`, `validateDiagramHashes`, `validateOrphanTypes`, `validateFoldCorrectness`, `validateSoftCap`.
- `scripts/test-validate-extensions.js` — 45 mutation assertions across the 7 validators (M11–M19 + soft-cap warn/strict + inverse fixtures).
- `scripts/test-scaffold.js` — 116 mutation assertions covering every type's anchor parity, lockfile shape, diagram seeding, idempotency, ADR numbering, CHARTER mode dispatch, bad-input exit codes.
- `scripts/test-hash-stamper.js` — 27 mutation assertions covering only-when-paired sidecar mode, `.puml`/`.svg` whole-file hashing, references resolution, env opt-out.
- `commands/orchestra.md` Step 5(a) pre-spawn scaffold + Step 5c ADR-open subroutine + Step 6 v2 narration + Step 7 expanded terminal-state regex.
- New exception types: `ESCALATE-ADR-<NNNN>.md` (reviewer/implementer flags an undocumented system-affecting decision), `DEADLOCK-ADR-<NNNN>.md` (3-round ADR circuit-break).
- `docs/DESIGN-005-doc-output-overhaul.md` — 643-line design doc capturing the entire v2 motion (canon, schemas, scaffold-engine, validator extensions, render path, ADR workflow, TSR co-authorship, hash-stamper sidecar mode, agent + skill edit list, PR sequencing, follow-ups, decision trace).

### Changed (doc-output overhaul)

- `hooks/scripts/hash-stamper.js` — rewritten for only-when-paired sidecar mode. Writes to `<artifact>.lock.yaml` instead of inline frontmatter. Adds `.puml` + `.svg` whole-file hashing into `diagrams[]` entries. References resolution prefers upstream lockfile; falls back to upstream frontmatter for v1 legacy.
- `hooks/lib/section-hash.js` — adds `hashFile(absPath)` whole-file hasher; ANCHOR_RE regex updated from `S-[A-Z]+-\d{3}` to `S-[A-Z]+(?:-[A-Z]+)*-\d{3}` to support multi-segment IDs (`S-NON-GOALS-001`, `S-EVAL-VERDICT-001`, `S-ADR-INDEX-001`). Pre-existing v1 silent-drop bug fixed (smoke-6's PRD had `S-NON-GOALS-001: hash: TBD` invisibly because v1 regex didn't match).
- `scripts/validate-drift.js` — dual-mode read: lockfile preferred, inline frontmatter fallback for v1 legacy.
- `schemas/pipeline-artifact.schema.md` — major rewrite (revision 3 → 4): drops 9 dead/folded types, adds 3 new types, adds diagram-slot requirements table, updates body-grammar regex doc, cross-links lockfile schema.
- `schemas/routing-taxonomy.md` — per-intent updates (revision 1 → 2): TSR replaces VERDICT + CODE-REVIEW across all intents; CHARTER (mode: brief) replaces `INTENT-<id>.md` for template/docs/review-only intents; ADR conditional sub-flow added to feature/refactor.
- All 8 agents (`product`, `lead`, `backend`, `frontend`, `test`, `evaluator`, `reviewer`, `ship`): `tools:` arrays preserved (tier discipline intact); workflows switched from freehand authoring to scaffold-fill via dispatcher pre-spawn. `lead` adds full ADR-open subroutine. `reviewer` adds ADR-review subroutine + ESCALATE-ADR retroactive flagging. `evaluator`/`reviewer`/`ship` enforce single-writer-per-section discipline on TSR.
- 9 of 11 skills updated (`code-review`, `commit-work`, `cut-release`, `evaluator-tuning`, `project-discovery`, `qa-test-planner`, `resume-pipeline`, `task-breakdown`, `write-contract`): output paths updated for v2 canon (TSR, CHARTER, lockfile); diagram authoring steps added; probe DSL re-statement removed from `qa-test-planner`'s output (probes live in CONTRACT only).
- `scripts/test-streamline-fixture.sh` — adds orphan-type smoke gate (rejects `*-VERDICT.md`/`*-CODE-REVIEW.md`/`ANNOUNCEMENT-*.md`/`*-IMPL-{NOTES,BE,FE}.md`/`*-CODE-DESIGN-{BE,FE}.md` anywhere in repo) + integrates `test-validate-extensions.js`.
- `package.json` `test` chain — adds `test:hash-stamper` + `test:scaffold` + `test:validate-extensions` between existing entries; adds `bump-version` script.

### Removed (doc-output overhaul)

- Artifact types `VERDICT`, `CODE-REVIEW`, `ANNOUNCEMENT`, `DOC`, `IMPL-NOTES`, `IMPL-BE`, `IMPL-FE`, `CODE-DESIGN-BE`, `CODE-DESIGN-FE`, `COMMIT-MSG-as-file` (folded or never routed).
- Inline `sections:` and `references:` blocks from artifact body frontmatter.
- Inline probe DSL re-statement in TEST.md (probes live in CONTRACT only).
- Phantom `S-ADR-0001:` body slot from SAD (replaced by `S-ADR-INDEX-001` index table).
- `verify/<NNN>-CRITERIA.md` singleton (deprecated; just the TSR `S-EVAL-*` halves now).

### v1.0.1 streamline initiative (shipped under 2.0.0; never tagged separately)

The PR-by-PR detail below was originally documented under `[Unreleased]` for a v1.0.1 patch that never tagged. It ships under the 2.0.0 umbrella. Token reduction targets and per-PR exit gates are preserved verbatim from the original entries.

### Refactor (PR #5 v1.0.1 — streamline plugin loading: status output + routing taxonomy externalize)

Closes WORKFLOW-003 §S-PRTASKS-001 PR #5 (T-S41, T-S42, T-S43, T-S44). Implements PRD-003 §S-FRS-001 F-9 (status-output compress) and F-10 (routing taxonomy externalized to consumer-surface schema). Final PR of the v1.0.1 streamlining initiative.

Files changed:

- `schemas/routing-taxonomy.md` (new) — normative consumer-surface schema mapping `intent.yaml.intent` to authorized agents and artifact whitelist. Per-intent H2 anchors (`#feature`, `#hotfix`, `#template`, `#refactor`, `#docs`, `#review-only`). Each section: ordered agent list + full artifact whitelist + excluded-artifacts rationale. ~600 words.
- `commands/orchestra.md` `## Status output` — 23 lines → 14 lines. Replaced the bulleted prose with a 4-row event-format table (cleaner reference, same behavior). Banner template block preserved verbatim. Saves ~60 words.
- `commands/orchestra.md` Step 5 — 2-column table (intent → agents in order; whitelist anchor) replaces the previous 3-column table that inlined the full artifact list. Spawn-prompt mandate (line 153 area) updated to reference the schema by anchor with a 1-line backstop summary inline. Saves ~250 words.

Token reduction this PR (commands/orchestra.md, words; measured):

| File | Before | After | Δ |
|---|---|---|---|
| commands/orchestra.md | 2,386 | 2,273 | −113 |

WORKFLOW-003 §2.5 PR #5 exit target was ≤2,000 (down from 2,386). Landed at 2,273 — missed by 273 words. Honest delivery; the remaining content is operational and load-bearing (smart-router Steps 1-7, AskUserQuestion budget, hooks glossary, sprint subcommand, help message). The aggressive ≤2,000 target was estimated assuming additional cuts that aren't justifiable within F-9 + F-10 scope without losing semantic content.

Final cumulative state through PR #5 (vs pre-streamlining baseline):

- `commands/orchestra.md` (always-loaded L1): 3,141 → 2,273 words (−868 = **−28%**).
- Mean `agents/*.md` (per-spawn L2): 785 → 671 words (−15%, locked in PR #4).
- `agents/lead.md` (highest-leverage orchestrator): 1,128 → 689 (−39%).
- `skills/*` count: 8 → 11 (3 new skills: `resume-pipeline`, `shutdown-team`, `cut-release`).
- `skills/*/references/*` files: 1 → 3 (calibration-examples baseline + autonomy-diagnostic + smoke-checklist). routing-taxonomy.md is filed under `schemas/` not `references/`, so the references count is unchanged this PR.
- `schemas/*.md` files: 1 → 2 (pipeline-artifact.schema.md baseline + routing-taxonomy.md).

Spawn-prompt mandate change (subtle but load-bearing):

Before: dispatcher inlined the FULL artifact list into every Step-5 spawn prompt (~30-40 tokens × 6 spawns per feature run = ~200 tokens).

After: dispatcher inlines a 1-line summary + schema anchor pointer (~15 tokens × 6 spawns ≈ 90 tokens). Agents Read `schemas/routing-taxonomy.md#<intent>` only when the inline summary is insufficient — the common path skips the Read entirely.

R-3 mitigation (DESIGN-004 §S-RISKS-001): the 1-line backstop summary inline is what lets agents stay decisive without an external Read. If the summary drifts from the schema, the schema is canonical for artifact whitelists; the dispatcher table is canonical for spawn order. Both must update in sync.

Smoke gate (PR #5 exit):
- node scripts/test-agents.js: OK
- node scripts/validate.js: OK
- bash scripts/test-streamline-fixture.sh: PASS
- Manual whitelist-enforcement smoke (6-intent + 1 negative): deferred to interactive verification per fixture's printed checklist.

### Refactor (PR #4 v1.0.1 — streamline plugin loading: references demotion)

Closes WORKFLOW-003 §S-PRTASKS-001 PR #4 (T-S34, T-S35, T-S38, T-S39, T-S40). Implements PRD-003 §S-FRS-001 F-7 (autonomy diagnostic to references file per D-2 override) and a re-scoped F-8 (heavy reference material moved out of agent bodies into `skills/*/references/`).

T-S33 was removed in PR #0 per D-2 override (no `classify-autonomy` skill). T-S36/T-S37 were no-ops — the severity rubric already lives canonically in `skills/code-review/SKILL.md:25-30`, NOT duplicated in `agents/reviewer.md`. WORKFLOW-003 assumed an inline duplication that doesn't exist; pragmatic re-scope skips them.

T-S38 was re-scoped from "RELEASE/RUNBOOK/ANNOUNCEMENT body templates" (which also don't exist inline in `agents/ship.md`) to "smoke-test 5-step chain" — the actual heavy prose in ship.md is the 200-word smoke-test paragraph at line 70, not phantom body templates. Honors F-8's intent (extract heavy reference material from agent bodies) while correcting the task description.

Files changed:

- `skills/task-breakdown/references/autonomy-diagnostic.md` (new) — full 5-Q diagnostic + 3-axis decomposition + Consultant-inversion paragraph + worked example, lifted verbatim from `agents/lead.md:50-81`. Filed under `task-breakdown/` per D-2 lock-in. ~600 words.
- `skills/cut-release/references/smoke-checklist.md` (new) — canonical 5-step pre-release smoke chain, lifted from `agents/ship.md:70` and elaborated with failure-mode history + "why CI is insufficient" rationale. Loaded by `@ship` as Step 1 of its workflow when invoked via `cut-release`. ~350 words.
- `agents/lead.md` — `## Autonomy classification` section: 32 lines → 5 lines. Read-on-spawn directive + precedence rules + R-2 backstop. Saves ~470 words from `@lead`'s body per spawn after the first. Body word count: 954 → 689 (−265, measured).
- `agents/ship.md` — Step 1 of `## Workflow`: 1 paragraph (~200 words) → 3 lines. Step retains the smoke-test gate semantics; full chain lives in references file. Body word count: 854 → 766 (−88, measured).

Trigger semantics for the new references files:

- `@lead` Reads `skills/task-breakdown/references/autonomy-diagnostic.md` ONCE per feature_id, on first spawn. Subsequent spawns and `/orchestra resume` do NOT re-Read — the level is locked in `intent.yaml`. Backstop: missing Read defaults to `DRAFT_AND_GATE` + warning event.
- `@ship` Reads `skills/cut-release/references/smoke-checklist.md` exactly when the `cut-release` skill fires (i.e., `/orchestra release`). Not loaded for any other agent or any other subcommand.

Token reduction this PR (per agent, words; measured):

| Agent | Before | After | Δ |
|---|---|---|---|
| lead | 954 | 689 | −265 |
| ship | 854 | 766 | −88 |

Mean across all 8 agents: 715 → 671 (−44). Now under the WORKFLOW-003 §2.3 PR #3 mean target of ≤700 (achieved retroactively in PR #4 because lead/ship savings — particularly lead — were larger than estimated). Also caught a leaky cite I introduced during PR #4 authoring (`PRD-003 §S-DECISIONS-001` in the new autonomy-diagnostic.md references file) — validator surfaced it pre-commit; rephrased to drop the dev-trace cite per CLAUDE.md "Consumer surface MUST NOT cite developer-surface artifacts" rule.

`skills/*/references/*` files: 1 → 3 (was originally 1 baseline; +2 from this PR). PR #5's routing-taxonomy externalization will bring it to 4.

WORKFLOW-003 corrections logged (out of PR #4 scope; future workflow pass):

- T-S33 removed in PR #0 per D-2 override.
- T-S36/T-S37 were no-ops (severity rubric not duplicated inline).
- T-S38 re-scoped from "release templates" to "smoke-test chain".
- WORKFLOW-003's task descriptions assumed inline structures that don't exist in two places (PR #4 here, plus PR #1's `manifest.json` reference). Lesson: future workflow drafts should be authored after a measured pass through actual files.

### Refactor (PR #3 v1.0.1 — streamline plugin loading: tier-discipline collapse)

Closes WORKFLOW-003 §S-PRTASKS-001 PR #3 (T-S22..T-S32). Implements PRD-003 §S-FRS-001 F-5, F-6 — P1 cleanup tier of the streamlining initiative. The `## Tier discipline` + `## Hard boundaries` two-section pattern across all 8 agents collapses to a single `## Tier discipline` section: the tier letter + a one-line note that the `tools:` frontmatter is authoritative, followed by **only** agent-specific operational rules. Pure prose-only tier rules (the may/may-NOT lists that just restated the `tools:` array) are deleted per F-5: "Tier enforcement remains entirely via the `tools:` frontmatter."

Token reduction (per agent, words):

| Agent | Before | After | Δ |
|---|---|---|---|
| backend | 589 | 524 | −65 |
| frontend | 573 | 519 | −54 |
| product | 577 | 524 | −53 |
| reviewer | 867 | 744 | −123 |
| test | 808 | 761 | −47 |
| ship | 910 | 854 | −56 |
| evaluator | 974 | 840 | −134 |
| lead | 981 | 954 | −27 |
| **Total** | **6,279** | **5,720** | **−559** |
| **Mean** | **785** | **715** | **−70** |

Mean target was ≤700 (per WORKFLOW-003 §2.3 PR #3 exit). Actual landed at 715 — missed by 15 words/agent (~2%). Reviewer and evaluator saw the largest savings (−123 / −134) because their `## Hard boundaries` sections had the highest density of tier-restating bullets that collapsed cleanly. Lead saw the smallest (−27) because most of its operational rules were already concentrated in `## Hard boundaries` and survived the collapse.

T-S30/T-S31 deletes:
- `agents/evaluator.md` `## Task-status derivation (T-A; do NOT self-report)` section deleted (5 lines, ~50 words). The T-A `tools:` array (no Edit/MultiEdit) makes self-update of `plan/<NNN>-TASKS.md` structurally impossible — the prose was annotation creep, not load-bearing rule. Status derivation logic remains canonical at `commands/orchestra.md:233-236` (`/orchestra resume` Step 3).
- `agents/reviewer.md` same section deleted (5 lines, ~50 words). Same rationale.

What was preserved per agent (operational rules — NOT tier rules):
- backend: "only `@evaluator` runs verdict-bearing tests"; "do not interpret a green test run as success"; "do not touch frontend files"; upstream/release artifact scope rules; ESCALATE-ARCH for new infra.
- frontend: 4-state contract (loading/empty/error/success); accessibility AA; "do not touch backend"; ESCALATE-DESIGN for design-system mods.
- lead: "no code or tests"; CONTRACT must be probable; confidence-tier dialogue (HIGH=0/MEDIUM=1/LOW=2-3); 3 rejection rounds → DEADLOCK.
- product: "no source/tests/build config"; "no system design"; greenfield/brownfield Pattern B negotiation; "no pre-grading".
- reviewer: ≥80% confidence threshold; 4-round REQUEST_CHANGES → DEADLOCK; Critical → auto-REQUEST_CHANGES; "never patch the diff".
- ship: open DEADLOCK/gate/REQUEST_CHANGES blocks release; no review reversal; conflict-resolution between agents; drift-on-confirmed blocks release.
- test: cannot run tests yourself; mocks only at integration boundaries; every CONTRACT criterion needs ≥1 probe; 4-axis coverage matrix.
- evaluator: source/tests/CONTRACT all read-only; ≥80% confidence threshold; calibration Case 7 (critical-failure outranks probe results).

WORKFLOW-003 §2.3 estimated mean `wc -w agents/*.md` ≤ 700 (down from ~870). Actual delivery is recorded in this PR's smoke-fixture output. Pattern continues from PR #1/#2: estimates ran ~2× optimistic; actual savings positive but short of target by ~10–30%. Each PR is dialing in measurement accuracy.

### Refactor (PR #2 v1.0.1 — streamline plugin loading: subcommand demotion)

Closes WORKFLOW-003 §S-PRTASKS-001 PR #2 (T-S12..T-S14, T-S16..T-S21). Implements PRD-003 §S-FRS-001 F-4 — P0 demotion tier of the streamlining initiative. Net effect: the rare-path subcommands (`/orchestra resume|shutdown|release`) move out of the always-loaded dispatcher body into per-subcommand skills, paying their token cost only when actually invoked. Per D-1 (locked in PR #0): per-subcommand skills, not a single combined skill.

- `skills/resume-pipeline/SKILL.md` (new) — full topological-walk algorithm currently inline at `commands/orchestra.md:220-242`. ~500 words. Loaded only when `/orchestra resume` fires.
- `skills/shutdown-team/SKILL.md` (new) — in-session teardown algorithm. ~250 words. Loaded only when `/orchestra shutdown` fires.
- `skills/cut-release/SKILL.md` (new) — gate verification + RELEASE/RUNBOOK/ANNOUNCEMENT authoring + commit-work invocation. ~300 words. Loaded only when `/orchestra release` fires.
- `commands/orchestra.md` — five subcommand bodies replaced with dispatch shims:
  - `/orchestra release` (lines 196–201): 4-step body → 3-line shim invoking `cut-release`. Saves ~70 words.
  - `/orchestra commit` (lines 203–209): 6-line body → 1-line shim (commit-work skill was already in use; just trim prose). Saves ~40 words.
  - `/orchestra metrics` (lines 211–217): keep bash one-liner; cut surrounding prose. Saves ~25 words. T-S15 (skills/report-metrics/) explicitly NOT created — the metrics one-liner is too small to warrant its own skill, and T-S19 already mandates the inline keep. Caught WORKFLOW-003 internal contradiction between T-S15 and T-S19 during execution; T-S19 wins.
  - `/orchestra resume` (lines 219–242): 24-line body → 4-line shim invoking `resume-pipeline`. Saves ~430 words.
  - `/orchestra shutdown` (lines 244–254): 11-line body → 4-line shim invoking `shutdown-team`. Saves ~150 words.

T-S15 deferred (not implemented): per the contradiction above. Skills now created: 3 (resume-pipeline, shutdown-team, cut-release), not the 4 originally specified in WORKFLOW-003 §S-OVERVIEW-001.

Skill-triggering reliability (R-1 from DESIGN-004 §S-RISKS-001): each shim invokes its skill by explicit name (`invoke the cut-release skill`), not by auto-activation. Plugin-dev's auto-trigger via description-matching is a fallback, not the primary path. Subcommand parity smoke is the load-bearing exit gate; pre-PR baseline captured per `scripts/test-streamline-fixture.sh`.

### Refactor (PR #1 v1.0.1 — streamline plugin loading: P0 cleanup)

Closes WORKFLOW-003 §S-PRTASKS-001 PR #1 (T-S01..T-S09, T-S11). Implements PRD-003 §S-FRS-001 F-1, F-2, F-3 — the P0 cleanup tier of the streamlining initiative. Net effect: ~1,200 tokens saved per typical `/orchestra` feature run, with no behavior change. Smoke-test parity gated by static validators (`test-agents.js`, `validate.js`) since the smoke fixture (`scripts/test-streamline-fixture.sh` per WORKFLOW-003 P-S05) is not yet in place — full smoke chain runs before v1.0.1 RELEASE per the project's `feedback_smoke-before-release-docs` discipline.

- `agents/lead.md` — Routing-taxonomy guard collapsed from 14-line table to 3-line directive (T-S01). The dispatcher already enforces the whitelist at `commands/orchestra.md:153-156`; the agent-side restatement was defense-in-depth that cost ~150 tokens per `@lead` spawn. Schema-citation block (line 62 area) collapsed to single-line citation per F-2 (T-S02).
- `agents/product.md`, `agents/reviewer.md`, `agents/test.md`, `agents/ship.md`, `agents/evaluator.md` — schema-citation blocks each collapsed to single-line citation preserving the type-specific section list (T-S03..T-S07). Boilerplate prose explaining what `sections:` is moves into the schema doc itself; type-specific keys stay inline because they're agent-specific. ~80 tokens × 6 agents = ~480 saved per multi-agent run.
- `commands/orchestra.md` — `### Runtime hooks` table compressed from verbose 7-row prose (~600 tokens) to 5-row glossary (~150 tokens) (T-S08). Full hook prose moved to new dev-surface doc `docs/HOOKS.md`. The `## Invariants` block at line 13 already establishes hook ownership of events; the verbose table was duplicated runtime context that the model couldn't act on.
- `docs/HOOKS.md` — new dev-surface doc holding the full hook prose (T-S09). NOT loaded into consumer runtime context. Audience: plugin maintainers editing `hooks/scripts/*.js` or `hooks/hooks.json`.

WORKFLOW-003 corrections noted (will be applied in a later pass — out of PR #1 scope per surgical-changes discipline):

- T-S10 (version bump) deferred. WORKFLOW-003 referenced `manifest.json` which doesn't exist; the actual file is `.claude-plugin/plugin.json`. Per the project's `[Unreleased]` accumulation discipline (this CHANGELOG line 9), version flip happens at release-cut time, not at every PR.
- T-S11 lands as this CHANGELOG entry under `## [Unreleased]` (no per-PR version section).

Pre-existing drift NOT fixed in this change: `agents/lead.md`'s reference to `S-DAG-001` for the TASKS section persists (canonical anchor per `skills/task-breakdown/SKILL.md` is `S-TASKS-001`). Out of scope per surgical-changes discipline — same carve-out applied in the prior `/orchestra resume` PR (CHANGELOG entry above).

### Added (`/orchestra resume` + per-task Status tracking)

`plan/<NNN>-TASKS.md` `S-TASKS-001` table now carries optional `Status` / `Updated by` / `Updated at` columns. Implementer-tier owners (`@backend`, `@frontend`) self-report by flipping their row from `pending` to `in_progress` on pickup and to `done` on exit-criterion completion, re-stamping `S-TASKS-001.hash: TBD` on each write. Read-only-tier owners (`@evaluator`, `@reviewer`) do NOT self-report — their task status is derived at read time from the verdict frontmatter they own (`@evaluator` ⟺ `verify/<NNN>-TEST.md.verdict ∈ {PASS, FAIL}`; `@reviewer` ⟺ `verify/<NNN>-CODE-REVIEW.md.verdict ∈ {APPROVED, REQUEST_CHANGES}`). T-A tier discipline preserved — only T-C implementers gain a write target on TASKS.md. New `/orchestra resume [<feature-id>]` subcommand walks `pipeline/*/` dirs, identifies in-flight features by terminal-artifact absence, finds the next non-`done` task in the DAG (deriving T-A and T-B status from the artifacts they own), and respawns the owner with a resume-context prompt. Idempotent: re-spawning a partially-done owner is safe — owner Reads existing artifacts before re-writing.

Mock-test-phase delivery: ships end-to-end (state + subcommand + per-tier derivation) under `[Unreleased]`, no version flip. `S-TASKS-001.confirmed: false` is the existing escape hatch — `validate-drift` already gates on `confirmed`, so the now-mutable section requires no machinery change. Backward-compatible: TASKS.md authored before this change (no Status column) remain valid; readers treat a missing column as all rows `pending`. Schema bumped `revision: 2 → 3` per the schema's own versioning rule (type-specific keys added).

- `schemas/pipeline-artifact.schema.md` — `revision: 2 → 3`. PLAN-<id> additions: `tasks_pending` / `tasks_in_progress` / `tasks_done` derived counters; `S-TASKS-001.confirmed: false` contract; per-tier derivation rules (T-A from verdict, T-B from artifact existence, T-C self-reported); ESCALATE-on-feature-dir overrides task status with `blocked`; backward-compat note for pre-change TASKS.md.
- `skills/task-breakdown/SKILL.md` — frontmatter template flips `S-TASKS-001.confirmed: true → false` (inline rationale). Body table template gains `Status` / `Updated by` / `Updated at` columns with `pending` defaults; worked example updated; per-tier responsibility split documented inline.
- `agents/backend.md`, `agents/frontend.md` — workflow gains: pickup step flips `pending → in_progress`; exit step flips `in_progress → done` (re-stamp `S-TASKS-001.hash: TBD` on each). ESCALATE-on-block leaves Status `in_progress` so resume surfaces the ESCALATE rather than silently re-spawning.
- `agents/evaluator.md`, `agents/reviewer.md` — new `## Task-status derivation (T-A; do NOT self-report)` block (1 short paragraph each) makes the derivation contract explicit. T-A write whitelist unchanged.
- `commands/orchestra.md` — argument-parser gains `resume` branch; new `## /orchestra resume [<feature-id>]` block (6 numbered steps: enumerate candidates → validate prerequisites → find resume point → REQUEST_CHANGES gate → spawn → continue per Step 5/7); help text adds resume row; `Deferred (v1.1+)` line drops `/orchestra resume`.

Notes:

- No new hook (`task-row-guard` would be a feature add and is deferred per the Ratchet — there's no observed misbehavior to earn it; if a future test run shows an agent mutating another agent's row, ratchet it in).
- No new artifact type — state lives inline in `<NNN>-TASKS.md`, not in a companion `STATE.yaml`. The hash-stamper is untouched: `confirmed: false` is the canonical "this section is mutable by design" flag.
- REQUEST_CHANGES is a decision point, not an automatic transition: resume halts and asks via `AskUserQuestion` rather than auto-respawning the implementer for revision.
- Missing `intent.yaml` fails closed: resume writes `DEADLOCK-resume-<feature-id>.md` rather than re-classifying intent. Correctness, not phase — an unexpected missing-file state could mask a real bug at any phase, including production.
- Pre-existing drift NOT fixed in this change: `agents/lead.md:62` describes the TASKS section as `S-DAG-001` while the canonical anchor (per `skills/task-breakdown/SKILL.md`) is `S-TASKS-001`. Out of scope per surgical-changes discipline.

### Added (mid-run visibility + team shutdown — PRD-002 / DESIGN-003)

Closes spec drift against PRD-001 §347 / §561 / §627 (explicit teardown + `SUMMARY-<timestamp>.md`), which were written into the v1 PRD but never wired into the dispatcher. A user running `/orchestra <intent>` now (a) sees one-line status updates at every filesystem-coupled transition, (b) gets a multi-line banner when an exception artifact (`DEADLOCK-*.md`, `ESCALATE-*.md`, `ESCALATE-ARCH-*.md`) is read, and (c) gets automatic team teardown + a thin `SUMMARY-<feature-id>.md` closure receipt at every terminal state (success / deadlock / escalated / aborted). New `/orchestra shutdown` subcommand for in-session manual abort. The metrics-collector hook gains a `team.shutdown` event mirroring the existing `team.created` posture; SUMMARY artifact writes are enriched with `team_name` / `terminal_state` / `duration_seconds` via the same line-match-without-YAML-parser pattern used for `intent.yaml`.

Pre-flight verification surfaced one design correction: `TeamDelete` is a zero-parameter primitive (verified via ToolSearch 2026-05-05), not the TeamCreate-mirror signature initially assumed. This collapsed cross-session shutdown (structurally impossible) and slimmed the dispatcher edit by ~30 lines. Documented in DESIGN-003 §3.1.4 + §8 R6.

- `schemas/pipeline-artifact.schema.md` — `revision: 1 → 2`. New `SUMMARY-<id>.md` thin-receipt entry replaces the prior PRD-001-era thick-digest stub (`run_id` / `agents_used` / `total_token_in/out` / `features_touched` were never authored and would have duplicated `runs/<run-id>.json`). New entry: `team_name`, `started_at`, `ended_at`, `duration_seconds`, `terminal_state ∈ {success, deadlock, escalated, aborted}`, `artifact_count`. Body-grammar carve-out documented (no `<a id="S-...">` anchors required for SUMMARY since it's parent-authored bookkeeping with no `sections:` block). Layout tree + type→folder map row updated.
- `commands/orchestra.md` — new `## Status output` section (canonical contract for status lines + banners; per project CLAUDE.md folded once, not sprinkled per Step). New Step 7 (terminal-state detection → SUMMARY write → `TeamDelete()` → closing status line). New `## /orchestra shutdown` block (in-session only; rejects `<feature-id>` argument since current session has at most one active team). Argument-parse, runtime-hooks table, and help text updated to include `shutdown` and `PreToolUse:TeamDelete` / `team.shutdown` references.
- `hooks/scripts/metrics-collector.js` — minimal `PreToolUse:TeamDelete` branch emitting `team.shutdown { ts, run_id }` (zero-param primitive; nothing to lift from `tool_input`). New `extractSummaryFields()` mirroring `extractIntentFields()`. SUMMARY enrichment branch in the existing `artifact.written` flow.
- `hooks/hooks.json` — new `PreToolUse:TeamDelete` matcher routing to `metrics-collector.js`.
- `scripts/test-hooks.js` — `TeamDelete` added to the `KNOWN_TOOLS` set; new inverse-sanity check confirming `matcher: "TeamDelete"` passes the validator clean.
- `scripts/test-metrics.js` — three new event-classification cases: `TeamDelete` → `team.shutdown` (no extras); pipeline write of `SUMMARY-001-hello-world.md` → `artifact.written` enriched with `team_name` / `terminal_state` / `duration_seconds`; the SUMMARY case also pins `inferArtifactType("SUMMARY-001-...md") === "SUMMARY"` as a regression anchor for the new schema entry.
- `README.md` — usage block adds `/orchestra shutdown`; "What ships" subcommand count `5 → 6` and the inline enumeration extended.
- Test totals: `test-hooks.js` 79 → 79 (no new orchestra.md fixture assertions needed); `test-metrics.js` 82 → 91 (+9). `validate.js` 0 changes (it does not validate pipeline artifacts; SUMMARY carve-out is preventive at the schema level).

Notes:

- Pre-existing drift NOT fixed in this change: README usage block has long been missing `/orchestra metrics`. Out of scope per surgical-changes discipline.
- Smoke test of the consumer install path (`/tmp/test-orchestra-install`) is the gate before authoring RELEASE/RUNBOOK/ANNOUNCEMENT artifacts. In particular, verify `TeamDelete()` does not throw when called after agents have ended their turns — Orchestra's filesystem-coupled flow assumes SubagentStop drains active members synchronously by the time terminal state is detected; this is the failure mode flagged in DESIGN-003 §8 R6.

### Changed (insight text capture default `false` → `true`)

Flips the `capture_insight_text` default in `metrics/manifest.json` so `★ Insight` bodies emitted by the Explanatory output style are captured into `insights.jsonl` by default. Rationale: the field is the primary observability signal of the metrics pipeline, and prior smoke runs (`/tmp/orchestra-smoke-6/`) shipped 174 rows of empty `text:null` payload — the structural counts (`line_count`, `char_count`) without bodies aren't useful for tuning prompts or aggregating reasoning depth. The privacy triad is now mixed-by-design: `redact_prompts:true` (raw user input stays redacted) + `capture_insight_text:true` (model-emitted prose is captured). Consumers who want full redaction flip `capture_insight_text: false` directly in `<project>/.claude/.orchestra/metrics/manifest.json`; the existing `{...defaults, ...raw}` merge in `ensureManifest` honors that override on every subsequent hook trigger. No schema_version bump (the row shape is unchanged — only the value of an existing field shifts).

- `hooks/scripts/metrics-collector.js` — flip default in `ensureManifest`; update `=== Manifest + redaction ===` and `=== Insight extraction ===` doc-comments to describe the mixed posture and the new opt-out path.
- `scripts/test-metrics.js` — section 4c assertions invert: default capture path now asserts `text === insightBody1`; the manifest-flip half re-emits with `capture_insight_text:false` and asserts `text === null`.
- `docs/PRD-001.md` §9.9 — `manifest.json` default block (line ~810) flips; redaction-axis bullet (line ~819) rewritten to document the mixed posture intent. `body` field-name in the schema example (line 802) is pre-existing doc-drift vs the code's `text` — left untouched (orthogonal cleanup).
- `docs/DESIGN-001-infra.md` §3.6 — pre-flight + privacy-posture rows updated; mixed-posture rationale added inline so future readers don't reach for the symmetric default.
- `docs/DESIGN-002-leaves.md` §15 step 16 — single-line note flipped.

### Changed (artifact rename `<TYPE>-<id>` → `<id>-<TYPE>` + topical folder layout under feature pipeline dir)

Reorganizes pipeline artifacts for grep-ability and review-by-topic. Filenames flip so the feature id sorts first (`001-PRD.md` instead of `PRD-001.md`); per-feature artifacts move into 6 topical subfolders. Singletons (`SAD.md`, `RUNBOOK-vX.Y.Z.md`, `RELEASE-vX.Y.Z.md`) keep their existing locations and naming. Smoke-5 artifacts are not migrated — clean break, the next `/orchestra` run lands in the new layout.

**Layout** under `<project>/.claude/.orchestra/pipeline/<feature_id>/`:

| Folder | Holds | Author |
|---|---|---|
| `requirements/` | `<NNN>-PRD.md`, `<NNN>-FRS.md` | `@product` |
| `interfaces/` | `<NNN>-CONTRACT.md`, `<NNN>-API.openapi.yaml` | `@lead` |
| `design/` | `<NNN>-TDD.md` | `@lead` |
| `plan/` | `<NNN>-TASKS.md`, `<NNN>-IMPL-NOTES.md` | `@lead`, builders |
| `verify/` | `<NNN>-TEST.md`, `<NNN>-CODE-REVIEW.md`, `<NNN>-VERDICT.md` | `@test`, `@reviewer`, `@evaluator` |
| `release/` | feature-scoped `<NNN>-RELEASE.md` etc. (version-singletons stay at `releases/`) | `@ship` |

`intent.yaml` and exception files (`ESCALATE-<id>.md`, `DEADLOCK-<id>.md`) stay at the feature-dir root.

**Frontmatter `id:` flips too** — `id: 001-PRD` instead of `id: PRD-001`, matching the filename stem. The artifact's own `id:` is never used programmatically (only `references[].id` is, and that uses the feature_id matching the dir slug); the field is purely a grep/human label, so flipping it has zero code cost and pays back at search time.

- `schemas/pipeline-artifact.schema.md` — new `## Filename + folder layout` section with directory tree, type→folder map, rationale. Common-shape `id:` example flipped to `<feature_id>-<TYPE>`.
- `hooks/scripts/hash-stamper.js` — `resolveUpstream(type, id, root)` rewritten to use a `TYPE_FOLDER` map + `numericPrefix(id)` extractor. Builds `pipeline/${id}/${folder}/${num}-${TYPE}.${ext}`. Singleton paths unchanged.
- `scripts/validate-drift.js` — same resolver shape (mirrors hash-stamper). Walker still recurses `pipeline/`, `architecture/`, `runbooks/`, `releases/` — folder topology under each feature pipeline dir is implicit.
- 8 agent prompts (`product`, `lead`, `test`, `evaluator`, `reviewer`, `ship`, `backend`, `frontend`) — all path references updated to the new format. Worked examples flipped to concrete `requirements/001-PRD.md` / `verify/001-TEST.md` / `interfaces/001-CONTRACT.md` style. Frontmatter shape examples in `test.md`, `evaluator.md`, `reviewer.md` updated to `id: <NNN>-<TYPE>`.
- `commands/orchestra.md` — Step 5 routing taxonomy table updated for all 6 intents (docs/template/hotfix/feature/review-only/refactor) with new path-aware artifact lists.
- 6 skill files (`code-review`, `evaluator-tuning` + `references/calibration-examples.md`, `qa-test-planner`, `task-breakdown`, `write-contract`) — same sweep. Frontmatter shape examples and worked examples consistently flipped.
- Validator chain: 9/9 green. Counts unchanged.

### Fixed (hash-stamper grammar mismatch + greenfield SAD bootstrap gap)

Surfaced by `/tmp/orchestra-smoke-5`: every artifact landed with `hash-at-write: TBD` unresolved, and `architecture/SAD.md` was never created on the first feature of a greenfield project. Two distinct root causes:

1. **Frontmatter `sections:` shape mismatch.** `schemas/pipeline-artifact.schema.md` mandates a dict keyed by S-ID (`sections: { S-VISION-001: { hash, confirmed } }`), and `hooks/scripts/hash-stamper.js` writes through that shape. But `agents/product.md` and `agents/lead.md` only pointed at the schema doc with no inline guidance, so they emitted a list of `{name, hash-at-write}` instead — silently divergent. The four other agents (`test`, `evaluator`, `reviewer`, `ship`) had inline frontmatter examples already, all dict-keyed, all correct.
2. **Body anchor grammar was contract-only in code.** `hooks/lib/section-hash.js:8` keys section walks off the regex `/^##\s+.*<a id="(S-[A-Z]+-\d{3})"><\/a>/`, but no agent prompt or schema doc said so. Agents authored prose H2s without anchors → `hashSections()` returned `[]` → no hashes ever stamped, even when frontmatter was correct.
3. **Greenfield SAD never bootstrapped.** `agents/lead.md` routing table said feature intent produces `SAD.md (touch)`, but on the first feature of a greenfield project there's nothing to touch. No prompt branch handled the bootstrap case.

Fix shape — keep the contract in **one** place:

- `schemas/pipeline-artifact.schema.md` — new `## Body grammar` section spelling out the `<a id="S-FOO-001"></a>` H2-anchor rule, the regex from `section-hash.js`, and the bidirectional invariant (every `sections:` key needs an anchor and vice versa). Also tightened the authoring contract to state `sections:` is a dict, not a list. Single source of truth.
- `agents/product.md` — replaced the bare schema link with a sharper pointer naming the standard PRD/FRS sections (`S-VISION-001`, `S-GOALS-001`, `S-NON-GOALS-001`, `S-INVARIANTS-001`, `S-ACCEPTANCE-001`) and pointing at the new `#body-grammar` anchor. Workflow updated to remind that each H2 carries its anchor.
- `agents/lead.md` — sharper pointer naming standard CONTRACT/TDD/TASKS sections; new `## Greenfield SAD bootstrap` operational rule (if `local.yaml.mode == greenfield` AND `architecture/SAD.md` absent, bootstrap with `S-VISION-001` / `S-COMPONENTS-001` / `S-ADR-0001` before CONTRACT/TDD/TASKS).
- `agents/test.md`, `agents/evaluator.md`, `agents/reviewer.md`, `agents/ship.md` — one-line pointer to `#body-grammar` added in their frontmatter sections. No inline duplication.
- Validator chain: 9/9 green. Counts unchanged: validate, test-hooks 78, test-agents 16, test-bash-strip 6, validate-drift no-op, test-removability 36/15, test-metrics 82, test-bootstrap 37, test-probe 30. Live verification (consumer-side `/orchestra` run against fresh dir) gated on user invocation.

### Changed (consumer-surface dev/consumer separation — leaky-cite cleanup + schema relocation)

Establishes a hard line between the developer surface (`docs/`, `scripts/test-*`, `scripts/validate*`) and the consumer surface (`agents/`, `commands/`, `skills/`, `hooks/`, `schemas/`). A consumer who installs the plugin has no `docs/PRD-001.md`, `DESIGN-NNN-*.md`, or `WORKFLOW-NNN-*.md` on their machine — every cite of those by section anchor was either a phantom pointer (LLM cannot resolve) or a token-burning deferred Read. Inlining the rule and dropping the cite removes both costs. Schema doc relocated from `docs/` to `schemas/` because it's structurally consumer-facing (every agent that authors a pipeline artifact references it).

- `CLAUDE.md` (new, project-local) — codifies the dev/consumer separation rule, the inline-the-rule fix pattern, and the list of where dev-trace cites SHOULD go (CHANGELOG, commit messages, `docs/`).
- `scripts/validate.js` — new `findLeakyCites(relPath, raw)` exported function + walker over `agents/`, `commands/`, `skills/`. Canary character is `§`; 3 mutation tests assert leaky cite fails red, bare `§` (no doc prefix) fails red, clean body passes. Auto-enforces the rule on every CI run.
- Rename: `docs/pipeline-schema.md` → `schemas/pipeline-artifact.schema.md`. Joins JSON schemas under `schemas/` (existing pattern: `*.schema.json` for machine-readable, `*.schema.md` for prose). Schema is now consumer surface, not dev surface.
- 8 agent files (`backend`, `evaluator`, `lead`, `product`, `reviewer`, `ship`, `test`) — 25 leaky `§` cites stripped. Each cite's rule was already inline beside it; surgery was mostly delete-the-parenthetical.
- `commands/orchestra.md` — 12 leaky cites stripped (dispatcher header, autonomy/pause section header, step bullets, hook table cell, autonomy flag footer). Re-pointed `Step 6` and the `hash-stamper` row at `schemas/pipeline-artifact.schema.md`.
- 6 skill files (`code-review`, `commit-work`, `evaluator-tuning` + `references/calibration-examples.md`, `project-discovery`, `qa-test-planner`, `task-breakdown`) — 16 leaky cites stripped. `commit-work` worked example rewritten to a consumer-generic scenario (`feat(api): T-204 add /v1/users CRUD with cursor pagination`) — old example referenced `WORKFLOW-002-leaves §2.1` and `DESIGN-002 §3.1/§3.5`, which only exist in this repo.
- `schemas/pipeline-artifact.schema.md` (the moved file) — 6 internal `§` cites stripped (frontmatter scope line, prose intro, 4 inline YAML comments). Frontmatter `references.prd` block kept (provenance trail for repo maintainers; not LLM-read).
- 3 dev docs (`docs/PRD-001.md`, `docs/DESIGN-001-infra.md`, `docs/WORKFLOW-001-infra.md`) — path references updated to the new `schemas/` location for consistency.
- Validator chain: 9/9 green. Counts unchanged: validate (no leaks), test-hooks 78, test-agents 16, test-bash-strip 6, validate-drift no-op, test-removability 36/15, test-metrics 82, test-bootstrap 37, test-probe 30.

### Added (W2 — AI agent autonomy levels per PRD §8.14 + DESIGN-002 §10)

Implements the 5-tag autonomy surface (`EXECUTION_ONLY` / `JOINT_PROCESSING` / `OPTION_SYNTHESIS` / `DRAFT_AND_GATE` / `FULL_AUTONOMY`) with `DRAFT_AND_GATE` as the v1.0.0 hard-coded default. Pauses fire only at `DRAFT_AND_GATE`; other levels behave per PRD §8.14.3. Auto-classification by `@lead` is suggestion-only — never changes the level without user assent.

- `scripts/bootstrap-local.js` — fresh `local.yaml` now includes `autonomy:\n  level: DRAFT_AND_GATE`. Emitted by `render()` between `inferred:` and the trailing `notes:` block scalar so it groups with config-style keys.
- `scripts/validate.js` — new `validateLocalYamlContent(relPath, raw)` exported function + `VALID_AUTONOMY_LEVELS` constant. Mutation tests assert `level: BOGUS` fails red, all 5 valid tags pass, missing block passes (runtime applies the default). No file-walk in the plugin repo since `local.yaml` is consumer-side and gitignored.
- `commands/orchestra.md` — new "Autonomy resolution + pause transitions" section. Resolution precedence: `--autonomy=<tag>` CLI flag > `local.yaml.autonomy.level` > `DRAFT_AND_GATE`. Four `→ PAUSE-N` references to a single shared question-shape table (Step 3 fires PAUSE-1 after intent classification; Step 5 fires PAUSE-2/3/4 after `@product` PRD/FRS, `@lead` CONTRACT, `@reviewer` CODE-REVIEW). Compactness optimization: shared table referenced 4 times rather than 4 verbatim `AskUserQuestion` blocks (~17 net lines added vs ~30+ for verbatim). New `--autonomy <tag>` row in the Flags block.
- `agents/lead.md` — new `## Autonomy classification` body section. Vendors DESIGN-002 §10.2 (5-question diagnostic, first-yes-wins) + §10.3 (3-axis decomposition: strategy / decision / execution) for self-contained consumer installs. New Consultant-shaped `<example>` (Postgres vs DynamoDB datastore evaluation → suggested `OPTION_SYNTHESIS`). Frontmatter description unchanged at 9 words, well under the ≤30-word cap.
- `hooks/scripts/metrics-collector.js` — `extractIntentFields()` now returns `autonomy_level`; the field propagates through `artifact.written` events and lands on `runs/<run-id>.json.autonomy_level`. Privacy posture unchanged — autonomy_level is a 5-tag categorical, not user content; same `telemetry_optin: "explicit"` gate applies.
- `scripts/test-bootstrap.js` — render-shape assertion extended for `autonomy:` + `level: DRAFT_AND_GATE` (37 assertions, was 35).
- `scripts/test-metrics.js` — intent.yaml fixture now includes `autonomy_level: DRAFT_AND_GATE`; new section 4d with 4 assertions for `autonomy_level` propagation through `artifact.written` → run summary, plus inverse case for null when YAML omits the field. 82 assertions total (was 78).
- `scripts/test-hooks.js` — new doc-contract fixture asserting `commands/orchestra.md` references all 4 PAUSE-N transitions, the `--autonomy` flag, all 5 enum tags, the `AskUserQuestion` primitive, and the `local.yaml.autonomy.level` fallback. Pins spec→dispatcher fidelity. 78 assertions total.
- `CHANGELOG.md` — this entry.

### Changed (spec backfill — PRD/DESIGN/WORKFLOW revisions for W3 + W2 forward-spec)

Backfills the canonical spec for already-shipped W3 metrics work and forward-specs the W2 autonomy surface. PRD revision bumped 4→5. Commit `71e19ae`.

- `docs/PRD-001.md` — new `### 8.14 AI Agent Autonomy Levels` invariant (anchor `S-AUTONOMY-001`) with 5-tag table, default precedence, 4 pause transitions, auto-classification protocol, telemetry. §9.1 gains `/orchestra metrics` row + `--autonomy <tag>` flag. §9.9 fully rewrites the metrics schema with the shipped 5-sink reality (events.jsonl + tokens.jsonl + runs/<id>.json + insights.jsonl + manifest.json) and explicit privacy posture (`redact_prompts:true`, `capture_insight_text:false`, `telemetry_optin:"explicit"`). §9.11 reflects script-first bootstrap. §9.12 adds `autonomy: { level: <tag> }` to the `local.yaml` schema. §11.1 adds `test-bootstrap.js`, extends `test-metrics.js`, documents the aux tooling table. §12 extends the prepublishOnly chain.
- `docs/DESIGN-001-infra.md` — §2.1 plugin.json shape clarified (no redundant `hooks` field — auto-discovered by Claude Code; author as `{ "name": "..." }` object form; relative paths require `./` prefix). §3.6 metrics-collector rewritten to match shipped 5-sink reality with parent-vs-subagent disambiguation, plus the new `skill.invoked` and intent-decision enrichment events.
- `docs/DESIGN-002-leaves.md` — §4.1 bumped to 6 subcommands (added `metrics`); flag-parsing block extended for `--autonomy`/`--confidence`. §4.2 smart-router flow with explicit PAUSE-1..4 transitions and autonomy resolution at run start. New `## 10. Autonomy taxonomy` section (anchor `S-AUTONOMY-002`) with vendored 5-question diagnostic, 3-axis matrix, auto-classification protocol, pause integration table, manifest integration, telemetry.
- `docs/WORKFLOW-001-infra.md` — new §7 "Post-shipping addenda" covering W3 metrics-collector scope expansion, plugin.json hooks-field removal, script-first bootstrap, forward pointers to W2.
- `docs/WORKFLOW-002-leaves.md` — new §2.4 PR #8 with 8 streams (T-801..T-808). T-701 errata note (5 subcommands shipped, 4 originally specced). §3 dependency graph, R12 risk row, CI matrix, strict-serial cuts, effort estimate all updated for PR #8.

### Added (insight extraction — Explanatory Output style ★ Insight blocks → `metrics/insights.jsonl`)

Captures the model's reasoning depth as a first-class telemetry signal. Commit `a3dbde9`.

- `hooks/scripts/metrics-collector.js` — new `emitInsightsForSession(input, sessionPath, sessionId, role)` function. Scans the session jsonl for `★ Insight ─...─{20,}` blocks emitted by the model in `assistant` text content (regex tolerates optional backticks around the bracket lines per the canonical Explanatory Output style). Emits one `insight.emitted` row per block to `<cwd>/.claude/.orchestra/metrics/insights.jsonl` with `run_id` / `session_id` / `agent_role` / `insight_index` / `line_count` / `char_count` / `text`. Fired at `SubagentStop` (per-subagent insights) and at parent `Stop` (dispatcher's own insights), so a feature-flow run's full reasoning trail lands on disk without manual collection.
- `hooks/scripts/metrics-collector.js` — privacy default: `text: null`. Manifest gains `capture_insight_text: false` default; consumers flip to `true` to retain body text. Behaves analogously to the `redact_prompts` axis — count + length always available, body text gated.
- `hooks/scripts/metrics-collector.js` — `runs/<run-id>.json` gains `insights_count` field counting subagent insights observable at parent-Stop time (parent's own insights land a moment later, picked up by aggregators).
- `scripts/aggregate-metrics.py`, `scripts/metrics-summary.py` — both now read `insights.jsonl` and `manifest.capture_insight_text` for cross-folder rollup. `aggregate-metrics.py` adds the privacy axis (`Folders with capture_insight_text:true`) to the manifest rollup.
- `scripts/test-metrics.js` — new section 4c with 12 assertions: SubagentStop scans subagent jsonl, parses 2 insights, writes to insights.jsonl with correct `run_id`/`session_id`/`agent_role`/index; default `text:null`; flipping `capture_insight_text:true` retains body text on subsequent emissions.

### Fixed (post-1.0.0 hook matcher bug — surfaced by smoke #3)

- `hooks/hooks.json` — changed `"matcher": "Task"` to `"matcher": "Task|Agent"`. Smoke #3 of `/orchestra` revealed Claude Code's subagent-spawn tool is now named `Agent` (parent jsonl tool-name histogram: `Agent` 3×, `Task` 0×). The literal `Task` matcher silently never fired on real Agent calls, with two consequences: (1) `task.subagent.invoked` events never landed in events.jsonl, breaking the orchestration trace; (2) the `val-calibration` hook never injected the `<calibration-anchor>` block into evaluator prompts — load-bearing per PRD §9.9, would have silently failed on the first `feature` intent. Defensive `Task|Agent` alternation handles both names so older Claude Code versions (still using `Task`) keep working.
- `hooks/scripts/val-calibration.js` — same root-cause fix in the script. The line `const isTask = input.tool_name === "Task"` was the second half of the same matcher bug: even with the matcher fixed, the script would have silently passed through when invoked on `Agent` tool_name. Now accepts both literals.
- `hooks/scripts/metrics-collector.js` — classify branch updated to accept both `Task` and `Agent` for `task.subagent.invoked` emission.
- `scripts/test-hooks.js` — added "hooks.json matcher validation" section: parses hooks.json and asserts every PreToolUse matcher's atoms (split on `|`) are either a known Claude Code tool name (`Bash`/`Read`/`Write`/`Edit`/`MultiEdit`/`Glob`/`Grep`/`NotebookEdit`/`WebFetch`/`WebSearch`/`Agent`/`Task`/`TodoWrite`/`TeamCreate`) or a recognized MCP regex pattern (`mcp__*.*`). Plus mutation tests: synthetic `FakeTool` matcher fails red, alternation with one bad atom fails red, missing matcher key fails red. Plus inverse-sanity for the four real hooks.json patterns. **This closes the gap that let smoke #3's bug ship**: the prior tests called hook scripts directly with synthesized stdin, bypassing Claude Code's matcher routing layer — so the `Task` typo was invisible to CI. The validator catches future drift between hooks.json matchers and real Claude Code tool names. Plus a new `val-calibration` test case that drives the script with `tool_name: "Agent"` to assert calibration-anchor injection still works under the canonical name.

### Added (skill.invoked event + intent-decision insight enrichment)

Closes the last two observability gaps before smoke #4 (full feature flow). Smoke #3 didn't exercise either because docs intents skip both code paths.

- `hooks/hooks.json` — added `PreToolUse:Skill` matcher routing to metrics-collector. The orchestra agents author their decision-laden artifacts via skills (`task-breakdown`, `write-contract`, `qa-test-planner`, `code-review`, `project-discovery`, `commit-work`, `evaluator-tuning`, `java-source-intel`); without skill tracking, a feature-flow run's most consequential moments are invisible to events.jsonl.
- `hooks/scripts/metrics-collector.js` — new `skill.invoked` classify branch. Captures `skill` (the skill name, e.g. `write-contract`) and `args_summary` (first 200 chars of the args string). The skill cascade for a feature-intent run will emit one event per skill invocation, with `run_id` tied back to the spawning subagent via `task.subagent.invoked`.
- `hooks/scripts/metrics-collector.js` — semantic enrichment of `artifact.written` for `intent.yaml` writes. New `extractIntentFields()` helper mirrors the existing `extractBootstrapFields()` line-match-without-full-YAML-parser pattern; extracts `intent` / `confidence` / `pattern` fields and inlines them into the `artifact.written` event. This makes the routing decision (the *insight* — not just the fact-of-write) directly readable from events.jsonl. Same enrichment pattern can be applied to future artifact types (CODE-REVIEW verdict, VERDICT pass/fail, CONTRACT criteria count) without changing the event shape.
- `scripts/test-hooks.js` — `KNOWN_TOOLS` allowlist extended with `Skill`. The new matcher passes the validator clean.
- `commands/orchestra.md` — Runtime hooks table updated: `metrics-collector` row now lists 9 event kinds (added `skill.invoked` and the intent-fields enrichment of `artifact.written`).
- `scripts/test-metrics.js` — two new event-classification cases: a `Skill` invocation emits `skill.invoked` with skill_name + args_summary; an `intent.yaml` write with `intent: docs / confidence: HIGH / pattern: Pattern A` content emits `artifact.written` with all three fields populated alongside the standard `feature_id` / `artifact_type` / `file_name` / `tool` keys.

### Added (full observability via events.jsonl — replay smokes without Claude Code session jsonl)

Goal: every observable behavior of an `/orchestra` run lands in `<cwd>/.claude/.orchestra/metrics/events.jsonl` so the user (and downstream tooling) can reconstruct the trace without reading Claude Code's session jsonl. Smoke #3 forensics required `grep`-ing the parent's 200KB jsonl for `TeamCreate` input, `subagent_type` distribution, and `file_path` writes — all of which are now first-class events.

- `hooks/hooks.json` — added `PreToolUse:TeamCreate` matcher routing to metrics-collector.
- `hooks/scripts/metrics-collector.js` — three new/enriched events:
  - **`team.created`** (NEW) — fires on `PreToolUse:TeamCreate`. Captures `team_name`, `agent_type`, `description` (truncated to 200 chars). Surfaces the team boundary that previously lived only in Claude Code's session jsonl.
  - **`task.subagent.invoked`** (ENRICHED) — now also includes `agent_name` (the `name:` parameter, e.g. `@lead`), `team_name` (the team the subagent joined), `tool` (`"Task"` vs `"Agent"` — distinguishes legacy from canonical), and `prompt_summary` (first 200 chars of the prompt). Fully reconstructs the orchestration sequence: which agent role (`subagent_type`), under what handle (`agent_name`), in which team (`team_name`), with what kickoff prompt.
  - **`artifact.written`** (NEW) — fires on `PreToolUse:Write|Edit|MultiEdit` for any write under `<cwd>/.claude/.orchestra/pipeline/<feature-id>/<file>`. Captures `feature_id`, `artifact_type` (parsed from filename: `PRD`/`FRS`/`TDD`/`API`/`CONTRACT`/`CODE-REVIEW`/`ESCALATE`/`intent`/etc.), `file_name`, and `tool`. Reconstructs the artifact tree from events alone; routing-taxonomy violations become detectable as out-of-whitelist `artifact_type` values per intent.
- `hooks/scripts/metrics-collector.js` — new `inferArtifactType()` helper. Two patterns: uppercase-prefix-then-`-NNN` (e.g. `CODE-REVIEW-001-hello-world.md` → `CODE-REVIEW`), and known lowercase singletons (`intent.yaml` → `intent`). Falls back to `"unknown"` so the event is still emitted (run_id + file_name preserve traceability even when classification fails — useful signal for adding new artifact types).
- `commands/orchestra.md` — Runtime hooks table updated: `val-calibration` now documented as `PreToolUse:Task|Agent`; `metrics-collector` row enumerates all 7 emitted event kinds and states the goal explicitly ("events.jsonl alone reconstructs the full smoke trace").
- `scripts/test-metrics.js` — three new event-classification cases: canonical `Agent` invocation with full team/name fields; `TeamCreate` → `team.created`; pipeline writes (`PRD-001.md`, `CODE-REVIEW-001-hello-world.md` via Edit, `intent.yaml`) → `artifact.written` with correct artifact_type extraction.

### Fixed (post-1.0.0 install-path hotfix #3)

- `.claude-plugin/plugin.json` — removed the redundant `hooks` field. The Claude Code plugin loader auto-discovers `hooks/hooks.json` by convention; declaring it in plugin.json caused a `Hook load failed: Duplicate hooks file detected` error during install. Same root-cause class as the marketplace.json and 5-field schema fixes already documented in `[1.0.0]`: orchestra's plugin.json shape was authored from imagination rather than from the official Claude Code plugin reference. Commit `f00a415`.

### Fixed (post-1.0.0 runtime hotfix #1 — orchestration primitives)

- `commands/orchestra.md` — first runtime smoke-test on a fresh /tmp install surfaced three drift bugs against PRD §8.5/§9.4/§10.5: (a) the dispatcher had no `TeamCreate` step at all, so `/orchestra` ran solo without instantiating the persistent team; (b) Pattern B bootstrap was documented as optional rather than mandatory for first-run; (c) agent prompts didn't propagate the §10.5 frontmatter contract, so subagent writes landed without `sections:`/`references:` blocks. Rewritten with TeamCreate as Step 1, Pattern B mandate as Step 2, and an explicit "agents author frontmatter explicitly — do not rely on hash-stamper to create structural keys" note in each agent definition. Commit `fabffe6`.
- `agents/{product,lead,backend,frontend,test,evaluator,reviewer}.md` — added "Frontmatter contract" sections per PRD §10.5. Necessary because hash-stamper PreToolUse:Write hook attaches to the parent context; subagent-tier writes may bypass the hook, so the agent must author the structural keys (`sections:` + `references:`) explicitly. Hash-stamper still resolves `hash: TBD` and `hash-at-write: TBD` placeholders when it does fire. Commit `fabffe6`.

### Fixed (post-1.0.0 runtime hotfix #2 — TeamCreate primitive + filesystem comm)

- `commands/orchestra.md` — corrected the imagined `TeamCreate({members: [...]})` form (which would have failed at runtime — the actual primitive is `TeamCreate({team_name, agent_type, description})` plus per-member `Agent` calls passing `team_name`/`name`). Also locked down the inter-agent communication pattern: agents communicate via filesystem writes to designated paths, NOT via SendMessage. Reason: SendMessage is not in any tier set (T-A: `Bash/Glob/Grep/Read/Write`; T-B: `Glob/Grep/Read/Write`; T-C: `Edit/Glob/Grep/MultiEdit/Read/Write`), and adding it would break `test-agents.js` tier validation. Parent reads agent outputs on idle notification (Claude Code fires this automatically when a subagent's turn ends). Commit `0723756`.

### Added (script-first bootstrap with hook-only events.jsonl invariant)

- `scripts/bootstrap-local.js` — pure-inspector bootstrap. Runs greenfield/brownfield + language/framework detection from filesystem inspection, outputs JSON (`status`, `yaml_content`, `yaml_path`, `decision`) to stdout. **Does NOT write any files itself** — the dispatcher reads stdout and uses Claude Code's Write tool to put `yaml_content` at `yaml_path`. Confidence tiering: HIGH (clean greenfield or clean brownfield) / MEDIUM (source files but no commits) / LOW (commits but no source). Exports `listFiles`, `inspect`, `classify`, `pickLanguage`, `detectFramework`, `render`. Reason: smoke-test #2 showed the original Pattern-B-always bootstrap burned two agent contexts on every first-run for cases that filesystem inspection resolves deterministically in <50ms.
- `hooks/scripts/metrics-collector.js` — extended classify() with a PreToolUse:Write|Edit|MultiEdit branch that detects writes to `<cwd>/.claude/.orchestra/local.yaml` and emits a `local.bootstrapped` event with `mode`/`primary_language`/`framework` extracted from the proposed YAML content via line-match regexes (no full YAML parser; the hook stays stdlib-only and crash-resistant). Plus a header-comment expansion of the subscription list.
- `hooks/hooks.json` — added `metrics-collector` to the existing PreToolUse:Write|Edit|MultiEdit matcher (alongside `pre-write-check` and `hash-stamper`). The hook fires on the dispatcher's Write of local.yaml, observes the bootstrap, and emits the event.
- `commands/orchestra.md` — Step 2 rewritten as script-first tiered bootstrap. HIGH/MEDIUM confidence: dispatcher Bash-runs the script, parses JSON, Writes the yaml_content (the `metrics-collector` hook fires automatically and emits `local.bootstrapped`). LOW confidence or `status: ambiguous`: falls back to the original Pattern B two-agent flow. New "Conformance check" section locks in the **PRD §9.9 hook-only invariant**: the ONLY way `local.bootstrapped` lands in `events.jsonl` is via the metrics-collector hook firing on PreToolUse:Write of `local.yaml`. Scripts compute, the model writes, the hook observes and emits. Agents do NOT emit events.
- `scripts/test-bootstrap.js` — new contract-test file. 35 assertions across 5 scenarios: empty dir → greenfield/HIGH; src no commits → brownfield/MEDIUM; src + commits → brownfield/HIGH; commits no source → greenfield/LOW; render output shape (10 required keys + newline-termination + interpolation). Imports the module's exports directly (no subprocess) for granular assertions.
- `scripts/test-metrics.js` — added one classification case for `local.bootstrapped` (Write tool input with file_path ending `/.claude/.orchestra/local.yaml`). The existing `events.length === cases.length` assertion is self-counting, so adding the case auto-updates the expected count.
- `package.json` — `test:bootstrap` wired into the npm test chain (now 9 validators total).

### Fixed (routing-taxonomy fidelity — PRD §9.5 enforcement)

- `commands/orchestra.md` — Step 5 rewritten with an explicit per-intent artifact-whitelist table (docs / template / hotfix / feature / review-only / refactor → exact agent list + exact artifact list). The previous "for example, a feature intent spawns @product → @lead → ..." wording was non-binding; smoke-test #2 showed the dispatcher producing CONTRACT/TEST artifacts for a `docs` intent contrary to its own classification. The new table is the routing contract: dispatcher spawns ONLY the agents listed for the classified intent, and propagates the intent + whitelist into each spawned agent's prompt as a runtime invariant.
- `agents/lead.md`, `agents/product.md`, `agents/test.md` — added "Routing-taxonomy guard (PRD §9.5)" hard-boundary sections. Each agent reads `<cwd>/.claude/.orchestra/pipeline/<id>/intent.yaml` before authoring anything and refuses to write artifacts outside its per-intent whitelist (e.g., @lead refuses CONTRACT/TDD when `intent` is `docs`/`review-only`; @product refuses PRD/FRS for any intent except `feature`; @test refuses TEST-NNN.md for `docs`/`review-only` and refuses for `feature` if upstream CONTRACT is missing). Defense-in-depth pattern: dispatcher governs the happy path; agent guards catch manual invocations and future router bugs. Refusals write `ESCALATE-<id>.md` with explicit reason rather than silent no-op so routing bugs surface visibly.

## [1.0.0] — 2026-05-03

Initial release. See [`releases/RELEASE-v1.0.0.md`](releases/RELEASE-v1.0.0.md) and [`runbooks/RUNBOOK-v1.0.0.md`](runbooks/RUNBOOK-v1.0.0.md). Full v1.0.0 scope is specified in [`docs/PRD-001.md`](docs/PRD-001.md).

### Added (release-prep — install path + release artifacts)

- `.claude-plugin/marketplace.json` — Claude Code plugin marketplace manifest. Without it, `/plugin marketplace add hunghlh98/orchestra` fails with "Plugin not found in any configured marketplace" (caught during pre-tag smoke-test). Per https://code.claude.com/docs/en/plugin-marketplaces.md, Claude Code's plugin system separates marketplace discovery from plugin install — the orchestra repo acts as both (single-plugin marketplace named `orchestra-marketplace` listing the `orchestra` plugin via GitHub source). Consumer install is now a 2-step flow: `/plugin marketplace add hunghlh98/orchestra` → `/plugin install orchestra@orchestra-marketplace`. PRD §11.4 / G4 wording (single command) is technically a 2-step process; eligible for v1.0.1 PRD amendment but not blocking — both commands complete in <5 min, no setup wizard, intent of G4 satisfied.

### Fixed (release-prep — plugin.json schema)

- `.claude-plugin/plugin.json` — corrected 5 schema errors caught by `/plugin install` validation (per https://code.claude.com/docs/en/plugins-reference.md#plugin-manifest-schema):
  - `author` was a string `"hunghlh98"`; Claude Code requires an object. Fixed to `{ "name": "hunghlh98" }` (email omitted to keep PII off the public manifest).
  - `hooks`, `mcpServers`, `agents[]`, `commands[]` — all relative paths must start with `./`. Fixed all 11 path references.
- This pair of fixes (marketplace.json + plugin.json schema) both stem from the same root cause: the orchestra PRD and DESIGN docs specified manifest shapes from imagination rather than from the official Claude Code plugin reference. CI validators only checked our internal invariants — none compared against Claude Code's actual schema. v1.0.1 candidate: extend `validate.js` to walk plugin.json and assert (a) `author` is an object with `name`; (b) all relative paths in `hooks`/`mcpServers`/`agents[]`/`commands[]` start with `./`. `claude plugin validate .` only validates the marketplace manifest (not plugin.json deeply), so we cannot rely on the upstream CLI to catch this drift.
- `releases/RELEASE-v1.0.0.md` — inaugural release notes per `agents/ship.md` workflow + `docs/pipeline-schema.md` RELEASE shape. Sections: Summary, Included PRs (#1..#7 with commit refs), Gates Cleared, Composition table, Migration Notes (2-step install), Known Limitations (NoSQL probes deferred, WITH/CTE rejected, specialist agents deferred, etc.), What's Next.
- `runbooks/RUNBOOK-v1.0.0.md` — install + smoke-test runbook. Topology fully new (5 hooks + 2 MCPs + 8 agents + 8 skills + 1 cmd + 12 rules). Sections: Topology Changes, Pre-deploy Verification, Deploy Steps (2-step install), Rollback (`/plugin uninstall` + optional state cleanup), Smoke Test (5-step post-deploy verification), Observability.
- `README.md` — full rewrite from in-development scaffold. Adds: 2-step install instructions, 5-subcommand usage table, what-ships count table (8/8/12/1/5/2), 3-bullet architecture summary (gen/eval separation, doc-driven gates, capability-first models), env-var configuration, 8-validator overview.
- `CHANGELOG.md` — `[Unreleased]` flipped to `[1.0.0] — 2026-05-03` per Keep-a-Changelog spec; fresh empty `[Unreleased]` placeholder retained for v1.1+ work.

### Added (PR #7 — /orchestra command + 12 rule files + validator extensions)

- `commands/orchestra.md` — dispatcher per DESIGN-002-leaves §4.1. Five subcommand sections: smart-router (default natural-language path), `sprint`, `release`, `commit`, `help`. Frontmatter: `name` / `description` / `argument-hint`. Body documents the 10-step smart-router flow (PRD §9.1 + §9.4 + §9.5 + §9.11), the AskUserQuestion budget per PRD §8.11 (HIGH=0 / MEDIUM=1 / LOW=2–3, hard cap 3), and the circuit-breaker / DEADLOCK resume reference (PRD §9.6 + §9.6.1). `/orchestra commit` invokes the `commit-work` skill directly with no team.
- `rules/common/coding-style.md` (P1) — `paths: ["**/*"]`. 5 rules covering naming, single-responsibility, constants, public-API contracts, and surrounding-style consistency. Body 25 lines.
- `rules/java/coding-style.md` (P0) — `paths: ["**/*.java"]`. 5 rules: `final`, casing conventions, `Optional<T>` over null, `var` heuristics, no wildcard imports. Body 25 lines.
- `rules/java/patterns.md` (P0) — composition over inheritance, single `@Transactional` boundary per use case, builders for >3-field objects, constructor injection over `@Autowired` field injection, `record` for immutable DTOs. Body 25 lines.
- `rules/java/security.md` (P0) — parameterized JPQL/SQL, `@Valid` at controller boundary, BCrypt/Argon2 password hashing, externalized secrets, redacted PII logging via MDC. Body 25 lines.
- `rules/java/testing.md` (P0) — one behavior per test, AssertJ over vanilla JUnit, `@Mock`/`@InjectMocks` over `@MockBean` for unit tests, Testcontainers for integration scope, behavioral test names. Body 27 lines.
- `rules/typescript/coding-style.md` (P0) — `paths: ["**/*.ts","**/*.tsx"]`. `strict: true`, `type` vs `interface` heuristics, no `any` (use `unknown`), `readonly`/`as const`, `import type`. Body 25 lines.
- `rules/typescript/patterns.md` (P0) — discriminated unions over boolean flags, Result-style returns over throw, functional pipelines, co-location of types, string-literal unions over enums. Body 24 lines.
- `rules/typescript/security.md` (P0) — Zod/io-ts at boundary, output sanitization, no `eval`/`new Function(user_input)`, `process.env` validation, no `dangerouslySetInnerHTML` without DOMPurify. Body 25 lines.
- `rules/typescript/testing.md` (P0) — public-API testing, Vitest/Jest with coverage, mock external boundaries only, one behavior per `it`, snapshots last-resort. Body 26 lines.
- `rules/{go,python,kotlin}/coding-style.md` (P2 stubs) — minimal placeholder per DESIGN-002 §5.4 template (~9 body lines each). Activates path-glob (`**/*.go` / `**/*.py` / `**/*.kt` + `**/*.kts`), documents intent, points to canonical formatter/linter and language style guide. Full rule sets land in v1.1+.
- `.claude-plugin/plugin.json` — added `commands` array referencing `commands/orchestra.md`. `agents` and `commands` are independent keys per PRD §8.7 amendment (R10 Option A).
- `manifests/install-modules.json` += 13 entries: 1 command (`command.orchestra`) + 12 rules (`rule.common-coding-style`, `rule.java-{coding-style,patterns,security,testing}`, `rule.typescript-{coding-style,patterns,security,testing}`, `rule.{go,python,kotlin}-coding-style`). All `defaultEnabled: true`, `stability: stable`.
- `scripts/validate.js` — extended with two new walks:
  - `rules/**/*.md` — frontmatter parses; `paths:` is a non-empty array of non-empty strings; body ≤40 lines (PRD §10.3 + §8.8). Exported as `validateRuleContent(relPath, raw)`.
  - `commands/*.md` — frontmatter has `name` and `description` strings (PRD §10.4). Exported as `validateCommandContent(relPath, raw)`.
  - 7 inline mutation tests (run-when-main): rule body >40 lines fails red; rule missing `paths:` fails red; rule with non-array `paths:` fails red; command missing `name` / `description` fails red; clean rule + clean command fixtures pass.

Per R10 Option A: rules and commands are **not** in runtime-toggles.json (toggle by editing `paths:` globs or removing `commands` array entries). test-removability now reports **36 modules / 15 toggles** — the final v1.0.0 count.

### Added (PR #6 — 8 agents + plugin.json wiring + validator extensions)

- `agents/product.md` — T-B tier (Implementation-restricted). Authors PRD/FRS, negotiates greenfield/brownfield classification. Tools: Read/Grep/Glob/Write. Skill: project-discovery.
- `agents/lead.md` — T-B tier. Classifies routed intent, authors CONTRACT/TDD/TASKS, owns spec-phase negotiation. Skills: task-breakdown, project-discovery, write-contract.
- `agents/backend.md` — T-C tier (Implementer, Bash stripped). Server-side code + unit tests. Tools: Read/Grep/Glob/Write/Edit/MultiEdit. Skill: java-source-intel (P1).
- `agents/frontend.md` — T-C tier. UI components + state + a11y. Hard boundary: ships only with all 4 states wired (loading/empty/error/success).
- `agents/test.md` — T-C tier. Authors TEST-NNN.md and test-source files; never grades (verdict block left empty). Skill: qa-test-planner.
- `agents/evaluator.md` — T-A tier (Strict read-only +Bash +Write-verdict). Runs probes, grades CONTRACT criteria, writes TEST-NNN.md verdict block. Calibration auto-injected via val-calibration hook (PR #3 + PR #5 source).
- `agents/reviewer.md` — T-A tier. Severity-graded review (Critical/Major/Minor/Nit) with ≥80% confidence threshold and 4-strike circuit breaker. Skill: code-review.
- `agents/ship.md` — T-B tier. Authors RELEASE/RUNBOOK/ANNOUNCEMENT artifacts and Conventional Commits. Skill: commit-work. Will not ship if any gate is open or any drift-on-confirmed flag is set.
- `.claude-plugin/plugin.json` — `agents` array populated with all 8 agent paths (T-601..T-608 order: product, lead, backend, frontend, test, evaluator, reviewer, ship).
- `scripts/test-agents.js` — replaced PR #1 stub with full 7-check validation per DESIGN-002-leaves §2.3: (1) all 6 required frontmatter keys present; (2) name in valid set + matches filename; (3) description ≤30 words; (4) tools array exactly matches one of three tier sets (T-A/T-B/T-C, sorted comparison); (5) model id ∈ known-models.json; (6) context_mode ∈ that model's supportsContextMode; (7) body has ≥1 `<example>...</example>` block. Mutation tests: 7 fixtures (missing model, tools-tier mismatch, unknown model, context_mode mismatch, missing example, description over cap, invalid name) plus 1 inverse-sanity. Refactored to run-if-main pattern so test-bash-strip.js can import `parseAgentFrontmatter` without side effects.
- `scripts/test-bash-strip.js` — replaced PR #1 stub with hard-coded `IMPLEMENTER_AGENTS = {backend, frontend, test}` check. Asserts `Bash` ∉ tools for each implementer. Mutation test verifies a T-C agent gaining Bash is flagged red; inverse fixtures confirm T-A (evaluator/reviewer with Bash) and T-B (product without Bash) remain valid. Imports `parseAgentFrontmatter` from test-agents.js to avoid duplicate parser logic.
- `manifests/install-modules.json` += 8 agent entries (`agent.product`, `agent.lead`, `agent.backend`, `agent.frontend`, `agent.test`, `agent.evaluator`, `agent.reviewer`, `agent.ship`). All `kind: agent`, `defaultEnabled: true`, `stability: stable`.

Per R10 Option A: agents are **not** in runtime-toggles.json. test-removability now reports **23 modules / 15 toggles** (15 from PR #1–#5 + 8 agents). Final v1.0.0 count after PR #7 will be 36 modules / 15 toggles.

### Added (PR #5 — 8 skills + calibration source + validator extensions)

- `skills/task-breakdown/SKILL.md` — P0 skill consumed by `@lead`. Decomposes intent into a task graph with SP estimates, owner assignments, and dependency edges. Includes SP rubric (1/2/3/5/8/13) and 6-step decomposition flow.
- `skills/project-discovery/SKILL.md` — P0 skill consumed by `@product` and `@lead`. Returns `{ has_source, primary_language, framework, scope_hints, mode }` snapshot. Language/framework signature tables; brownfield/greenfield classifier.
- `skills/code-review/SKILL.md` — P0 skill consumed by `@reviewer`. Severity-graded review (Critical/Major/Minor/Nit), per-language gates via `rules/<lang>/`, security/performance checklists, 80% confidence threshold, 5-signal confidence rubric.
- `skills/qa-test-planner/SKILL.md` — P0 skill consumed by `@test`. Maps CONTRACT criteria to probes via orchestra-probe MCP; 4-axis coverage strategy (happy/boundary/error/idempotency); 8 standard adversarial fuzz patterns.
- `skills/commit-work/SKILL.md` — P0 skill consumed by `@ship` and `/orchestra commit`. Conventional Commits 1.0.0 type/scope/subject/body/trailer formatter with repo-specific scope conventions (infra, hooks, mcp, agents, skills, rules, command, spec, validators).
- `skills/write-contract/SKILL.md` — P0 skill consumed by `@lead`. CONTRACT-NNN.md authoring: weighted criteria (sum to 100), `critical:` flag semantics, Probe DSL (status / body_contains / rows_count / etc.), `passing_score:` policy.
- `skills/evaluator-tuning/SKILL.md` — P0 skill consumed indirectly by `@evaluator` via the val-calibration hook. Wraps the calibration source with verdict semantics (PASS/FAIL/pending) and an 8-case boundary index.
- `skills/evaluator-tuning/references/calibration-examples.md` — **Load-bearing.** Read by `hooks/scripts/val-calibration.js` on every `Task(subagent_type=evaluator)` spawn and prepended as `<calibration-anchor>...</calibration-anchor>`. Contains 8 worked PASS/FAIL/pending boundary cases per DESIGN-002-leaves §6.3 (empty-body assertion, near-timeout, partial-pass weighting, replay attack, redirect chain, redacted DB field, critical-fail outranking probes, drift mid-test).
- `skills/java-source-intel/SKILL.md` — P1 skill consumed by `@backend` on Java/Spring projects. ripgrep recipe library: caller graphs, `@Transactional` boundary scans, JPA entity impact, Spring component injection sites, common refactor scans.
- `scripts/validate.js` — extended to walk `skills/*/SKILL.md`. Asserts: frontmatter has `name`/`description`/`origin`; `name` === parent folder; description ≤200 chars; body ≤400 lines. Frontmatter parsing reuses `hooks/lib/yaml-mini.js`.
- `scripts/test-hooks.js` — val-calibration assertion flipped from passive (PR #3 graceful no-op: "no `updatedInput`") to active. Now asserts: calibration source exists, `updatedInput.prompt` contains `<calibration-anchor>` + `</calibration-anchor>`, original prompt preserved at end.
- `manifests/install-modules.json` += 8 skill entries (`skill.task-breakdown`, `skill.project-discovery`, `skill.code-review`, `skill.qa-test-planner`, `skill.commit-work`, `skill.write-contract`, `skill.evaluator-tuning`, `skill.java-source-intel`).
- `manifests/runtime-toggles.json` += 8 env-var toggles 1:1 with the install-modules entries (`ORCHESTRA_SKILL_*`).
- test-removability now reports **15 modules / 15 toggles** (7 from PR #1–#4 + 8 skills). Final v1.0.0 count after PR #6/#7 will be 36 modules / 15 toggles per R10 Option A scope.

### Changed (PR #5)

- `docs/PRD-001.md` — revision 4. §8.7 amendment per T-PA-01 (R10 resolution): env-var toggles cover only **skill / hook / MCP**. Agents toggle via `plugin.json.agents` removal; rules via `paths:` glob editing; commands via `plugin.json.commands` removal.

### Added (PR #4 — MCPs orchestra-fs + orchestra-probe)

- `scripts/mcp-servers/orchestra-fs.js` — MCP server exposing one tool: `tree`. Stdlib `fs.readdir` walker producing tree-style output. Path-escape rejection (`..` outside cwd). Ignore globs default to `node_modules`, `.git`, `.venv`. Honors `ORCHESTRA_MCP_ORCHESTRA_FS=off`.
- `scripts/mcp-servers/orchestra-probe.js` — MCP server with two tools:
  - `http_probe`: HTTP/HTTPS request via `node:http`/`node:https`. Configurable timeout, max_body_bytes (truncation), follow_redirects. Response headers filtered (`Set-Cookie`, `Authorization` stripped). Response body passes through 8-pattern secret-redaction.
  - `db_state`: SELECT-only enforced via first-significant-token check. Per-row body redaction. Row cap default 100 (max 1000). Timeout default 5s (max 30s). DSN credentials masked in any log output.
  - **R4 decision**: WITH/CTE rejected in v1.0.0 (CTE rejected with same SELECT-only message). Conservative because PostgreSQL allows DML inside CTEs (`WITH ... INSERT ...`). v1.1+ extends with proper SQL parsing.
  - **Scope reduction**: PostgreSQL and MySQL DSN dispatchers throw a clear "deferred to v1.1+" message. The MCP API surface (DSN format, tool schema) is locked now; v1.1 only adds CLI dispatch.
- `scripts/test-probe.js` — 25+ assertions: redact() unit, http_probe round-trip (status, body redaction, timeout, body truncation), db_state on tmp sqlite (parameterized SELECT, redaction in result, row_cap, INSERT rejected, WITH rejected, comments-before-SELECT allowed, postgres/mysql deferred messages), treeImpl path-escape, MCP JSON-RPC `tools/list` smoke for both servers, env-var opt-out.
- `.claude-plugin/.mcp.json` — registers both servers via `${CLAUDE_PLUGIN_ROOT}`.
- `.claude-plugin/plugin.json` — added `hooks` and `mcpServers` references (lazy until corresponding files arrived).
- `.gitignore` — `scripts/mcp-servers/*` allow-list per PRD §11.3 (only the 2 shipped MCP scripts tracked).
- `manifests/install-modules.json` += 2 mcp entries; `manifests/runtime-toggles.json` += 2 toggles. test-removability now reports 7 modules / 7 toggles.
- `package.json` — added `test:probe` to npm test chain. CI now runs 8 validators.

### Added (PR #3 — remaining 4 hooks + metrics tests)

- `hooks/scripts/pre-write-check.js` — Blocker hook. Detects 8 secret patterns (AWS keys, GitHub PATs, JWTs, RSA/EC private keys, Slack tokens, Google API keys, Bearer/Basic auth) and exits 2 on hit. Skips lines containing `process.env.`, `${`, `placeholder`, `<your-`, `example`, `test-fixture`. Per PRD §9.9 / DESIGN-001-infra §3.2.
- `hooks/scripts/post-bash-lint.js` — Observer hook. Surfaces source-modifying Bash commands (`npm/yarn/pnpm install`, `sed -i`, `tee`, source-file redirects) to stderr. Exits 0 always.
- `hooks/scripts/val-calibration.js` — Rewriter hook. Injects `<calibration-anchor>` block into `@evaluator` Task prompts when the calibration source file exists. Graceful no-op until `skills/evaluator-tuning/` ships in PR #5.
- `hooks/scripts/metrics-collector.js` — Observer hook (multi-event). Subscribed to UserPromptSubmit, PreToolUse(Task), PreToolUse(mcp__orchestra-*), SubagentStop, Stop. Routes by `hook_event_name` to one of 5 event types; appends to `<cwd>/.claude/.orchestra/metrics/events.jsonl`. 50MB rotation with 5-archive retention; configurable via `ORCHESTRA_METRICS_ROTATE_BYTES`.
- `scripts/test-metrics.js` — JSONL append safety (100 sequential), rotation (gzipped archive at threshold), retention (≤5 archives), event classification (6 cases), env-var opt-out.
- `hooks/hooks.json` — full hook registration: 5 hooks across 6 event types/matchers.
- `manifests/install-modules.json` += 4 hook entries; `manifests/runtime-toggles.json` += 4 toggles. test-removability now reports 5 modules / 5 toggles.
- `package.json` — added `test:metrics` to npm test chain.
- `scripts/test-hooks.js` — extended with pre-write-check (5 cases incl. Edit-tool branch), post-bash-lint (3), val-calibration (5).

### Added (PR #2 — hash-stamper + validate-drift)

- `hooks/lib/yaml-mini.js` — frozen-grammar YAML parser/serializer (PRD §8.13).
- `hooks/lib/section-hash.js` — canonical SHA256 over normalized section content. Shared by hash-stamper and validate-drift.
- `hooks/scripts/hash-stamper.js` — PreToolUse hook that stamps section hashes into orchestra artifact frontmatter; resolves `references[].hash-at-write: TBD` from upstream artifacts.
- `hooks/hooks.json` — registers hash-stamper for Write/Edit/MultiEdit.
- `scripts/validate-drift.js` — full drift-detection algorithm replacing PR #1's empty-tree stub. Walks artifacts, recomputes hashes, classifies findings (drift-on-confirmed → fail; drift-on-inferred → warn).
- `scripts/test-hooks.js` — yaml-mini round-trip + section-hash regression + hash-stamper integration + validate-drift fixture cases (clean / drift-on-confirmed / drift-on-inferred) + env-var opt-out.
- `docs/pipeline-schema.md` — type-specific frontmatter shapes for every artifact type per PRD §10.5.
- `manifests/install-modules.json` += `hook.hash-stamper`; `manifests/runtime-toggles.json` += `ORCHESTRA_HOOK_HASH_STAMPER`.

### Added (PR #1 — manifests + CI scaffold)

- `manifests/install-modules.json`, `manifests/runtime-toggles.json`, `manifests/known-models.json`.
- `schemas/` IDE-time JSON Schemas for the three manifests.
- `.claude-plugin/plugin.json` minimal scaffold.
- `scripts/validate.js`, `scripts/test-removability.js`, `scripts/test-hooks.js`, `scripts/test-agents.js`, `scripts/test-bash-strip.js`, `scripts/validate-drift.js`.
- GitHub Actions CI running all six validators on every push and PR.
- `.gitignore` for `node_modules`, `.venv/`, and consumer-side `.claude/.orchestra/{local.yaml, metrics, sessions}` per PRD §11.2.

