---
id: PRD-003-streamline-loading
title: orchestra — Streamline plugin loading (token-cost reduction)
created: 2026-05-05
status: shipped
shipped_in: 2.0.0
version: 1.0.1
revision: 2
sections:
  S-PROBLEM-001:    { hash: "TBD", confirmed: true }
  S-PERSONA-001:    { hash: "TBD", confirmed: true }
  S-VISION-001:     { hash: "TBD", confirmed: true }
  S-GOALS-001:      { hash: "TBD", confirmed: true }
  S-NONGOALS-001:   { hash: "TBD", confirmed: true }
  S-INVARIANTS-001: { hash: "TBD", confirmed: true }
  S-SCOPE-001:      { hash: "TBD", confirmed: true }
  S-FRS-001:        { hash: "TBD", confirmed: true }
  S-AUDIT-001:      { hash: "TBD", confirmed: true }
  S-DECISIONS-001:  { hash: "TBD", confirmed: true }
  S-BACKLOG-001:    { hash: "TBD", confirmed: false }
---

# orchestra — Streamline Plugin Loading

> Reduce per-invocation token cost of the orchestra plugin's consumer surface (`agents/`, `commands/`, `skills/`, `schemas/`) by ~35–40% through redundancy elimination and load-layer demotion. No behavioral changes; smoke-test parity is the gate.

---

## 1. Problem <a id="S-PROBLEM-001"></a>

### 1.1 Symptom

A typical `/orchestra <natural-language>` feature run loads ~10–13k tokens of plugin prompt content **before** user input or tool results. Two-iteration spec-panel review (Wiegers / Fowler / Cockburn / Adzic / Nygard / Newman) identified ~4,700 tokens of avoidable load per run, split into:

- **Redundancy** (~2,200 tokens at P0 + ~1,200 at P1): same content in 2–6 places (routing taxonomy, schema citations, tier prose).
- **Load-layer mismatch** (~1,000 at P0 + ~600 at P1 + ~700 at P2): rare-path content (resume / shutdown / release algorithms, autonomy diagnostic, severity rubrics) lives in always-loaded layers.

### 1.2 Root cause

The plugin grew incrementally without a unified load-cost model. Plugin-dev's three-level loading model (metadata / body / bundled resources) is implemented correctly *once* in this plugin (`val-calibration` hook → `skills/evaluator-tuning/references/calibration-examples.md`) but not generalized. CLAUDE.md's "Update discipline — fold up, don't sprinkle" rule (commit `73e5ea6`) postdates most of the violations.

### 1.3 Why now

- Every leaky cite or duplicated rule is paid on every consumer load. The cost compounds with `/orchestra` adoption.
- Explanatory output style amplifies the cost: redundant rules get re-narrated to the user.
- The fix shape is well-understood (the `val-calibration` precedent works); generalization is mechanical.

---

## 2. Persona <a id="S-PERSONA-001"></a>

| Persona | Pain today | Win after |
|---|---|---|
| **Consumer running `/orchestra`** | Pays ~10–13k tokens per feature run on plugin overhead before doing useful work. | ~35–40% reduction; faster turn, cheaper run. |
| **Plugin maintainer** | "Update discipline" rule exists but is violated repeatedly because rules are sprinkled, not folded. | Single canonical site per rule; new violations easier to catch. |
| **Future agent author** | Must learn a redundant tier-discipline preamble, schema-citation block, etc., to add a new agent. | Frontmatter `tools:` IS the tier; reference the schema once; new agents are short. |

---

## 3. Vision <a id="S-VISION-001"></a>

The plugin uses progressive disclosure as its central organizing principle, matching plugin-dev's three-level model and extending it across all five load layers (metadata, command body, agent body, skill body, references). Content lives at the layer whose load frequency matches its trigger frequency. Once-per-feature-run content (autonomy diagnostic) lives in skills; rare-subcommand content (resume algorithm) lives in skills; edge-case detail (severity rubrics, release templates) lives in `references/`. The dispatcher and agent bodies become small dispatch surfaces.

---

## 4. Goals <a id="S-GOALS-001"></a>

