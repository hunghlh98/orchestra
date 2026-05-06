---
id: DESIGN-007
title: Backlog mechanism + v2.* curation pass — design
created: 2026-05-06
revision: 2
status: planned
upstream:
  - PRD-004 §S-DECISIONS-001
  - PRD-004 §S-CURATION-001
  - PRD-004 §S-FRS-001
  - PRD-004 §S-OPENQ-001
sections:
  S-SCOPE-001:           { hash: "TBD", confirmed: true }
  S-INFRA-DELTA-001:     { hash: "TBD", confirmed: true }
  S-BACKLOG-001:         { hash: "TBD", confirmed: true }
  S-CLEANUP-001:         { hash: "TBD", confirmed: true }
  S-PLAN-ARTIFACT-001:   { hash: "TBD", confirmed: true }
  S-COST-VISIBILITY-001: { hash: "TBD", confirmed: true }
  S-OQ-RESOLUTION-001:   { hash: "TBD", confirmed: true }
  S-PRSEQ-001:           { hash: "TBD", confirmed: true }
  S-RISKS-001:           { hash: "TBD", confirmed: true }
---

# DESIGN-007 — Backlog mechanism + v2.* curation pass — design

> Output of `/sc:sc-design` against `docs/PRD-004-backlog-mechanism-and-v2-curation.md`. Resolves OQ-1..OQ-5, specifies file layouts, schemas, migration shape, and the runtime-toggle for the optional cost banner. Hand off to `/sc:sc-workflow` for PR carving.

## 1. Scope <a id="S-SCOPE-001"></a>

| In scope | Out of scope |
|---|---|
| `docs/BACKLOG.md` schema + initial migration | New CI gates beyond `npm test` chain extension |
| `scripts/migrate-backlog.js` (one-shot ingest of PRD-004 §3.1 + §3.2) | Per-item backlog folder layout (`docs/backlog/BL-*.md`) — see §6 OQ-2 resolution |
| Two-sweep cleanup of stale "deferred / v1.1+" references | Resurrecting any KILL-list item from PRD-004 §3.1 |
| `PLAN.md` artifact type integration into `scripts/scaffold-artifact.js` | Pattern-C wave checkpoints, async OPTION_SYNTHESIS (deferred per PRD-004 §3.2) |
| Trend column + per-agent breakdown in `scripts/metrics-summary.py` | Telemetry transmission, save/load skill (killed) |
| Optional cost banner via `local.yaml.metrics.show_cost_banner` | Dev-surface CI regression on word counts (rejected per D-6) |
| Resolution of OQ-1..OQ-5 | Implementation source code (deferred to `/sc:sc-implement`) |

## 2. Existing infrastructure delta — what's already built <a id="S-INFRA-DELTA-001"></a>

The brainstorm framed theme γ as "extend the metrics-collector hook." Source recon shows the heavy lifting is already done. This changes the design surface significantly.

| Capability | Status | Location |
|---|---|---|
| Per-spawn token capture (input/output/cache_read/cache_create) | ✅ shipped | `hooks/scripts/metrics-collector.js` `emitSubagentTokens` (lines 375-398) → `<cwd>/.claude/.orchestra/metrics/tokens.jsonl` |
| Per-run aggregation (sums parent + subagent tokens) | ✅ shipped | `metrics-collector.js` `emitRunSummary` (lines 457-579) → `runs/<run-id>.json` |
| Console summary with Tokens column + median | ✅ shipped | `scripts/metrics-summary.py` (`fmt_tokens`, line 47; median calc, line 100) |
| Cross-consumer rollup with `tokens_by_intent` | ✅ shipped | `scripts/aggregate-metrics.py` (lines 58-167) |
| `metrics-collector` runtime toggle | ✅ shipped | `manifests/runtime-toggles.json` line 30 (`ORCHESTRA_HOOK_METRICS_COLLECTOR`) |
| Trend warning vs rolling baseline | ❌ missing | needs new column in `metrics-summary.py` |
| Per-agent token breakdown | ❌ missing | `metrics-summary.py` aggregates run-total only; per-agent rows live in `tokens.jsonl` but aren't surfaced |
| Optional terminal banner | ❌ missing | needs `commands/orchestra.md` Step-7 emission + new `local.yaml` toggle |
| `aggregate-metrics.py --cost` flag | ❌ missing | tokens are already aggregated; `--cost` would add per-day rolling view |
| `PLAN` artifact type | ❌ missing | not in `scaffold-artifact.js` `TYPE_SPEC` |
| `BACKLOG.md` | ❌ missing | not yet created |
| Cleanup migration scripts | ❌ missing | not yet created |

