---
id: DESIGN-004-streamline-loading
title: orchestra — Streamline plugin loading (architecture)
created: 2026-05-05
status: draft
revision: 2
scope: load-layer model, per-item deltas, decisions, PR sequencing, verification
references:
  prd:
    - id: PRD-003-streamline-loading
      sections: [S-INVARIANTS-001, S-FRS-001, S-AUDIT-001, S-DECISIONS-001]
sections:
  S-SCOPE-001:     { hash: "TBD", confirmed: true }
  S-LOADMODEL-001: { hash: "TBD", confirmed: true }
  S-DECISIONS-001: { hash: "TBD", confirmed: true }
  S-DELTAS-001:    { hash: "TBD", confirmed: true }
  S-PRSEQ-001:     { hash: "TBD", confirmed: true }
  S-VERIFY-001:    { hash: "TBD", confirmed: true }
  S-RISKS-001:     { hash: "TBD", confirmed: true }
---

# orchestra — Streamline Plugin Loading: Architecture Design

> Design output of `/sc:sc-design` for PRD-003. Produces the deltas and PR sequencing that `/sc:sc-workflow` will plan from. No source code; no edits to `agents/`, `commands/`, `skills/`, `schemas/` until WORKFLOW-NNN tasks are accepted and `/sc:sc-implement` runs.

---

## 1. Scope and frame <a id="S-SCOPE-001"></a>

| In scope | Out of scope |
|---|---|
| 5-layer load model + the demotion target for each item | Implementation source code (deferred to `/sc:sc-implement`) |
| File-level deltas for 10 items (deletes, moves, new skills, new references) | Hooks JS (`hooks/scripts/*.js`, `hooks/lib/*.js`) |
| Design decisions D-1, D-2, D-3 with rationale | Non-load-related refactors (renames, formatting) |
| 5-PR sequencing with risk + smoke gates | New CI checks (token-cost regression is in PRD-003 backlog) |
| Verification plan referenced from PRD-003 §S-AUDIT-001 | Behavior changes (none — see PRD-003 §S-INVARIANTS-001) |

Inputs: PRD-003 §S-INVARIANTS-001 (parity invariants), §S-FRS-001 (per-item requirements F-1..F-10), §S-DECISIONS-001 (D-1..D-3 acceptance).

---

## 2. Load model <a id="S-LOADMODEL-001"></a>

The plugin has five load layers, each loaded at a different trigger frequency. The streamlining principle: **content lives at the layer whose load frequency matches its trigger frequency**.

| Layer | Trigger | Currently holds | Plugin-dev pattern |
|---|---|---|---|
| **L0 — Metadata** | Every session | Agent + skill + command frontmatter `description`. ~250 tokens. | Always loaded (~100 words guidance). Healthy. |
| **L1 — Command body** | `/orchestra <anything>` | `commands/orchestra.md` body. **3,141 words**. | Loaded on dispatch. Currently holds rare-path subcommand bodies and dev-trace hooks prose. |
| **L2 — Agent body** | `Agent({...})` spawn | 8 agent bodies. 593–1,128 words each. | Concatenated into spawn prompt. Currently holds duplicated tier prose, schema citations, and one-shot diagnostics (`@lead` autonomy). |
| **L3 — Skill body** | Agent invokes skill | 8 SKILL.md files. 541–1,124 words. All within plugin-dev's 1,500–2,000 target. | The healthy layer. |
| **L4 — References / scripts** | Explicit `Read` or hook-injected | 1 file: `skills/evaluator-tuning/references/calibration-examples.md`. | Drastically underutilized (1 of 8 skills uses this pattern). |

The streamlining moves content from L1 → L3 (subcommand demotion), L2 → L3 (autonomy classifier), L1+L2 → docs/ or L4 (severity rubric, release templates, hooks prose).

---

## 3. Decisions <a id="S-DECISIONS-001"></a>

### 3.1 D-1 — Per-subcommand skills (not a single combined skill)