| Goal | Measure | Target |
|---|---|---|
| G1: Reduce `commands/orchestra.md` load cost | word count of body | ≤2,200 words (from 3,141; −30%) |
| G2: Reduce average agent body cost | mean wc of `agents/*.md` | ≤700 words (from ~870; −20%) |
| G3: Generalize progressive disclosure | count of `skills/*/references/*` files | ≥5 (from 1) |
| G4: Behavior parity | smoke-test 5-step consumer install | identical artifact set + identical events.jsonl event types |
| G5: No new external CI dependencies | net change in `package.json` deps | 0 |

Cumulative effect on a typical 7-spawn feature run: **~4,700 tokens saved per run = ~35–40% of plugin overhead.**

---

## 5. Non-goals <a id="S-NONGOALS-001"></a>

- Compressing the smart-router Steps 1–7 (operational meat — load-bearing on common path).
- Removing `<example>` blocks in agents (they carry behavior, not redundancy).
- Cutting the 4-pause table or autonomy resolution prose in the dispatcher (load-bearing).
- Adding new features, agents, hooks, or MCP tools.
- Changing artifact frontmatter shape, schema files, or the hash-stamper contract.
- Refactoring `hooks/scripts/*.js` or `hooks/lib/*.js` (out of scope).

---

## 6. Invariants <a id="S-INVARIANTS-001"></a>

I-1. **Smoke-test parity.** The 5-step consumer install chain produces an identical artifact set (same files, same frontmatter shape, same `verdict` outcomes) before vs. after each PR.

I-2. **Tier discipline preserved.** `node scripts/test-agents.js` passes after every change. No agent gains/loses tools.

I-3. **Schema compliance preserved.** `node scripts/validate.js` passes after every change. Frontmatter for every authored artifact remains conformant to `schemas/pipeline-artifact.schema.md`.

I-4. **Hook contracts unchanged.** All 5 hooks fire on the same matchers, log the same event types to `events.jsonl`, and produce the same side effects. The hooks-table prose move (item 3) does NOT change `hooks/hooks.json`.

I-5. **Routing taxonomy semantics unchanged.** Each intent's whitelist of authorized agents and artifacts is identical pre/post. Item 10 changes location, not content.

I-6. **Autonomy resolution precedence unchanged.** `--autonomy <tag>` > `local.yaml.autonomy.level` > `DRAFT_AND_GATE`. Item 7 moves the diagnostic; the precedence stays in the dispatcher.

I-7. **Subcommand parity.** Each demoted subcommand (`resume` / `shutdown` / `release` / `metrics` / `commit`) produces identical user-facing behavior pre/post item 4. Skill triggering is reliable.

I-8. **No consumer-surface citations to dev-surface docs.** Per CLAUDE.md, the new `docs/HOOKS.md` (item 3) is dev-only and MUST NOT be cited from `commands/`, `agents/`, `skills/`.

I-9. **Update discipline applied.** No new "DO NOT" / "Note:" sprinkles. Each rule lives at exactly one canonical site (Invariants block, schema doc, or references file).

---

## 7. Scope <a id="S-SCOPE-001"></a>

| In scope | Out of scope |
|---|---|
| `commands/orchestra.md` body | `commands/` other files (none today) |
| All 8 agent bodies | Agent frontmatter (`tools:`, `model:`, `color:`) |
| New skills (`resume-pipeline`, `shutdown-team`, `cut-release`, `report-metrics`) | Existing skill internals beyond adding `references/` |
| New references files (autonomy, severity, templates) | Schema content (only `routing-taxonomy.md` is added) |
| `docs/HOOKS.md` (new dev-surface doc) | `hooks/scripts/*.js`, `hooks/lib/*.js`, `hooks/hooks.json` |
| Schema additions (`schemas/routing-taxonomy.md`) | Existing schemas (`pipeline-artifact.schema.md`, `*.schema.json`) |

---

## 8. Functional requirements <a id="S-FRS-001"></a>

Each requirement is the consumer-observable behavior that must hold AFTER the corresponding design item lands. F-IDs map 1:1 to DESIGN-004's per-item table.