**Net effect on γ:** runtime token capture is a solved problem. γ becomes a **presentation-layer** motion (Python display + small dispatcher banner + one toggle) rather than a hook rewrite. PRD-004 F-γ-1 and F-γ-2 (runtime-vs-proxy source resolution) are both **resolved**: the hook reads Claude Code's session jsonl `usage` field via `sumTokensInJsonl` (`metrics-collector.js:407-425`) — no proxy fallback is ever needed.

## 3. Theme α design — `docs/BACKLOG.md` <a id="S-BACKLOG-001"></a>

### 3.1 File layout

`docs/BACKLOG.md` is a single dev-surface file with two parts: a scannable index table at the top, then per-row body sections below for full rationale. This is the OQ-2 resolution: **flat table for scan + per-row body sections for depth, all in one file**. No `docs/backlog/BL-*.md` per-item folder.

```
---
id: BACKLOG
title: Orchestra plugin backlog (canonical)
revision: 1
created: 2026-05-06
schema_version: 1
---

# Orchestra plugin backlog

> Canonical site for deferred + killed feature proposals. Replaces scattered
> PRD-NNN §14 / DESIGN-NNN §<followups> sections per PRD-004 D-7.
> See §<anchor> for full rationale on each row.

## Index

| ID | Title | Status | Source | Created | Last changed |
|---|---|---|---|---|---|
| BL-0001 | <slug-rendered-title> | deferred | PRD-001 §14.1 | 2026-05-06 | 2026-05-06 |
| BL-0002 | ... | killed | PRD-001 §14.2 | 2026-05-06 | 2026-05-06 |
| ... |

## BL-0001 — <Title> <a id="BL-0001"></a>

**Status:** deferred · **Source:** PRD-001 §14.1 · **Created:** 2026-05-06

<one-paragraph rationale; matches the source's original wording, lightly normalized>

---

## BL-0002 — <Title> <a id="BL-0002"></a>

...
```

### 3.2 ID + status grammar

- **ID format:** `BL-<NNNN>-<slug>` — 4-digit zero-padded, global flat numbering. Mirrors the ADR convention from `DESIGN-005 §S-ARCHITECTURE-DECISION-RECORD-001` (`ADR-NNNN-<slug>` at `architecture/decisions/`). Numbers never reuse on close — closing `BL-0007` and adding `BL-0007` later is forbidden.
- **Slug rules:** lowercase, hyphenated, ≤6 words. Stable for the row's lifetime.
- **Status enum (closed):** `proposed | accepted | in-flight | shipped | killed | deferred`. The validator rejects any other value.
- **Status transitions** (mealy machine):
  - `proposed → accepted | killed`
  - `accepted → in-flight | deferred | killed`
  - `in-flight → shipped | deferred | killed`
  - `shipped`, `killed`, `deferred` are terminal (re-opening creates a new ID, never revives the old one).

### 3.3 Anchor + table contract

Each `## BL-NNNN-<slug>` heading carries an HTML anchor `<a id="BL-NNNN"></a>`. The index table's ID column does NOT link explicitly (markdown rendering relies on the implicit heading anchor) but the validator confirms every index row has a matching `## BL-NNNN-<slug>` body section. This is the **bidirectional invariant**.

### 3.4 Validator contract

`scripts/validate-backlog.js` runs as part of `npm test`. Pure-function checks:

| Check | Failure mode |
|---|---|
| Every index row has matching body section | Missing-body error |
| Every body section has matching index row | Orphan-section error |
| ID monotonically increases (no gaps inside `proposed/accepted/in-flight`; gaps allowed only after `killed/deferred/shipped`) | ID-gap warning (not error — closed terminals can leave gaps) |
| Status field ∈ enum | Bad-status error |
| ID format matches `^BL-\d{4}-[a-z][a-z0-9-]+$` | Bad-ID error |
| Frontmatter `revision: <int>` present | Schema-version error |

Validator is **soft-warn for warnings, hard-fail for errors**. This is the OQ-2 sub-resolution: validator ships, but only errors block CI.

### 3.5 Migration script — `scripts/migrate-backlog.js`