**Choice:** Four new skills under `skills/`: `resume-pipeline`, `shutdown-team`, `cut-release`, `report-metrics`. NOT a single `dispatcher-subcommands` skill.

**Rationale:**
- Plugin-dev's auto-activation triggers by description; each subcommand has a distinct trigger phrase ("resume" vs "shutdown" vs "release" vs "metrics") and rare-path frequency.
- A combined skill loads all four bodies whenever any one fires — defeats the demotion's point.
- Single Responsibility Principle: each skill owns one subcommand's algorithm; failures and changes are isolated.
- Each skill's SKILL.md stays well under plugin-dev's 1,500–2,000-word target.

**Trade-off:** More files (4 vs 1). Acceptable — file count is not the cost driver; load size is.

**Reverse if:** Per-skill SKILL.md bodies turn out to share >50% content (unlikely — `resume`'s topological walk has nothing in common with `release`'s gate verification).

### 3.2 D-2 — Autonomy diagnostic as references file under `task-breakdown` skill (user override)

**Choice (user override 2026-05-05):** Add `skills/task-breakdown/references/autonomy-diagnostic.md` holding the full 5-Q diagnostic + 3-axis decomposition + Consultant-inversion paragraph + worked example. NO new skill is created. `@lead` Reads the references file on first spawn for a new feature_id when classification is needed.

**Considered alternatives:**
- A) New skill `skills/classify-autonomy/` with `references/diagnostic.md` — original recommendation; rejected by user override 2026-05-05 in favor of fewer skills total.
- C) Plain `references/` under a new `lead-orchestration` skill — rejected: creates a "junk drawer" skill with no clear single responsibility.

**Rationale (per user override):** Avoids adding a new skill description to the L0 metadata layer (~30 tokens saved permanently). Keeps the autonomy-classification knowledge co-located with `@lead`'s existing skill orbit (`@lead` already invokes `task-breakdown` for DAG decomposition).

**Trade-off accepted:** Topical fit is imperfect — `task-breakdown` is about DAG decomposition, not autonomy classification. The references file lives under task-breakdown's directory but is conceptually a `@lead` reference, not a `task-breakdown` reference. If future contributors find the placement confusing, consider relocating to a future `lead-orchestration` skill in v1.1+.

**Reverse if:** Contributors regularly miss the autonomy diagnostic because it's filed under the wrong skill, OR `@lead` Read-on-spawn reliability for autonomy classification drops below 95% on smoke tests (per F-7 in PRD-003).

### 3.3 D-3 — Routing taxonomy at `schemas/routing-taxonomy.md`

**Choice:** New file `schemas/routing-taxonomy.md` (consumer surface). Per-intent H2 sections with anchor IDs (`#feature`, `#hotfix`, etc.). Each section: ordered agent list + artifact whitelist.

**Considered alternatives:**
- B) `schemas/routing-whitelist.schema.md` — rejected: not a JSON-Schema-style normative schema; the `.schema.md` suffix would mislead.
- C) Keep in `commands/orchestra.md`, eliminate spawn-prompt duplication only — rejected: the table at `commands/orchestra.md:144-151` IS the inline taxonomy, and the spawn prompts at `:153-156` already only inline the relevant row. Saves less.

**Rationale for A:** Schemas/ is consumer surface (per CLAUDE.md); pairs naturally with `pipeline-artifact.schema.md` which also defines normative consumer-surface contracts. Anchor IDs allow spawn prompts to point at exactly one intent's whitelist without inlining.