| ID | Requirement | Priority |
|---|---|---|
| **F-1** | `@lead`'s out-of-whitelist behavior (write `ESCALATE-<id>.md`) is preserved without the `## Routing-taxonomy guard` section. | P0 |
| **F-2** | All 6 affected agents author conformant frontmatter and reference the schema doc identically pre/post collapse. | P0 |
| **F-3** | All 5 hooks fire identically; consumer-surface model behavior unchanged. The verbose hooks table is removed from runtime context. | P0 |
| **F-4** | Each subcommand (`/orchestra resume|shutdown|release|metrics|commit`) produces identical output via skill-dispatch. Trigger reliability ≥ 99% on smoke fixtures. | P0 |
| **F-5** | Tier enforcement remains entirely via the `tools:` frontmatter. No prose-only tier rule survives. | P1 |
| **F-6** | `/orchestra resume` derives `@evaluator` and `@reviewer` task statuses from verdict frontmatter (existing behavior at `commands/orchestra.md:233-236`); the agent-side prose is unnecessary. | P1 |
| **F-7** | `@lead` Reads `skills/task-breakdown/references/autonomy-diagnostic.md` on first spawn for a new feature_id and runs the diagnostic; suggested tag surfaces at PAUSE-1 identically to today. (Per D-2 override: no `classify-autonomy` skill is created.) | P1 |
| **F-8** | `@reviewer` severity classification and `@ship` RELEASE/RUNBOOK/ANNOUNCEMENT shapes are byte-equivalent pre/post the references/ extraction. | P1 |
| **F-9** | Status lines and banners emit identical event content (compared via `events.jsonl`). | P2 |
| **F-10** | Each spawned agent's prompt references `schemas/routing-taxonomy.md#<intent>` and authors only whitelisted artifacts. ESCALATE on out-of-whitelist still fires. | P2 |

---

## 9. Audit / acceptance <a id="S-AUDIT-001"></a>

A PR satisfies acceptance when ALL of the following hold:

1. **Static validators green:** `node scripts/test-agents.js` and `node scripts/validate.js` both exit 0.
2. **Smoke-test parity:** the 5-step consumer install chain runs end-to-end on a fresh fixture project for ALL 6 intents (`feature`, `template`, `hotfix`, `refactor`, `docs`, `review-only`). Each produces the same artifact set as the pre-PR baseline (compared by `git diff --stat` of the fixture's `.claude/.orchestra/pipeline/` tree).
3. **Token-cost regression:** word count of `commands/orchestra.md` and each touched agent file is at-or-below the per-PR target stated in DESIGN-004 §6.
4. **Hooks parity:** `events.jsonl` event types and frequencies on a fixture run match the baseline (allowing for timestamp / hash / token-count drift only).
5. **No leaky cites:** automated grep for `PRD §`, `DESIGN-`, `WORKFLOW-` inside `agents/`, `commands/`, `skills/` returns zero hits.

Per the `feedback_smoke-before-release-docs` memory: smoke-test BEFORE writing any RELEASE / RUNBOOK / ANNOUNCEMENT for v1.0.1.

---

## 10. Decisions <a id="S-DECISIONS-001"></a>

These are the binding design decisions; rationale and trade-offs live in DESIGN-004 §3.

| ID | Decision | Status |
|---|---|---|
| **D-1** | Demote each rare-path subcommand to its own skill (4 skills: `resume-pipeline`, `shutdown-team`, `cut-release`, `report-metrics`), not a single combined skill. | Accepted 2026-05-05 |
| **D-2** | `@lead`'s autonomy diagnostic moves to `skills/task-breakdown/references/autonomy-diagnostic.md` (a references file under the existing `task-breakdown` skill). NO new skill is created. **User override 2026-05-05** of the design's recommended new-skill option, accepting the topical-fit trade-off in favor of fewer skills total. | Accepted 2026-05-05 (override) |
| **D-3** | Routing taxonomy materializes as `schemas/routing-taxonomy.md` (consumer surface, anchor IDs per intent). `commands/orchestra.md` keeps a compact summary table; spawn prompts reference the schema by anchor. | Accepted 2026-05-05 |

---

## 11. Backlog (deferred) <a id="S-BACKLOG-001"></a>

> **Migrated to canonical site.** See [`docs/BACKLOG.md`](BACKLOG.md). The token-cost-regression item has been reshaped per PRD-004 D-6 (γ-C: consumer-observed cost via `metrics-collector` + `/orchestra metrics`); supporting infrastructure already shipped in v2.0.0+ (per DESIGN-007 §S-INFRA-DELTA-001), with presentation-layer additions landing in v2.2.0 PR #5. Other speculative items from this section (agent `<example>` migration, `calibration-examples.md` audit, autonomy-classifier emoji compression) have been dropped per CLAUDE.md "Simplicity First — Nothing speculative."