Pure-Node ESM. Single CLI: `node scripts/migrate-backlog.js [--dry-run]`.

```text
Inputs:
  - docs/PRD-004-backlog-mechanism-and-v2-curation.md (read §3.1 KILL + §3.2 DEFER tables)

Output:
  - docs/BACKLOG.md (created; refuses to overwrite if file exists; --force overrides)

Behavior:
  1. Parse PRD-004 §3.1 table → 12 entries with status: killed
  2. Parse PRD-004 §3.2 table → 16 entries with status: deferred
  3. Assign IDs BL-0001..BL-0028 in PRD-004 row order (deterministic across reruns)
  4. Slug = lowercase first-3-words-hyphenated of the "Item" column
  5. Write the index table + 28 body sections
  6. Print summary: "Wrote 28 BACKLOG entries (12 killed, 16 deferred)"
```

The script is one-shot; after the initial 28 entries land, future entries are added by hand or via a future `add-backlog.js` (out of scope here).

### 3.6 Cross-link discipline going forward

After migration, future PRDs that defer features add a single line in their body: `> Backlog: BL-NNNN`. They do NOT spawn a new `## 14. Backlog` section. PRD authors verify the cross-link works by running `validate-backlog.js`.

## 4. Theme α phase 2 — cleanup migration <a id="S-CLEANUP-001"></a>

### 4.1 Sweep 1 — dev-surface (`docs/`)

One commit. Touches 7 dev-surface locations (WORKFLOW-002 has multiple touchpoints in the same file, counted as one location). The audit pass (revision 2) added line-level WORKFLOW-002 targets that the initial brainstorm missed.

| File | Action | Tool |
|---|---|---|
| `docs/PRD-001.md §14` (entire) | Replace 50-item backlog body with: `> See [docs/BACKLOG.md](BACKLOG.md) for the canonical post-v1.0 backlog. Items shipped under v2.0 are not listed (reconciled out).` Heading retained. | manual edit (one large region) |
| `docs/PRD-002.md §8` + frontmatter | Body → pointer. Frontmatter `status: planned` → `status: shipped`, add `shipped_in: 1.0.0+` (resolve exact ship version from `git log --diff-filter=A docs/PRD-002-visibility-and-shutdown.md` and corresponding feature commit `a43bbb8`). | manual edit |
| `docs/PRD-003.md §11` + frontmatter | Body → pointer. Frontmatter `status: planned` → `status: shipped`, `shipped_in: 2.0.0`. | manual edit |
| `docs/DESIGN-005.md §14` follow-ups | F-4 stays inline as a "known limitation" bullet (real architectural constraint). F-6 (adr-tools interop) → BACKLOG entry created during §3.5 migration; section body trimmed to F-4 only. | manual edit |
| `docs/DESIGN-006.md §8` follow-ups | License clarification + `frontend-component-patterns` → BACKLOG entries. README status line is Sweep 2 work. | manual edit |
| `docs/WORKFLOW-002.md` (multi-touch) | Three independent edits: (1) §5.5 v1.1+ items list → pointer to `BACKLOG.md`; (2) line ~227 (async PROPOSAL/PAUSE deferred to v1.1+/v1.2+) → reword to drop version refs while preserving operational content; (3) lines ~266, ~317, ~318 (R11 test-bash-strip + R12 auto-classifier risk rows referencing "v1.1+") → reword to drop version-specific deferral language; R11 stays as an open refactor note (no longer time-anchored), R12's "telemetry feeds v1.1+ refinement" line drops the refinement promise (telemetry path is killed in BACKLOG). Lines 22, 36, 289 stay as historical v1.0.0 release-context — informational, not deferral. | manual edit |
| `docs/optimization-pr-gamma-plan.md` | **Delete file** (per PRD-004 D-5). | `rm` |

Sweep 1 is **dev-surface only** — no consumer install delta. Smoke chain is unaffected.

### 4.2 Sweep 2 — consumer-surface

Separate commit, separate PR. Touches 6 consumer-surface lines across 5 files. Per project `CLAUDE.md` "Consumer surface MUST NOT cite developer-surface artifacts," these inline parentheticals are already wrong by existing convention.