**Trade-off:** Spawn prompts now reference an external file; agents Read it lazily on first spawn. Mitigation: keep the 1-line whitelist summary inline as a backstop (so agents don't have to actually Read it for the common path).

**Reverse if:** Spawn-prompt whitelist enforcement reliability drops below 99% on smoke fixtures (per F-10 in PRD-003).

---

## 4. Per-item deltas <a id="S-DELTAS-001"></a>

Each row maps 1:1 to PRD-003 F-IDs.

### 4.1 Item 1 (F-1) — Delete `agents/lead.md` routing-taxonomy guard

| Field | Value |
|---|---|
| Files | `agents/lead.md` |
| Delta | Delete lines 30–43 (`## Routing-taxonomy guard` section). |
| Replacement | One-liner: *"The dispatcher passes your routed intent and artifact whitelist in your prompt. Out-of-whitelist requests → write `ESCALATE-<id>.md`."* |
| Tokens saved | ~150 per `@lead` spawn |
| Risk | Low — dispatcher already enforces whitelist |

### 4.2 Item 2 (F-2) — Collapse schema-citation boilerplate

| Field | Value |
|---|---|
| Files | `agents/lead.md`, `product.md`, `reviewer.md`, `test.md`, `ship.md`, `evaluator.md` (6 files) |
| Delta per agent | Replace 60–110-word "See `schemas/pipeline-artifact.schema.md`…" block with one line: *"Frontmatter + body grammar per `schemas/pipeline-artifact.schema.md`. Standard sections you author: `<comma-list>`."* |
| Tokens saved | ~80 × 6 = ~480 per multi-agent run |
| Risk | Low — link preserved |

### 4.3 Item 3 (F-3) — Hooks-table: glossary in dispatcher, prose in dev doc

| Field | Value |
|---|---|
| Files | `commands/orchestra.md` (edit lines 174–185), `docs/HOOKS.md` (new dev-surface) |
| Dispatcher delta | Replace 12-line verbose table with 5-row glossary: `hook-name | event-matcher | one-line side effect`. ~120 tokens (down from ~600). |
| docs/HOOKS.md content | Full prose currently at lines 178–185 + the maintainer-oriented detail of which hook fires when. Audience: plugin maintainers. |
| Tokens saved | ~500 per `/orchestra` call |
| Risk | Zero runtime — `hooks/hooks.json` unchanged |

### 4.4 Item 4 (F-4) — Subcommand demotion (per D-1)

| Field | Value |
|---|---|
| Files | `commands/orchestra.md` (edit), 4 new skill dirs |
| New skills | `skills/resume-pipeline/SKILL.md`, `skills/shutdown-team/SKILL.md`, `skills/cut-release/SKILL.md`, `skills/report-metrics/SKILL.md` |
| Dispatcher delta | Each subcommand body (lines 191–270) becomes a 2–4 line dispatch shim invoking the corresponding skill by name. |
| `/orchestra commit` | Already calls `commit-work` skill; just trim prose. No new skill needed. |
| `/orchestra metrics` | One-line bash invocation; cut surrounding prose. No new skill needed. |
| Tokens saved | ~1,000 per `/orchestra` call (subcommand bodies leave L1) |
| Risk | Medium — new skill triggering must be reliable. Dispatcher invokes by skill name, not auto-activation. |

### 4.5 Item 5 (F-5) — Tier-discipline collapse across 8 agents

| Field | Value |
|---|---|
| Files | All 8 agents |
| Delta per agent | Replace `## Tier discipline` + bulleted "may / may NOT" sections with two lines: *"Tier T-X. The `tools:` frontmatter is authoritative. Agent-specific constraint: `<one-line non-obvious rule>`."* |
| Tier-specific lines | T-A: "no source modification — verdicts only." T-B: "no code/test edits — artifacts only." T-C: "no Bash — Edit/MultiEdit on code/tests." |
| Tokens saved | ~80 × 8 = ~640 per full feature run |
| Risk | Low — `tools:` frontmatter is the actual enforcer |

### 4.6 Item 6 (F-6) — Delete Task-status-derivation sections

| Field | Value |
|---|---|
| Files | `agents/evaluator.md` (lines 71–73), `agents/reviewer.md` (lines 75–77) |
| Delta | Delete both `## Task-status derivation` sections entirely |
| Tokens saved | ~150 × 2 = ~300 per full feature run |
| Risk | Zero — T-A `tools:` frontmatter makes self-update structurally impossible |

### 4.7 Item 7 (F-7) — Autonomy diagnostic as references file (per D-2 override)

| Field | Value |
|---|---|
| Files | `agents/lead.md` (edit), `skills/task-breakdown/references/autonomy-diagnostic.md` (new) |
| references/autonomy-diagnostic.md shape | Full 5-Q diagnostic + 3-axis table + Consultant-inversion paragraph + worked example. Filed under the existing `task-breakdown` skill's directory per D-2 override. |
| `agents/lead.md` delta | Replace lines 70–101 with ~30-word Read-on-spawn directive: *"On first spawn for a new feature_id, Read `skills/task-breakdown/references/autonomy-diagnostic.md` and run the diagnostic. Surface the suggested tag at PAUSE-1; user accepts or overrides."* |
| Tokens saved | ~400 per `@lead` spawn after the first |
| Risk | Medium — agent Read-on-spawn reliability (no skill auto-trigger involved) |

### 4.8 Item 8 (F-8) — Severity rubric + release templates to references/

| Field | Value |
|---|---|
| Files | `agents/reviewer.md` (edit), `agents/ship.md` (edit), `skills/code-review/references/severity-rubric.md` (new), `skills/cut-release/references/templates.md` (new — same skill from item 4) |
| reviewer delta | Severity rubric (Critical/Major/Minor/Nit) → references file. Agent body: 1-line pointer. |
| ship delta | RELEASE/RUNBOOK/ANNOUNCEMENT body templates → references file. Agent body: 1-line pointer. |
| Tokens saved | ~200 per affected agent spawn |
| Risk | Low |

### 4.9 Item 9 (F-9) — Compress Status-output section

| Field | Value |
|---|---|
| Files | `commands/orchestra.md` (lines 15–37) |
| Delta | Replace 23-line prose section with 5-row event-format table + banner template block. |
| Tokens saved | ~250 per `/orchestra` call |
| Risk | Zero — output unchanged |

### 4.10 Item 10 (F-10) — Routing taxonomy at `schemas/routing-taxonomy.md` (per D-3)

| Field | Value |
|---|---|
| Files | `commands/orchestra.md` (edit), `schemas/routing-taxonomy.md` (new) |
| New file shape | Per-intent H2 sections with anchor IDs (`{#feature}`, `{#hotfix}`, etc.). Each: agents-in-order list + artifact whitelist. |
| Dispatcher delta | Step 5 keeps a compact intent→agents quick-reference (no full whitelist). Spawn-prompt mandate (lines 153–156) becomes: *"Routed intent: `<intent>`. Authorized artifacts: see `schemas/routing-taxonomy.md#<intent>` (1-line summary: `<list>` as backstop)."* |
| Tokens saved | ~400–600 per feature run (depending on agent count) |
| Risk | Medium — backstop summary mitigates external-file dependency |

---

## 5. PR sequencing <a id="S-PRSEQ-001"></a>

| PR | Items | Files | Risk | Smoke gate |
|---|---|---|---|---|
| **PR1 — P0 cleanup** | 1, 2, 3 | 6 agents + commands/orchestra.md + docs/HOOKS.md (8 files) | Low — pure deletion / moves | 5-step smoke on `feature` intent |
| **PR2 — P0 demotion** | 4 | commands/orchestra.md + 4 new skill dirs (~6 files) | Medium — new skill triggering | Smoke each subcommand independently |
| **PR3 — P1 cleanup** | 5, 6 | 8 agents | Low — tier prose collapse | All 6 intents end-to-end |
| **PR4 — P1 demotion** | 7, 8 | 3 agents + 2 new skill dirs + ~3 references files (~8 files) | Medium — agent→skill triggering | OPTION_SYNTHESIS run + release run |
| **PR5 — P2** | 9, 10 | commands/orchestra.md + schemas/routing-taxonomy.md (2 files) | Medium — spawn-prompt restructure | All 6 intents; verify whitelist enforcement |

Each PR is independently revertable. Don't merge PR2 until PR1's smoke is green; don't merge PR4 until PR2 + PR3.

---

## 6. Verification <a id="S-VERIFY-001"></a>

Per PRD-003 §S-AUDIT-001, every PR must satisfy:

| Layer | Tool / step | Catches |
|---|---|---|
| Tier discipline | `node scripts/test-agents.js` | Tools-array drift, `SendMessage` leakage |
| Frontmatter shape | `node scripts/validate.js` | Schema-doc compliance, hash-stamper compatibility |
| End-to-end | 5-step consumer install on a fresh fixture | Plugin loads, `/orchestra` dispatches, agents spawn, artifacts produced, terminal state reached |
| Token-cost regression | `wc -w commands/orchestra.md agents/*.md skills/*/SKILL.md` before/after each PR | Confirms expected savings (~2,200 / ~1,800 / ~700 per priority tier) |
| Subcommand parity (PR2 only) | Run `/orchestra resume`, `shutdown`, `release`, `commit`, `metrics` against fixture | Behavioral equivalence |
| Hooks parity | Compare `events.jsonl` event types and frequencies on a fixture run | Hook contracts unchanged (allowing timestamp/hash drift only) |
| No leaky cites | `grep -rE "(PRD §|DESIGN-[0-9]|WORKFLOW-[0-9])" agents/ commands/ skills/` returns zero hits | Consumer-surface citation discipline |

### 6.1 Per-PR success thresholds

| Metric | PR1 target | PR2 target | PR3 target | PR4 target | PR5 target |
|---|---|---|---|---|---|
| `commands/orchestra.md` words | ≤2,650 | ≤2,200 | ≤2,200 | ≤2,200 | ≤2,000 |
| Mean `agents/*.md` words | ≤820 | ≤820 | ≤700 | ≤650 | ≤650 |
| `skills/*/references/*` count | 1 | 1 | 1 | ≥4 | ≥5 |

---

## 7. Risks and mitigations <a id="S-RISKS-001"></a>

| ID | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| **R-1** | New skill (`resume-pipeline` etc.) does not auto-trigger reliably from dispatcher invocation. | Med | High — subcommand silently no-ops | Dispatcher invokes by explicit skill name in shim text, not auto-activation. PR2 smoke verifies each subcommand. |
| **R-2** | `@lead` skips Reading `skills/task-breakdown/references/autonomy-diagnostic.md` on first spawn → autonomy defaults silently. | Med | Med — wrong autonomy level | Add a backstop in `agents/lead.md`: if the diagnostic was not Read on first spawn for a new feature_id, default to `DRAFT_AND_GATE` and log a warning. (Updated 2026-05-05 per D-2 override: was originally phrased as "skips `classify-autonomy` invocation"; same backstop semantics, different mechanism — Read instead of skill auto-trigger.) |
| **R-3** | Spawn-prompt whitelist backstop drifts from `schemas/routing-taxonomy.md`. | Low | Med — drift hazard | Item 10's backstop is intentionally short (one line, intent-specific). Schema doc is single source of truth; agents Read on demand if uncertain. |
| **R-4** | Tier-prose collapse (item 5) removes a load-bearing rule we missed. | Low | High — agent breaks tier | `test-agents.js` validates `tools:` array. Smoke test on each intent verifies agents stay in tier. |
| **R-5** | docs/HOOKS.md gets cited from consumer surface by accident in a future PR. | Low | Low — leaky cite | CI grep for dev-doc citations (already in §6 verification). |
| **R-6** | Cumulative cuts overshoot — token reduction succeeds but a non-obvious behavior is lost. | Med | Med | Each PR is independently revertable. Smoke-test parity (PRD-003 §S-INVARIANTS-001 I-1) is the gate. |

---

## 8. Next step

`/sc:sc-workflow @docs/PRD-003-streamline-loading.md` (with this DESIGN-004 in the same doc tree) generates `WORKFLOW-NNN-streamline-loading.md` — the per-PR task DAG with owner/SP/blocked-by columns. Implementation runs from the workflow doc, not from this design.
