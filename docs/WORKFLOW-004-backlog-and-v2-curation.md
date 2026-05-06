---
id: WORKFLOW-004
title: Backlog mechanism + v2.* curation pass — implementation workflow
created: 2026-05-06
revision: 1
status: planned
upstream:
  - PRD-004 §S-DECISIONS-001
  - DESIGN-007 §S-PRSEQ-001
  - DESIGN-007 §S-RISKS-001
sections:
  S-OVERVIEW-001:  { hash: "TBD", confirmed: true }
  S-PREFLIGHT-001: { hash: "TBD", confirmed: true }
  S-PRTASKS-001:   { hash: "TBD", confirmed: true }
  S-DEPS-001:      { hash: "TBD", confirmed: true }
  S-RISKS-001:     { hash: "TBD", confirmed: true }
  S-CI-001:        { hash: "TBD", confirmed: true }
  S-OUT-001:       { hash: "TBD", confirmed: true }
  S-HANDOFF-001:   { hash: "TBD", confirmed: true }
---

# WORKFLOW-004 — Backlog mechanism + v2.* curation pass — implementation workflow

> Output of `/sc:sc-workflow` against `docs/DESIGN-007-backlog-and-v2-curation.md`. Carves §S-PRSEQ-001 (PR #1..#5) into a dependency-ordered task graph with per-PR task IDs, exit gates, smoke gates, and risk attachments. Consumed one PR at a time by `/sc:sc-implement`. After PR #5 merges, the v2.2.0 cut is feature-complete pending release-time polish (CHANGELOG entry, version bump, RELEASE/RUNBOOK if any consumer-impacting changes warrant them).

## 1. Overview <a id="S-OVERVIEW-001"></a>

Three themes ship under v2.2.0 across 5 PRs:

| Theme | PRs | Total tasks | Estimated effort |
|---|---|---|---|
| α — backlog mechanism | PR #1 | 5 tasks | 0.5 contributor-day |
| α phase 2 — cleanup migration | PR #2 + PR #3 | 16 tasks | 0.75 contributor-day |
| β — `/orchestra sprint --think` + `--delegate` + PLAN artifact | PR #4 | 10 tasks | 1.0 contributor-day |
| γ — consumer-observed token cost | PR #5 | 8 tasks | 0.5 contributor-day |
| **Total v2.2.0** | **5 PRs** | **39 tasks** | **~2.75 contributor-days serial** |

With PR #4 ∥ PR #5 split (independent of each other and of PR #1-#3 once those land), realistic wall-clock is ~2.0 days.

Task IDs follow the pattern `T-04-NN` (NN zero-padded, sequential across the whole workflow; PR-boundary breaks are documentation only — IDs do not reset per PR).

## 2. Pre-flight <a id="S-PREFLIGHT-001"></a>

Before PR #1 begins, confirm:

| Check | How |
|---|---|
| PRD-004 + DESIGN-007 are committed to `master` | `git log --oneline docs/PRD-004-backlog-mechanism-and-v2-curation.md docs/DESIGN-007-backlog-and-v2-curation.md` shows entries |
| `master` is clean | `git status` shows no uncommitted changes |
| Existing test chain green | `npm test` passes |
| Plugin smoke is green at the v2.1.0 baseline | Per `feedback_smoke-before-release-docs` memory, run the 5-step consumer install chain once at v2.1.0 to capture the baseline |

If pre-flight fails, halt; surface the failure to the user. Do not start PR #1 against a red baseline.

## 3. Per-PR task graphs <a id="S-PRTASKS-001"></a>

### 3.1 PR #1 — `feat(infra): docs/BACKLOG.md migration + validator` (theme α)

| Task | Description | Files | Notes |
|---|---|---|---|
| **T-04-01** | Create `scripts/migrate-backlog.js` per DESIGN-007 §3.5. Single CLI; reads PRD-004 §3.1 KILL + §3.2 DEFER tables; refuses overwrite; `--force` override; `--dry-run` for preview. | `scripts/migrate-backlog.js` (new) | Pure Node ESM; no deps beyond stdlib. |
| **T-04-02** | Run `node scripts/migrate-backlog.js` to produce initial `docs/BACKLOG.md` with 28 entries (12 killed + 16 deferred). Verify IDs `BL-0001..BL-0028` assigned in PRD-004 row order. | `docs/BACKLOG.md` (new) | Migration is one-shot; the file is committed alongside the script. |
| **T-04-03** | Create `scripts/validate-backlog.js` per DESIGN-007 §3.4. 5 hard-fail checks (missing-body, orphan-section, bad-status, bad-ID, schema-version) + 1 warn (ID-gap inside open statuses). | `scripts/validate-backlog.js` (new) | Pure-function checks; no deps. |
| **T-04-04** | Add `test:validate-backlog` script entry to `package.json`; chain into the existing `test` script. | `package.json` | Mirrors the existing `test:validate` / `test:hash-stamper` / `test:scaffold` pattern. |
| **T-04-05** | Run `npm test`; verify green. | — | Exit gate. |

**Exit gate (PR #1):** `node scripts/validate-backlog.js` passes against the new BACKLOG.md (28 rows + 28 body sections; status enum honored; IDs unique and well-formatted); `npm test` green.

**Risk attachment:** R-4 (validator brittleness over hand-edits) — partial mitigation: T-04-03 prints the exact regex on failure so authors can fix.

### 3.2 PR #2 — `refactor(docs): Sweep 1 — dev-surface cleanup` (theme α phase 2)

Depends on PR #1 (BACKLOG anchors must exist).

| Task | Description | Files | Notes |
|---|---|---|---|
| **T-04-06** | Replace `docs/PRD-001.md §14` body with pointer to `BACKLOG.md`. Heading retained. Items shipped under v2.0 NOT entered in BACKLOG. | `docs/PRD-001.md` | Single large region replacement (~50-row table → 1 sentence pointer). |
| **T-04-07** | Replace `docs/PRD-002.md §8` body with pointer. Frontmatter `status: planned` → `status: shipped`; add `shipped_in: <version>` (resolve exact version from `git log --diff-filter=A docs/PRD-002-visibility-and-shutdown.md` and feature commit `a43bbb8`). | `docs/PRD-002.md` | Two surgical edits to one file. |
| **T-04-08** | Replace `docs/PRD-003.md §11` body with pointer. Frontmatter `status: planned` → `status: shipped`, `shipped_in: 2.0.0`. | `docs/PRD-003.md` | |
| **T-04-09** | Edit `docs/DESIGN-005.md §14`: F-4 (ADR-scaffold race) stays inline as a "known limitation" note. F-6 (adr-tools interop) was already migrated to BACKLOG by PR #1; remove the F-6 row. | `docs/DESIGN-005.md` | |
| **T-04-10** | Edit `docs/DESIGN-006.md §8`: license-clarification + frontend-component-patterns notes already migrated to BACKLOG by PR #1; remove those rows. The "stale README status line" note is consumed by PR #3. | `docs/DESIGN-006.md` | |
| **T-04-11** | Multi-touch edits to `docs/WORKFLOW-002.md` per DESIGN-007 §4.1 expanded row: (a) §5.5 v1.1+ items list → pointer; (b) line ~227 (async PROPOSAL/PAUSE) → reword to drop version refs; (c) lines ~266, ~317, ~318 (R11 + R12 risk rows) → reword to drop version-specific deferral language while preserving operational content. Lines 22, 36, 289 stay as historical context. | `docs/WORKFLOW-002.md` | Three independent edits to one file. |
| **T-04-12** | `git rm docs/optimization-pr-gamma-plan.md` per PRD-004 D-5. | (file deletion) | |
| **T-04-13** | Run `npm test`; verify green. | — | Exit gate. |

**Exit gate (PR #2):** All 7 dev-surface targets edited; `optimization-pr-gamma-plan.md` deleted; `git status` clean post-commit; `npm test` green. No consumer-surface change yet.

**Risk attachment:** none directly. Sweep 1 is dev-only — no smoke required.

### 3.3 PR #3 — `refactor(consumer): Sweep 2 — consumer-surface cleanup` (theme α phase 2)

Depends on PR #2 (sequencing for safer revert; not strictly required for PR #3 to function).

| Task | Description | Files | Notes |
|---|---|---|---|
| **T-04-14** | Edit `agents/backend.md` line ~18: drop the parenthetical `(prompt-only scoping; mechanical separation deferred to v1.1+)` from the "Do not touch frontend files" rule. The rule itself stays. | `agents/backend.md` | One-line surgical edit. |
| **T-04-15** | Edit `agents/frontend.md` line ~19: same treatment as T-04-14 for the BE-equivalent rule. | `agents/frontend.md` | |
| **T-04-16** | Edit `agents/frontend.md` line ~27: delete the line `(No FE-specific skill yet — frontend-component-patterns deferred to a later release.)` entirely. | `agents/frontend.md` | |
| **T-04-17** | Edit `skills/task-breakdown/SKILL.md` line ~116: reword "v1.0.0 agent role / v1.1+ agents" version refs while preserving the "needs-future-specialist and defer" semantic. | `skills/task-breakdown/SKILL.md` | |
| **T-04-18** | Edit `commands/orchestra.md` line ~257: delete the line `Deferred (v1.1+): /save, /load, /orchestra-disagree, /orchestra legacy.`. | `commands/orchestra.md` | |
| **T-04-19** | Edit `README.md` bottom: replace `> **Status:** v1.0.0 released 2026-05-03.` with `> **Status:** v2.1.0 (current). See [CHANGELOG.md](CHANGELOG.md) for release history.` (Update version to v2.2.0 at release-time after this PR.) | `README.md` | |
| **T-04-20** | Run the 5-step consumer install smoke chain per `feedback_smoke-before-release-docs` memory. | (manual verification) | Smoke gate. |
| **T-04-21** | Record pre/post word-count delta in PR description for each touched consumer file. Expected: `commands/orchestra.md` shrinks ~25 words; mean `agents/*.md` shrinks ~5-10 words. | PR description | Documentation only. |

**Exit gate (PR #3):** All 6 consumer-surface edits applied; smoke chain passes; `npm test` green; word-count delta recorded.

**Risk attachments:** R-2 (one-time negative Δ vs avg post-Sweep-2 confusing trend analysis) — mitigated by PR description note that rolling-10 window absorbs the delta within 10 runs. R-6 (`commands/orchestra.md:257` deletion surprise) — mitigated by CHANGELOG entry calling out the deletion.

### 3.4 PR #4 — `feat(commands,scaffold): /orchestra sprint --think + --delegate + PLAN artifact` (theme β)

Independent of PR #1, #2, #3, #5. Can be authored in parallel with any of them.

Sub-streams (parallelizable within the PR):
- **Stream A (scaffold infra):** T-04-22, T-04-23, T-04-24, T-04-25
- **Stream B (dispatcher integration):** T-04-26, T-04-27, T-04-28
- **Stream C (lead agent integration):** T-04-29
- **Stream D (docs):** T-04-30
- **Stream E (verification):** T-04-31 (must serialize after A+B+C+D)

| Task | Description | Files | Notes |
|---|---|---|---|
| **T-04-22** | Add `PLAN` entry to `scripts/scaffold-artifact.js` `TYPE_SPEC` per DESIGN-007 §5.1. classification: feature-scoped; folder: planning; template: PLAN.template.md; 5 anchors; no required diagrams. | `scripts/scaffold-artifact.js` | Stream A. |
| **T-04-23** | Create `schemas/templates/PLAN.template.md` with `<!-- FILL: -->` placeholders for the 5 anchors (S-PROBLEM-001, S-OPTIONS-001, S-TRADEOFFS-001, S-RECOMMENDATION-001, S-OPEN-001). | `schemas/templates/PLAN.template.md` (new) | Stream A. |
| **T-04-24** | Update `schemas/pipeline-artifact.schema.md` (revision bump) to register PLAN type; add row to the diagram-slot requirements table (no required diagrams; decision-tree optional). | `schemas/pipeline-artifact.schema.md` | Stream A. |
| **T-04-25** | Update `scripts/test-scaffold.js` with PLAN-type test case mirroring existing PRD/FRS/SAD/TDD/CONTRACT cases. Verifies anchor parity, template fidelity, idempotency, and bad-input exit codes. | `scripts/test-scaffold.js` | Stream A. |
| **T-04-26** | Update `commands/orchestra.md` Step 5 routing: `--think` and `--delegate` honored only for `intent.intent ∈ {feature, refactor}`. Other intents → status-line warning + ignore. | `commands/orchestra.md` | Stream B. ~8 lines. |
| **T-04-27** | Update `commands/orchestra.md` Step 5: when `--think` active, dispatcher calls `scaffold-artifact.js PLAN <feature-id>` BEFORE spawning `@lead`. Spawn prompt gains the `--think mode: fill <feature-dir>/planning/PLAN.md` directive. | `commands/orchestra.md` | Stream B. |
| **T-04-28** | Update `commands/orchestra.md` Step 5: `--delegate` flow per DESIGN-007 §5.5. After PLAN.md is written, dispatcher reads S-OPTIONS-001 + S-RECOMMENDATION-001, calls `AskUserQuestion` once with N+1 options, writes user choice to `<feature-dir>/planning/PLAN.choice.yaml` sidecar, proceeds to next agent with chosen option as seed. | `commands/orchestra.md` | Stream B. |
| **T-04-29** | Update `agents/lead.md` § Workflow: handle `--think` mode (fill PLAN anchors S-PROBLEM-001..S-RECOMMENDATION-001 with ≥3 distinct options; populate S-TRADEOFFS-001 1:1 with options; pick a recommendation in S-RECOMMENDATION-001). | `agents/lead.md` | Stream C. |
| **T-04-30** | Document `--delegate` carve-out from the AskUserQuestion confidence-budget (HIGH=0, MEDIUM=1, LOW=2-3) exactly once per CLAUDE.md "no annotation creep" — in `agents/lead.md` § Workflow + `commands/orchestra.md` § AskUserQuestion budget. | `agents/lead.md`, `commands/orchestra.md` | Stream D. |
| **T-04-31** | Run `node scripts/test-scaffold.js` (PLAN cases pass) + `npm test` (green). Manual smoke: `/orchestra sprint --think "<test feature>"` produces a PLAN.md with all 5 anchors filled by `@lead`. `/orchestra sprint --delegate "<test feature>"` produces a `PLAN.choice.yaml` after AskUserQuestion. | (manual verification) | Stream E (serializes after A+B+C+D). |

**Exit gate (PR #4):** `scaffold-artifact.js PLAN <id>` produces correct anchors; dispatcher honors flags only on feature/refactor intents; AskUserQuestion fires exactly once per `--delegate`; `node scripts/test-scaffold.js` green; `npm test` green.

**Risk attachments:** R-3 (PLAN structural-diff drift) — covered by T-04-25 PLAN test case in `test-scaffold.js`. R-5 (--delegate budget erosion) — covered by T-04-30 single-site documentation per CLAUDE.md.

### 3.5 PR #5 — `feat(metrics): per-agent breakdown + Δ-trend column + optional cost banner` (theme γ)

Independent of all other PRs. Can be authored in parallel with PR #4.

| Task | Description | Files | Notes |
|---|---|---|---|
| **T-04-32** | Add two new columns to `scripts/metrics-summary.py`: `Δ avg` (current run vs rolling-10 mean, formatted "+7%" / "-12%" / "—") and `Heaviest` (heaviest single agent role per run; sourced from `tokens.jsonl` filtered by `run_id`). | `scripts/metrics-summary.py` | ~50 lines added. |
| **T-04-33** | Add cost-trend footer line to `metrics-summary.py`: `Cost trend (last 10 runs): median <X>K \| p90 <Y>K \| warn-threshold +15% over rolling mean`. | `scripts/metrics-summary.py` | |
| **T-04-34** | Add `--cost` flag to `scripts/aggregate-metrics.py`: 30-day cost trend by date, per-intent cost distribution (already aggregated; reused), top-5 most-expensive runs in window. | `scripts/aggregate-metrics.py` | ~80 lines added. |
| **T-04-35** | Add `metrics-cost-banner` toggle entry to `manifests/runtime-toggles.json`: `kind: "config"`, `name: "metrics-cost-banner"`, `envVar: "ORCHESTRA_METRICS_COST_BANNER"`, `yamlPath: "metrics.show_cost_banner"`, `default: false`. | `manifests/runtime-toggles.json` | New `kind: "config"` value. |
| **T-04-36** | Update `schemas/runtime-toggles.schema.json` to accept `kind: "config"` in the kind enum; update validator if needed. | `schemas/runtime-toggles.schema.json` | Coordinates with T-04-35. |
| **T-04-37** | Update `commands/orchestra.md` Step 7 closure: after `SUMMARY-<feature-id>.md` write but before `TeamDelete()`, if `local.yaml.metrics.show_cost_banner === true` (env-var override `ORCHESTRA_METRICS_COST_BANNER` honored), read `tokens.jsonl` filtered by current `session_id`, sum input+output, emit status line `[orchestra] [cost] <N> tokens this run (Δ vs avg: ±X%)`. Δ vs avg uses rolling-10 mean from `runs/*.json`. | `commands/orchestra.md` | Banner timing constraint documented inline (dispatcher reads tokens.jsonl directly, NOT runs/<id>.json which is written by Stop hook AFTER dispatcher exits). |
| **T-04-38** | If `scripts/test-metrics.js` exists, extend with assertions for: per-agent breakdown column present; Δ avg column populated correctly; banner emission gated on toggle. Else skip. | `scripts/test-metrics.js` | Optional — depends on existing test coverage. |
| **T-04-39** | Run `npm test` (green). Manual smoke: set `local.yaml.metrics.show_cost_banner: true` in a test consumer, run `/orchestra <feature>`, confirm banner emits at end. Then unset and re-run, confirm banner suppressed. | (manual verification) | Exit gate. |

**Exit gate (PR #5):** `metrics-summary.py` shows new `Δ avg` + `Heaviest` columns + footer; `aggregate-metrics.py --cost` produces output; banner fires only when toggle on (toggle off by default); `npm test` green.

**Risk attachments:** R-1 (banner double-emit) — single-source-of-truth: dispatcher OWNS the banner; `metrics-collector` hook never emits user-visible output. Documented inline in `commands/orchestra.md` Step 7. R-7 (`metrics.*` namespace collision) — reserved during T-04-35 by documenting the namespace policy in `manifests/runtime-toggles.json` schema.

## 4. Dependency graph <a id="S-DEPS-001"></a>

```
                    pre-flight
                        │
                        ▼
                ┌────────────────┐
                │     PR #1      │  α — BACKLOG.md + validator
                │ (T-04-01..05)  │
                └────────┬───────┘
                         │
                ┌────────▼───────┐
                │     PR #2      │  α-2 Sweep 1 — dev-surface cleanup
                │ (T-04-06..13)  │
                └────────┬───────┘
                         │
                ┌────────▼───────┐
                │     PR #3      │  α-2 Sweep 2 — consumer-surface cleanup
                │ (T-04-14..21)  │  ← smoke-gated
                └────────────────┘

         ┌──────────────────────┐    ┌──────────────────────┐
         │       PR #4          │    │       PR #5          │
         │   (T-04-22..31)      │    │   (T-04-32..39)      │
         │  β — --think /       │    │  γ — metrics         │
         │  --delegate / PLAN   │    │  presentation +      │
         │                      │    │  cost banner         │
         └──────────────────────┘    └──────────────────────┘
                  ⊥ #1, #2, #3, #5            ⊥ #1, #2, #3, #4

(PR #4 and PR #5 are independent of each other and of #1-#3.)
```

**Hard dependencies:**
- PR #2 depends on PR #1 (Sweep 1 references the BACKLOG.md anchors created in PR #1).
- PR #3 should land after PR #2 (sequencing for safer revert per DESIGN-007 §4.3); not strictly required for PR #3 to function.

**No dependencies:**
- PR #4 ⊥ all others.
- PR #5 ⊥ all others.

**Realistic merge order:** PR #1 → PR #2 → PR #3 → (PR #4 ∥ PR #5).

**Parallelism:** PR #4 and PR #5 can be authored concurrently with PR #1-#3 (separate feature branches). Within PR #4, streams A/B/C/D can run in parallel if multiple authors; serial implementation runs A → B → C → D → E.

## 5. Risk inventory + per-PR attachments <a id="S-RISKS-001"></a>

Risks lifted from DESIGN-007 §S-RISKS-001 with PR-level attachments:

| ID | Risk | Attached PR | Mitigation |
|---|---|---|---|
| R-1 | Banner double-emit if dispatcher AND a future hook both surface cost. | PR #5 (T-04-37) | Single-source-of-truth in dispatcher; `metrics-collector` hook never emits user-visible output. Documented inline. |
| R-2 | First post-Sweep-2 run shows one-time negative Δ vs avg, possibly confusing trend analysis. | PR #3 description | Rolling-10 window naturally absorbs delta within 10 runs. PR description note; no code change. |
| R-3 | `PLAN.md` structural-diff drift if template anchors change. | PR #4 (T-04-25) | PLAN-type test case in `test-scaffold.js` covers anchor parity, idempotency, exit codes. |
| R-4 | `BACKLOG.md` validator brittle on hand-edits drifting from migration script's output shape. | PR #1 (T-04-03) + long-term | Stable heading regex; validator prints exact failure regex on error. Future hand-edits can match the printed regex. |
| R-5 | `--delegate` `AskUserQuestion` outside the confidence budget could erode budget discipline. | PR #4 (T-04-30) | Documented exactly once per CLAUDE.md "no annotation creep" — agents/lead.md § Workflow + commands/orchestra.md § AskUserQuestion budget. |
| R-6 | `commands/orchestra.md:257` deletion (T-04-18) surprises consumers who relied on the roadmap line. | PR #3 + CHANGELOG | CHANGELOG entry calls out the deletion. `/orchestra help` output stays correct (deferred line was below the actual subcommand listing). |
| R-7 | `local.yaml.metrics.show_cost_banner` collides with future `metrics.*` fields. | PR #5 (T-04-35) | Reserve `metrics.*` namespace in `manifests/runtime-toggles.json` schema doc. Future `metrics.*` fields use sibling keys. |

**No PR-blocking merge gates** beyond the per-PR exit gates in §3. All risks have either documentation-only mitigation or test coverage in the same PR that introduces them.

## 6. CI integration <a id="S-CI-001"></a>

No new CI jobs beyond `npm test` chain extensions:

| PR | New `npm test` script entry |
|---|---|
| PR #1 | `test:validate-backlog` (added in T-04-04) |
| PR #2 | none |
| PR #3 | none (relies on existing `test-streamline-fixture.sh`) |
| PR #4 | none (extends existing `test-scaffold.js` per T-04-25) |
| PR #5 | conditional on T-04-38 (extends `test-metrics.js` only if it exists; else skip) |

**Smoke gates** (manual; not CI):
- PR #3 (T-04-20): 5-step consumer install chain.
- PR #4 (T-04-31): `/orchestra sprint --think` + `--delegate` end-to-end against a throwaway test feature.
- PR #5 (T-04-39): toggle-on banner emission + toggle-off suppression.

## 7. Out of scope for this workflow <a id="S-OUT-001"></a>

- **Source code or prose content** — every task in §3 specifies *what* file to touch and *which contract from DESIGN-007* it implements; the actual *content* lands in `/sc:sc-implement`.
- **Release-time polish** — `CHANGELOG.md ## [2.2.0]` entry (PR #5 close), `VERSION` bump via `node scripts/bump-version.js minor` (per `feedback_bump-version-via-script` memory), git tag, push. Separate release motion after PR #5 merges.
- **`RELEASE-v2.2.0.md` / `RUNBOOK-v2.2.0.md`** — generate via `cut-release` skill at release time IF consumer-impacting changes warrant them. Theme α + β + γ are mostly additive; the cleanup-pass deletion of `commands/orchestra.md:257` is the only consumer-visible breaking-shape change. RELEASE/RUNBOOK is judgment call at release time.
- **OQ-1 candidate items** (`console-log-auditor`, `prompt-injection-guard`, `db_state` JSONL ledger) — deferred to BACKLOG by DESIGN-007 §7 OQ-1 resolution; not part of v2.2.0.
- **Per-item BACKLOG folder** (`docs/backlog/BL-*.md`) — explicitly out per DESIGN-007 §7 OQ-2 resolution. Promote later if the flat table outgrows itself.

## 8. Hand-off to `/sc:sc-implement` <a id="S-HANDOFF-001"></a>

`/sc:sc-implement` consumes this workflow one PR at a time. For each PR:

1. Read this document's PR section (§3.x) for the task list and exit gate.
2. Read `docs/DESIGN-007-backlog-and-v2-curation.md` §<theme-section> for the contracts those tasks implement.
3. Read `docs/PRD-004-backlog-mechanism-and-v2-curation.md` §S-FRS-001 for the requirements that motivate the design.
4. Implement tasks in stream order (within-PR streams from §3.4 / §3.5 are parallelizable; cross-PR ordering follows §4 dependency graph).
5. Run the PR's exit-gate verification.
6. Open PR; merge.
7. Repeat for next PR.

**Recommended first invocation:**

```
/sc:sc-implement PR #1 — apply T-04-01..T-04-05 per WORKFLOW-004 §3.1
```

Then PR #2 with `/sc:sc-implement PR #2`, etc. PR #4 and PR #5 can be invoked in either order after PR #3 (or in parallel sessions).

**Release motion** (after PR #5 merges):
1. Author CHANGELOG entry under `## [2.2.0]` covering all five PRs grouped by theme.
2. `node scripts/bump-version.js minor` (atomic VERSION + package.json + plugin.json bump per `feedback_bump-version-via-script` memory).
3. Smoke-test consumer install path (5-step chain) BEFORE authoring any RELEASE/RUNBOOK docs (per `feedback_smoke-before-release-docs` memory).
4. Tag + push.

---

**End of WORKFLOW-004.** Implementation begins at `/sc:sc-implement PR #1`.