| File | Line | Edit |
|---|---|---|
| `agents/backend.md` | ~18 | `Do not touch frontend files (prompt-only scoping; mechanical separation deferred to v1.1+).` → `Do not touch frontend files.` |
| `agents/frontend.md` | ~19 | `Do not touch backend files (prompt-only scoping; mechanical separation deferred to v1.1+).` → `Do not touch backend files.` |
| `agents/frontend.md` | ~27 | `(No FE-specific skill yet — `frontend-component-patterns` deferred to a later release.)` → **delete the line** |
| `skills/task-breakdown/SKILL.md` | ~116 | `Task can't be assigned to a v1.0.0 agent role → flag as "needs `@architect` or `@security`" and defer (those agents are v1.1+).` → `Task can't be assigned to a current agent role → flag as "needs-future-specialist" and defer.` |
| `commands/orchestra.md` | ~257 | **Delete the line** `Deferred (v1.1+): /save, /load, /orchestra-disagree, /orchestra legacy.` |
| `README.md` | bottom | `> **Status:** v1.0.0 released 2026-05-03.` → `> **Status:** v2.1.0 (current). See [CHANGELOG.md](CHANGELOG.md) for release history.` |

**Acceptance:**
- `npm test` passes (no validator regression).
- Smoke chain (5-step consumer install) passes per `feedback_smoke-before-release-docs` memory.
- Word-count delta recorded in PR description; expected: `commands/orchestra.md` shrinks ~25 words; mean `agents/*.md` shrinks ~10 words.

### 4.3 Sequencing

Sweep 1 lands first (low-risk, dev-only); Sweep 2 lands second (consumer-touching, smoke-gated). If Sweep 2's smoke fails, Sweep 1 stays merged — the BACKLOG.md and dev-doc cleanups remain useful even if consumer-surface fixes need to revert. **Two PRs, not one.**

## 5. Theme β design — `PLAN.md` artifact + `--think`/`--delegate` flags <a id="S-PLAN-ARTIFACT-001"></a>

### 5.1 Artifact type registration

Add to `scripts/scaffold-artifact.js` `TYPE_SPEC`:

```javascript
PLAN: {
  classification: "feature-scoped",
  folder: "planning",
  template: "PLAN.template.md",
  anchors: [
    "S-PROBLEM-001",
    "S-OPTIONS-001",         // ≥3 named approaches, table form
    "S-TRADEOFFS-001",       // pros/cons matrix
    "S-RECOMMENDATION-001",  // @lead's pick + reasoning
    "S-OPEN-001",            // open questions for user (--delegate path)
  ],
  diagrams: [],              // no required diagrams (decision-tree optional)
  ext: "md",
},
```

Schema entry in `schemas/pipeline-artifact.schema.md` mirrors this: feature-scoped, lives at `<feature-dir>/planning/PLAN.md`, paired lockfile `PLAN.lock.yaml`.

Template at `schemas/templates/PLAN.template.md` follows the scaffold-fill convention with `<!-- FILL: ... -->` placeholders for each anchor.

### 5.2 Anchor contract

| Anchor | Contains |
|---|---|
| `S-PROBLEM-001` | One paragraph restating the problem in `@lead`'s voice. Sourced from PRD/FRS if upstream exists, else the user's intent string. |
| `S-OPTIONS-001` | Table: `Option | Approach | Sketch (1-3 sentences)`. Minimum **3 rows**. Validator rejects fewer at structural-diff time. |
| `S-TRADEOFFS-001` | Table: `Option | Pros | Cons | Cost (S/M/L) | Risk (low/med/high)`. One row per option from S-OPTIONS-001 (1:1 by row count). |
| `S-RECOMMENDATION-001` | `@lead`'s pick (one of the option labels) + 2-3 sentence reasoning. |
| `S-OPEN-001` | Open questions for user. Populated only when `--delegate` is set; otherwise `(none)`. |

### 5.3 Routing — accepted intents

Modify `commands/orchestra.md` Step 5 routing logic: `--think` and `--delegate` flags are **only honored when `intent.intent ∈ {feature, refactor}`**. For `hotfix`, `docs`, `template`, `review-only` intents, the dispatcher emits a status-line warning `[orchestra] --think/--delegate ignored for intent=<x>` and proceeds without the planning step.

This is a small dispatcher patch (~8 lines) to the existing Step-5 spawn-prompt mandate.

### 5.4 `--think` flow

1. User runs `/orchestra sprint --think <natural-language>`.
2. Dispatcher classifies intent as feature/refactor (Step 3).
3. Dispatcher calls `scaffold-artifact.js PLAN <feature-id>` BEFORE spawning `@lead` (Step 5a).
4. `@lead` is spawned with extra prompt directive: `"--think mode: fill <feature-dir>/planning/PLAN.md anchors S-PROBLEM-001 through S-RECOMMENDATION-001. ≥3 options in S-OPTIONS-001."`.
5. `@lead` writes PLAN.md → exits.
6. Dispatcher reads PLAN.md (idle-poll loop, same shape as Step 5b).
7. **Without `--delegate`:** dispatcher spawns next agent in the routing taxonomy (TDD authoring) with PLAN.md's S-RECOMMENDATION-001 as the seed.
8. **With `--delegate`:** dispatcher pauses (see §5.5).

### 5.5 `--delegate` flow + AskUserQuestion budget treatment

After PLAN.md is written, dispatcher:

1. Reads PLAN.md S-OPTIONS-001 + S-RECOMMENDATION-001 + S-OPEN-001.
2. Calls `AskUserQuestion` once with N+1 options:
   - Each row from S-OPTIONS-001 becomes an answer choice.
   - "Accept @lead's recommendation" is the labeled-default choice (matches `@lead`'s S-RECOMMENDATION-001 pick).
3. User selects one option.
4. Dispatcher writes the chosen option label into `<feature-dir>/planning/PLAN.choice.yaml` (a small sidecar — keeps PLAN.md immutable; @lead's recommendation is preserved alongside the user's actual choice).
5. Dispatcher proceeds to the next agent in the routing taxonomy with the chosen option as the seed.

**OQ-3 resolution:** `--delegate`'s `AskUserQuestion` invocation is **outside the confidence-driven budget**. Reasoning: confidence-tier budget (HIGH=0, MEDIUM=1, LOW=2-3) gates *uncertainty-driven* questions @lead asks @product or the user. `--delegate` is a different category — it's an **explicit user opt-in to a planning gate**, not a confidence call. Document this explicitly in `commands/orchestra.md` near the existing budget block + in `agents/lead.md` Workflow section.

## 6. Theme γ design — consumer-observed token cost <a id="S-COST-VISIBILITY-001"></a>

Per §S-INFRA-DELTA-001, the data is already captured. γ becomes a presentation + UX motion.

### 6.1 `metrics-summary.py` extensions

Add three columns + one footer line:

```text
# New columns in the per-run table (added between Tokens and Dur):
#   Δ avg     — current run's total tokens vs rolling-10 mean,
#               formatted as "+7%", "-12%", or "—" if <10 prior runs
#   Heaviest  — heaviest single agent role this run (agent_role from tokens.jsonl
#               with the largest summed input+output for this run_id)
#
# New footer line:
#   "Cost trend (last 10 runs):  median 12.4K  | p90 23.1K  | warn-threshold +15% over rolling mean"
```

Implementation cost: ~50 lines of Python. Reads `tokens.jsonl` in addition to `runs/*.json` (one new file read; both already in the metrics-dir convention).

### 6.2 `aggregate-metrics.py --cost` flag

Adds a per-day rolling chart (text-based or HTML) showing token cost trend across multiple consumer projects. Existing `tokens_by_intent` aggregation stays as-is; `--cost` is a new output mode that surfaces:
- 30-day cost trend by date.
- Per-intent cost distribution (already aggregated; just rendered).
- Top-5 most-expensive runs in window.

Implementation cost: ~80 lines added.

### 6.3 Optional terminal banner

`commands/orchestra.md` Step 7 (closure) gains a final emission **after** the `SUMMARY-<feature-id>.md` write but **before** `TeamDelete()`:

```
If local.yaml.metrics.show_cost_banner === true:
  Read <cwd>/.claude/.orchestra/metrics/tokens.jsonl
  Filter rows where run_id == <current session_id>
  Sum tokens.input + tokens.output across rows
  Emit status line: [orchestra] [cost] <N> tokens this run (Δ vs avg: ±X%)
```

The Δ vs avg uses the rolling-10 mean from `runs/*.json` (last 10 entries by `started_at`). Both the dispatcher and `metrics-summary.py` use the same calculation — extracted into a shared helper module if it becomes >20 lines (probably stays under).

**Timing safety:** the dispatcher runs AFTER all `SubagentStop` events have fired (each subagent stop already wrote its tokens.jsonl row), so the sum is complete by the time Step 7 reads. The Stop hook's `runs/<id>.json` write happens AFTER the dispatcher exits — so the dispatcher cannot read `runs/<id>.json` for the current run; it reads `tokens.jsonl` directly instead. This is documented inline in the dispatcher.

### 6.4 `local.yaml.metrics.show_cost_banner` toggle

Add to `manifests/runtime-toggles.json`:

```json
{
  "kind": "config",
  "name": "metrics-cost-banner",
  "envVar": "ORCHESTRA_METRICS_COST_BANNER",
  "yamlPath": "metrics.show_cost_banner",
  "default": false,
  "description": "When true, /orchestra prints a final '[cost] N tokens (Δ vs avg: ±X%)' status line at end of run."
}
```

The `kind: "config"` is new — existing entries are `hook` or `skill`. Schema (`schemas/runtime-toggles.schema.json`) gets an enum extension; validator update covers it.

**Resolution policy** (resolves OQ-4): `local.yaml.metrics.show_cost_banner` (default `false`) → env var `ORCHESTRA_METRICS_COST_BANNER` overrides if set to `on` or `off`. CLI flag `/orchestra ... --show-cost` is **not added** — keeps the dispatcher's Step-1 argument parsing minimal. Cost-conscious users set it once in `local.yaml`.

### 6.5 What γ explicitly does NOT do

- No CI gate on dev-source word counts (per PRD-004 D-6 + F-γ-5).
- No telemetry transmission. All measurement stays local.
- No per-feature historic baseline file (the rolling-10 window is computed from existing `runs/*.json`; no new baseline artifact).

## 7. Open question resolutions <a id="S-OQ-RESOLUTION-001"></a>

| OQ | Resolution | Reason |
|---|---|---|
| OQ-1 (3 candidate items ride along?) | **Defer all three** to `BACKLOG.md` as `status: deferred`. | Three themes is enough for v2.2.0; expanding scope risks the release. The cleanup pass + γ's already-mostly-built nature already make this release shape lighter than feared. |
| OQ-2 (flat table or per-item folder?) | **Flat table in `docs/BACKLOG.md` with per-row body sections in the same file.** Validator ships, soft-warn for warnings, hard-fail for errors. | CLAUDE.md "Simplicity First". Per-item folder is reversible later if the table outgrows itself; the reverse is harder. Same-file body sections preserve full rationale without spawning 28 new files. |
| OQ-3 (`--delegate` budget treatment) | **Outside the confidence budget.** Documented inline in `commands/orchestra.md` and `agents/lead.md`. | `--delegate` is an explicit user opt-in to a planning gate, semantically distinct from uncertainty-driven asks. |
| OQ-4 (banner shape) | **Opt-in via `local.yaml.metrics.show_cost_banner` (default `false`).** Env-var override `ORCHESTRA_METRICS_COST_BANNER`. No CLI flag. Warn threshold `+15%` over rolling-10 mean. | Default-clean UX; one-time toggle for cost-conscious consumers; env-var path lets per-shell experimentation override the file. |
| OQ-5 (ESCALATE pending vs abandoned) | **`pending` resolution holds the team container open**; only `abandoned` triggers shutdown. Documented as PRD-002 `S-OUT-OF-SCOPE-001` amendment during Sweep 1. | `pending` = under user review; auto-shutdown loses context the user came back to inspect. |

## 8. PR sequencing for `/sc:sc-workflow` <a id="S-PRSEQ-001"></a>

Five PRs targeting v2.2.0. Each PR has a one-line exit gate that `npm test` confirms.

| PR | Title | Theme | Exit gate |
|---|---|---|---|
| **PR #1** | `feat(infra): docs/BACKLOG.md migration + validator` | α | `node scripts/validate-backlog.js` passes; 28 entries (12 killed + 16 deferred) present; `npm test` green. |
| **PR #2** | `refactor(docs): Sweep 1 — dev-surface cleanup` | α-2 (Sweep 1) | All 7 dev-surface targets edited per §4.1; `docs/optimization-pr-gamma-plan.md` deleted; PRD-002/003 frontmatter flipped to `shipped`; `npm test` green. |
| **PR #3** | `refactor(consumer): Sweep 2 — consumer-surface cleanup` | α-2 (Sweep 2) | 6 consumer-surface edits per §4.2; `npm test` green; 5-step smoke chain re-runs clean; word-count delta logged in PR description. |
| **PR #4** | `feat(commands,scaffold): /orchestra sprint --think + --delegate + PLAN artifact` | β | `scaffold-artifact.js PLAN <id>` produces correct anchors; dispatcher honors flags only on feature/refactor intents; AskUserQuestion fires once per `--delegate`; `npm test` green. |
| **PR #5** | `feat(metrics): per-agent breakdown + Δ-trend column + optional cost banner` | γ | `metrics-summary.py` shows new columns; `aggregate-metrics.py --cost` produces output; banner fires only when `local.yaml.metrics.show_cost_banner: true`; `npm test` green. |

**Dependency graph:**
- PR #1 must merge before PR #2 (Sweep 1 references BACKLOG.md anchors).
- PR #2 should merge before PR #3 (sequencing for safer revert per §4.3); not strictly required.
- PR #4 and PR #5 are independent of each other and of #1-#3.

**Parallelism:** PR #4 can be authored concurrently with PR #1 + PR #2. PR #5 can be authored concurrently with all others. Realistic merge order: 1 → 2 → 3 → (4 + 5 in parallel).

**Version bump:** Single MINOR bump (`2.1.0 → 2.2.0`) at the end via `node scripts/bump-version.js minor`. CHANGELOG entry under `## [2.2.0]` covers all five PRs grouped by theme.

## 9. Risks <a id="S-RISKS-001"></a>

| ID | Risk | When | Mitigation |
|---|---|---|---|
| R-1 | Banner double-emit if dispatcher AND a future hook both surface cost. | PR #5 ship | Single-source-of-truth: dispatcher OWNS the banner. Documented in `commands/orchestra.md` Step 7. The `metrics-collector` hook never emits user-visible output. |
| R-2 | First run after Sweep 2 will show a one-time negative Δ vs avg (cleaner code → fewer tokens) — could confuse trend analysis. | First post-Sweep-2 run | Document in PR #3 description that the rolling-10 window naturally absorbs the delta within 10 runs. No code change needed. |
| R-3 | `PLAN.md` adds a new anchor set; structural-diff validator could reject if the template drifts from `TYPE_SPEC`. | PR #4 testing | `scripts/test-scaffold.js` gains a PLAN-type test case (mirrors existing PRD/FRS/SAD/TDD/CONTRACT cases). Part of PR #4 acceptance. |
| R-4 | Validator on `BACKLOG.md` could become brittle if hand-edits drift from the migration script's output shape. | Long-term | Per-row body sections use a stable heading regex `^## (BL-\d{4})-([a-z][a-z0-9-]+) — (.+) <a id="\1"></a>$`. Validator prints the exact regex on failure so authors can fix. |
| R-5 | `--delegate` AskUserQuestion outside the confidence budget could erode the budget discipline. | Long-term cultural drift | Document the carve-out exactly once in `agents/lead.md` § Workflow + `commands/orchestra.md` § AskUserQuestion budget. Per project CLAUDE.md "no annotation creep" rule, do NOT sprinkle reminders. |
| R-6 | Sweep 2's `commands/orchestra.md` deletion (line 257) could surprise consumers who relied on the roadmap line. | First v2.2.0 install | CHANGELOG entry calls out the deletion explicitly. The `/orchestra help` output stays correct because the deferred line was below the actual subcommand listing. |
| R-7 | `local.yaml.metrics.show_cost_banner` collides with future `metrics.*` fields. | Future motions | Reserve the `metrics.*` namespace in `manifests/runtime-toggles.json` schema doc; future fields use sibling keys (`metrics.foo`, `metrics.bar`). |

## 10. Hand-off to `/sc:sc-workflow`

This design is feature-complete for the v2.2.0 motion. `/sc:sc-workflow` consumes:

- §S-PRSEQ-001 (PR #1..#5 with exit gates)
- §S-BACKLOG-001 (theme α implementation contract)
- §S-CLEANUP-001 (sweep migration plan)
- §S-PLAN-ARTIFACT-001 (theme β scaffold + dispatcher contract)
- §S-COST-VISIBILITY-001 (theme γ presentation contract)

…and produces `WORKFLOW-004-backlog-and-v2-curation.md` carving §8 into a dependency-ordered task graph with per-PR task IDs, smoke gates, and risk attachments per the existing WORKFLOW-NNN convention.

After WORKFLOW-004 lands, `/sc:sc-implement PR #1` begins execution.

---

**End of DESIGN-007.**
