---
id: WORKFLOW-003-streamline-loading
title: orchestra v1.0.1 — Streamline Loading Implementation Workflow
created: 2026-05-05
status: draft
revision: 2
scope: 5-PR rollout for plugin token-cost reduction (PRs #1–#5 of the v1.0.1 cycle); behavior parity gated by 5-step smoke-test on every PR
references:
  prd:
    - id: PRD-003-streamline-loading
      sections: [S-INVARIANTS-001, S-FRS-001, S-AUDIT-001, S-DECISIONS-001]
  design:
    - id: DESIGN-004-streamline-loading
      sections: [S-LOADMODEL-001, S-DECISIONS-001, S-DELTAS-001, S-PRSEQ-001, S-VERIFY-001, S-RISKS-001]
sections:
  S-OVERVIEW-001:  { hash: "TBD", confirmed: true }
  S-PREFLIGHT-001: { hash: "TBD", confirmed: true }
  S-PRTASKS-001:   { hash: "TBD", confirmed: true }
  S-DEPS-001:      { hash: "TBD", confirmed: true }
  S-CI-001:        { hash: "TBD", confirmed: true }
  S-SEQUENCE-001:  { hash: "TBD", confirmed: true }
  S-HANDOFF-001:   { hash: "TBD", confirmed: true }
  S-ADDENDA-001:   { hash: "TBD", confirmed: false }
---

# orchestra v1.0.1 — Streamline Loading Implementation Workflow

> Output of `/sc:sc-workflow`. Converts DESIGN-004's 5-PR plan into a dependency-ordered task graph with exit criteria, CI matrix, and merge-gate attachments. Consumed one PR at a time by `/sc:sc-implement`. PR #1 (v1.0.1) refers to the first PR of the v1.0.1 streamlining cycle, distinct from v1.0.0's PR #0–#8 in WORKFLOW-001/002.

---

## 0. Workflow at a glance <a id="S-OVERVIEW-001"></a>

| PR | Scope | Items | Files touched | Tokens saved/run | Risk |
|---|---|---|---|---|---|
| **PR #1 (v1.0.1)** | P0 cleanup | 1, 2, 3 | ~9 (6 agents + dispatcher + new dev doc + CHANGELOG) | ~1,200 | Low |
| **PR #2 (v1.0.1)** | P0 demotion | 4 | ~10 (dispatcher + 4 new skills + CHANGELOG) | ~1,000 | Med — skill triggering |
| **PR #3 (v1.0.1)** | P1 cleanup | 5, 6 | ~9 (8 agents + CHANGELOG) | ~940 | Low |
| **PR #4 (v1.0.1)** | P1 demotion | 7, 8 | ~7 (3 agents + 3 references + CHANGELOG; per D-2 override no new skill is created in this PR) | ~800 | Med — agent Read-on-spawn reliability |
| **PR #5 (v1.0.1)** | P2 polish | 9, 10 | ~3 (dispatcher + new schema + CHANGELOG) | ~750 | Med — spawn-prompt restructure |

**Cumulative token reduction at v1.0.1:** ~4,690 per typical 7-spawn feature run = ~35–40% of plugin overhead, matching PRD-003 §S-GOALS-001.

After PR #5 merges, `/sc:sc-implement` proceeds to v1.0.1 RELEASE / RUNBOOK / ANNOUNCEMENT (handled outside this workflow per the project's smoke-before-docs discipline).

---

## 1. Pre-flight tasks <a id="S-PREFLIGHT-001"></a>

All P/E tasks run **in parallel** unless noted. Tags show which PR they gate.

### 1.1 Decision lock-in (E-tasks) — bundle as PR #0 (v1.0.1)

| ID | Task | Touches | Gates |
|---|---|---|---|
| **E-S01** | Confirm or override D-1 (per-subcommand vs combined skill). Default: per-subcommand. | DESIGN-004 §S-DECISIONS-001 | PR #2 |
| **E-S02** | ~~Confirm or override D-2.~~ **Closed 2026-05-05: user override accepted.** Autonomy diagnostic lives at `skills/task-breakdown/references/autonomy-diagnostic.md` (no new skill). | DESIGN-004 §S-DECISIONS-001 | PR #4 |
| **E-S03** | Confirm or override D-3 (`schemas/routing-taxonomy.md` location). Default: under schemas/. | DESIGN-004 §S-DECISIONS-001 | PR #5 |
| **E-S04** | Update PRD-003 §S-DECISIONS-001 status from "Accepted (pending user override)" → "Accepted" once E-S01..E-S03 close. | `docs/PRD-003-streamline-loading.md` | PR #2, #4, #5 |

**Bundling:** all 4 confirmations land in a single doc-only PR #0 (v1.0.1). PRD-003 frontmatter `revision` bumps to `2`. No code change.

### 1.2 Fixture preparation (P-tasks)

| ID | Task | Gates |
|---|---|---|
| **P-S05** | Create `scripts/test-streamline-fixture.sh` — clones a throwaway project under `/tmp/`, installs the plugin via `--plugin-dir`, runs `/orchestra <hello-world>` for each of the 6 intents, captures `events.jsonl` + `pipeline/<feature-id>/` listing into a baseline directory. | All PRs |
| **P-S06** | Capture v1.0.0 baseline by running `P-S05` on the current main HEAD. Output: `scripts/baselines/v1.0.0/<intent>/{events.jsonl,artifacts.txt,wc.txt}`. | All PRs (parity comparison) |
| **P-S07** | Capture token-cost baseline: `wc -w commands/orchestra.md agents/*.md skills/*/SKILL.md > scripts/baselines/v1.0.0/wc.txt`. | All PRs (regression target) |

### 1.3 Pre-flight dependency graph

```
E-S01..E-S04 ──► PR #0 ──► PR #1 ──► PR #2 ──► PR #3 ──► PR #4 ──► PR #5
                                       ▲                  ▲          ▲
                                       │                  │          │
P-S05, P-S06, P-S07 ───────────────────┴──────────────────┴──────────┘
                            (gates merge of every PR)

E-S01 ─── gates PR #2 only
E-S02 ─── gates PR #4 only
E-S03 ─── gates PR #5 only
```

PR #0 (v1.0.1) is doc-only and non-blocking for code PRs whose decisions it doesn't gate. PR #1 may merge before E-S01..E-S03 close because it doesn't depend on any of D-1/D-2/D-3.

---

## 2. Per-PR work breakdown <a id="S-PRTASKS-001"></a>

Every task carries `T-SNN` ID, file/script touched, and an exit-criteria check. Exit criteria are CI-verifiable unless explicitly marked manual. Streams within a PR are parallelizable; cross-stream dependencies noted explicitly.

### 2.1 PR #1 (v1.0.1) — P0 cleanup (Low, ~9 files)

Implements PRD-003 F-1, F-2, F-3 (items 1, 2, 3 from DESIGN-004).

#### Stream A — agent body cleanup

| ID | Task | File | Exit criteria |
|---|---|---|---|
| **T-S01** | Delete `## Routing-taxonomy guard` section (lines 30–43); insert 1-line replacement | `agents/lead.md` | `test-agents.js` green; manual diff shows 1-line replacement near top of body |
| **T-S02** | Replace schema-citation block with 1-line citation; preserve type-specific section list | `agents/lead.md` | citation present; `validate.js` green |
| **T-S03** | Replace schema-citation block with 1-line citation | `agents/product.md` | citation present; `validate.js` green |
| **T-S04** | Replace schema-citation block with 1-line citation | `agents/reviewer.md` | citation present; `validate.js` green |
| **T-S05** | Replace schema-citation block with 1-line citation | `agents/test.md` | citation present; `validate.js` green |
| **T-S06** | Replace schema-citation block with 1-line citation | `agents/ship.md` | citation present; `validate.js` green |
| **T-S07** | Replace schema-citation block with 1-line citation | `agents/evaluator.md` | citation present; `validate.js` green |

T-S01 may merge with T-S02 in a single edit (both touch `agents/lead.md`).

#### Stream B — dispatcher cleanup

| ID | Task | File | Exit criteria |
|---|---|---|---|
| **T-S08** | Replace verbose hooks table (lines 174–185) with 5-row glossary: `hook-name \| event-matcher \| one-line side effect` | `commands/orchestra.md` | dispatcher word count drops by ~500; smoke test confirms hook events still fire |

#### Stream C — dev-surface doc

| ID | Task | File | Exit criteria |
|---|---|---|---|
| **T-S09** | Create `docs/HOOKS.md` with full hooks prose previously at `commands/orchestra.md:178-185` | `docs/HOOKS.md` (new) | file exists; CLAUDE.md leaky-cite grep returns 0 hits in `agents/`, `commands/`, `skills/` |

#### Stream D — release wiring

| ID | Task | File | Exit criteria |
|---|---|---|---|
| **T-S10** | Bump `manifest.json.version` to `1.0.1`; bump `plugin.json.version` to `1.0.1` | `manifest.json`, `plugin.json` | files parse; semver patch increment |
| **T-S11** | Add `CHANGELOG.md` entry for v1.0.1 PR #1 citing PRD-003 §S-FRS-001 F-1/F-2/F-3 and DESIGN-004 §S-DELTAS-001 items 1–3 | `CHANGELOG.md` | entry present; cite-discipline allowed (CHANGELOG is dev-trace surface per CLAUDE.md) |

#### PR #1 exit (CI + smoke)

1. `node scripts/test-agents.js` exits 0
2. `node scripts/validate.js` exits 0
3. `bash scripts/test-streamline-fixture.sh` produces an artifact set matching `baselines/v1.0.0/` for all 6 intents (timestamp/hash/token drift allowed)
4. `wc -w commands/orchestra.md` ≤ 2,650 (down from 3,141)
5. `grep -rE "(PRD §|DESIGN-[0-9]|WORKFLOW-[0-9])" agents/ commands/ skills/` returns 0 hits

### 2.2 PR #2 (v1.0.1) — Subcommand demotion (Med, ~10 files)

Implements PRD-003 F-4 (item 4 from DESIGN-004). Gated by E-S01 (D-1 lock-in).

#### Stream A — new skills (per D-1 default: 4 skills)

| ID | Task | File | Exit criteria |
|---|---|---|---|
| **T-S12** | Create `skills/resume-pipeline/SKILL.md` with topological-walk algorithm currently at `commands/orchestra.md:220-243` | `skills/resume-pipeline/SKILL.md` (new) | SKILL.md ≤ 1,500 words; frontmatter `name`/`description` present; description starts with "This skill should be used when…" |
| **T-S13** | Create `skills/shutdown-team/SKILL.md` with in-session teardown algorithm from `commands/orchestra.md:245-255` | `skills/shutdown-team/SKILL.md` (new) | as above |
| **T-S14** | Create `skills/cut-release/SKILL.md` with release-gate verification from `commands/orchestra.md:197-202` | `skills/cut-release/SKILL.md` (new) | as above |
| **T-S15** | Create `skills/report-metrics/SKILL.md` with the metrics-summary invocation from `commands/orchestra.md:212-218` | `skills/report-metrics/SKILL.md` (new) | as above |

#### Stream B — dispatcher dispatch shims

| ID | Task | File | Exit criteria |
|---|---|---|---|
| **T-S16** | Replace `/orchestra resume` body (lines 220–243) with 2–4 line shim invoking `resume-pipeline` skill | `commands/orchestra.md` | line count drop matches; `/orchestra resume` smoke output identical to baseline |
| **T-S17** | Replace `/orchestra shutdown` body (lines 245–255) with shim invoking `shutdown-team` skill | `commands/orchestra.md` | as above |
| **T-S18** | Replace `/orchestra release` body (lines 197–202) with shim invoking `cut-release` skill | `commands/orchestra.md` | as above |
| **T-S19** | Replace `/orchestra metrics` body (lines 212–218) with shim — keep the bash command line, cut surrounding prose; no new skill (one-liner stays inline) | `commands/orchestra.md` | line count drop matches; `/orchestra metrics --limit 5` output identical to baseline |
| **T-S20** | Trim `/orchestra commit` prose (lines 204–210) to 1 dispatch line invoking the existing `commit-work` skill | `commands/orchestra.md` | output identical |

T-S16..T-S18 depend on T-S12..T-S14 respectively (same row).

#### Stream C — release wiring

| ID | Task | File | Exit criteria |
|---|---|---|---|
| **T-S21** | CHANGELOG entry for v1.0.1 PR #2 | `CHANGELOG.md` | entry present |

#### PR #2 exit (CI + per-subcommand smoke)

1. PR #1 exit criteria (recurrent)
2. **Subcommand parity (manual):** run each of `/orchestra resume`, `shutdown`, `release`, `commit`, `metrics` against the fixture project. Output matches baseline pre-PR.
3. `wc -w commands/orchestra.md` ≤ 2,200 (down from ~2,650 after PR #1)
4. `find skills -type d | wc -l` = baseline + 4

### 2.3 PR #3 (v1.0.1) — Tier + status-derive cleanup (Low, ~9 files)

Implements PRD-003 F-5, F-6 (items 5, 6 from DESIGN-004).

#### Stream A — tier-discipline collapse (8 agents)

| ID | Task | File | Exit criteria |
|---|---|---|---|
| **T-S22** | Replace `## Tier discipline` + `## Hard boundaries` sections with 2-line summary (tier letter + agent-specific constraint) | `agents/backend.md` | `test-agents.js` green; tier T-C still enforced via `tools:` |
| **T-S23** | as above | `agents/frontend.md` | as above |
| **T-S24** | as above | `agents/lead.md` | tier T-B enforced |
| **T-S25** | as above | `agents/product.md` | tier T-B enforced |
| **T-S26** | as above | `agents/test.md` | tier T-C enforced |
| **T-S27** | as above | `agents/ship.md` | tier T-B enforced |
| **T-S28** | as above; preserve calibration-anchor mention (load-bearing for `val-calibration` hook) | `agents/evaluator.md` | tier T-A enforced; calibration anchor reference intact |
| **T-S29** | as above | `agents/reviewer.md` | tier T-A enforced |

#### Stream B — task-status section deletes

| ID | Task | File | Exit criteria |
|---|---|---|---|
| **T-S30** | Delete `## Task-status derivation (T-A; do NOT self-report)` section (lines 71–73) | `agents/evaluator.md` | section absent; `/orchestra resume` still derives status from verdict |
| **T-S31** | Delete `## Task-status derivation (T-A; do NOT self-report)` section (lines 75–77) | `agents/reviewer.md` | section absent; `/orchestra resume` still derives status from verdict |

#### Stream C — release wiring

| ID | Task | File | Exit criteria |
|---|---|---|---|
| **T-S32** | CHANGELOG entry for v1.0.1 PR #3 | `CHANGELOG.md` | entry present |

#### PR #3 exit (CI + 6-intent smoke)

1. PR #1, PR #2 exit criteria (recurrent)
2. All 6 intents (`feature`, `template`, `hotfix`, `refactor`, `docs`, `review-only`) run end-to-end on fixture; artifact sets match baseline
3. Mean `wc -w agents/*.md` ≤ 700 (down from ~870)
4. `/orchestra resume` test against a half-completed fixture: status derivation works for both `@evaluator` and `@reviewer` tasks

### 2.4 PR #4 (v1.0.1) — References demotion (Med, ~7 files)

Implements PRD-003 F-7, F-8 (items 7, 8 from DESIGN-004). Gated by E-S02 (D-2 lock-in, override accepted 2026-05-05). Reuses `skills/cut-release/` from PR #2.

#### Stream A — autonomy diagnostic as references file (per D-2 override)

| ID | Task | File | Exit criteria |
|---|---|---|---|
| ~~**T-S33**~~ | ~~Create `skills/classify-autonomy/SKILL.md`~~ | — | **Removed in PR #0 (v1.0.1) per D-2 override.** No new skill is created. |
| **T-S34** | Create `skills/task-breakdown/references/autonomy-diagnostic.md` with full 5-Q + 3-axis + Consultant-inversion + worked example currently at `agents/lead.md:70-101` | `skills/task-breakdown/references/autonomy-diagnostic.md` (new) | file exists; content byte-equivalent to lifted source |
| **T-S35** | Replace `agents/lead.md:70-101` (`## Autonomy classification` section) with ~30-word Read-on-spawn directive: *"On first spawn for a new feature_id, Read `skills/task-breakdown/references/autonomy-diagnostic.md` and run the diagnostic. Surface the suggested tag at PAUSE-1."* | `agents/lead.md` | section replaced; OPTION_SYNTHESIS smoke still surfaces tag at PAUSE-1 |

#### Stream B — references for existing skills (item 8)

| ID | Task | File | Exit criteria |
|---|---|---|---|
| **T-S36** | Create `skills/code-review/references/severity-rubric.md` with Critical/Major/Minor/Nit definitions currently inline in `agents/reviewer.md` | `skills/code-review/references/severity-rubric.md` (new) | file exists |
| **T-S37** | Replace severity-rubric prose in `agents/reviewer.md` with 1-line pointer to the references file | `agents/reviewer.md` | pointer present; reviewer body word count drops by ~150 |
| **T-S38** | Create `skills/cut-release/references/templates.md` with RELEASE / RUNBOOK / ANNOUNCEMENT body templates currently inline in `agents/ship.md` | `skills/cut-release/references/templates.md` (new) | file exists |
| **T-S39** | Replace template prose in `agents/ship.md` with 1-line pointer | `agents/ship.md` | pointer present; ship body word count drops by ~200 |

T-S37 depends on T-S36; T-S39 depends on T-S38.

#### Stream C — release wiring

| ID | Task | File | Exit criteria |
|---|---|---|---|
| **T-S40** | CHANGELOG entry for v1.0.1 PR #4 | `CHANGELOG.md` | entry present |

#### PR #4 exit (CI + targeted smoke)

1. PR #1–#3 exit criteria (recurrent)
2. **Autonomy classification smoke (manual):** run a feature where the natural prompt should classify as `OPTION_SYNTHESIS` (e.g., "evaluate Postgres vs DynamoDB for the events table"). Confirm `@lead` Reads `skills/task-breakdown/references/autonomy-diagnostic.md` on first spawn and surfaces the suggested tag at PAUSE-1.
3. **Release smoke:** `/orchestra release` produces RELEASE.md byte-equivalent in shape to baseline; severity classification on a fresh CODE-REVIEW unchanged.
4. `find skills -type d -name references | wc -l` ≥ 4 (was 1 baseline; +3 new)

### 2.5 PR #5 (v1.0.1) — Status output + routing taxonomy (Med, ~3 files)

Implements PRD-003 F-9, F-10 (items 9, 10 from DESIGN-004). Gated by E-S03 (D-3 lock-in).

#### Stream A — status compress

| ID | Task | File | Exit criteria |
|---|---|---|---|
| **T-S41** | Replace prose at `commands/orchestra.md:15-37` with 5-row event-format table + banner template block | `commands/orchestra.md` | section drops by ~250 tokens; status lines and banners emit identically (compare `events.jsonl`) |

#### Stream B — routing taxonomy externalize (per D-3)

| ID | Task | File | Exit criteria |
|---|---|---|---|
| **T-S42** | Create `schemas/routing-taxonomy.md` with per-intent H2 sections (`{#feature}`, `{#hotfix}`, `{#template}`, `{#refactor}`, `{#docs}`, `{#review-only}`); each holds agent list + artifact whitelist | `schemas/routing-taxonomy.md` (new) | file parses; 6 anchor IDs present; whitelist content byte-equivalent to current `commands/orchestra.md:144-151` |
| **T-S43** | Update `commands/orchestra.md` Step 5 to keep compact intent→agents quick-reference (no full whitelist); rewrite spawn-prompt mandate (lines 153–156) to reference `schemas/routing-taxonomy.md#<intent>` with 1-line backstop summary | `commands/orchestra.md` | smoke runs of all 6 intents produce identical artifact whitelisting; ESCALATE on out-of-whitelist still fires |

T-S43 depends on T-S42.

#### Stream C — release wiring

| ID | Task | File | Exit criteria |
|---|---|---|---|
| **T-S44** | CHANGELOG entry for v1.0.1 PR #5 | `CHANGELOG.md` | entry present |

#### PR #5 exit (CI + 6-intent enforcement smoke)

1. PR #1–#4 exit criteria (recurrent)
2. All 6 intents run on fixture; each produces ONLY whitelisted artifacts per `schemas/routing-taxonomy.md`
3. Out-of-whitelist negative test: spawn `@lead` for `intent=docs` (refusal row); confirm `ESCALATE-<id>.md` written
4. Final cumulative target: `wc -w commands/orchestra.md` ≤ 2,000; `find skills -type d -name references | wc -l` ≥ 5

---

## 3. Dependency graph + risk attachments <a id="S-DEPS-001"></a>

### 3.1 Cross-PR strict serial chain

```
E-S01..E-S04 ──► PR #0 (v1.0.1) ──► PR #1 ──► PR #2 ──► PR #3 ──► PR #4 ──► PR #5 ──► v1.0.1 RELEASE
                                                          ▲                  ▲          ▲
                                                          │                  │          │
                                                E-S01 ────┘                  │          │
                                                E-S02 ───────────────────────┘          │
                                                E-S03 ──────────────────────────────────┘
```

PR #1 may merge ahead of E-S01..E-S03 closure (it depends on no decisions). PR #2/#4/#5 each block on their respective decisions.

### 3.2 Within-PR streams (parallelizable)

| PR | Stream A | Stream B | Stream C | Stream D |
|---|---|---|---|---|
| PR #1 | T-S01..T-S07 (agents) | T-S08 (dispatcher) | T-S09 (dev doc) | T-S10..T-S11 (release wiring) |
| PR #2 | T-S12..T-S15 (4 new skills) | T-S16..T-S20 (dispatcher shims; depends on Stream A per row) | — | T-S21 (CHANGELOG) |
| PR #3 | T-S22..T-S29 (8 agents) | T-S30..T-S31 (status-derive deletes) | — | T-S32 (CHANGELOG) |
| PR #4 | T-S34..T-S35 (autonomy references; T-S33 removed per D-2 override) | T-S36..T-S39 (references; T-S37/T-S39 depend on T-S36/T-S38) | — | T-S40 (CHANGELOG) |
| PR #5 | T-S41 (status output) | T-S42..T-S43 (routing taxonomy; T-S43 depends on T-S42) | — | T-S44 (CHANGELOG) |

### 3.3 Risk-to-PR attachment

Risks are sourced from DESIGN-004 §S-RISKS-001.

| Risk | Affects PR | Mitigation in workflow |
|---|---|---|
| **R-1** Skill triggering unreliable | PR #2 | T-S12..T-S15 enforce specific frontmatter `description`s; PR exit gates require subcommand smoke parity. (PR #4 no longer affected per D-2 override — no new skill triggered there.) |
| **R-2** `@lead` skips Reading autonomy diagnostic | PR #4 | T-S35 includes a backstop: if `@lead` does not Read the references file on first spawn for a new feature_id, default to `DRAFT_AND_GATE` and log a warning event. (Updated 2026-05-05 per D-2 override: was previously phrased as "skips classify-autonomy skill output"; same backstop semantics, different mechanism.) |
| **R-3** Spawn-prompt whitelist drift | PR #5 | T-S43 keeps a 1-line backstop summary in spawn prompt so agents don't depend on the external file Read for the common path |
| **R-4** Tier-collapse removes load-bearing rule | PR #3 | T-S22..T-S29 each have an explicit "tier still enforced via `tools:`" exit check; `test-agents.js` is the gate |
| **R-5** docs/HOOKS.md cited from consumer surface | PR #1 (introduction) + ongoing | PR #1 exit grep for dev-doc cites in `agents/`, `commands/`, `skills/` returns 0 hits; same grep is added to every subsequent PR exit |
| **R-6** Cumulative cuts overshoot | All PRs | Each PR is independently revertable; smoke-test parity is the gate per PR exit; no "big bang" merge |

---

## 4. CI matrix <a id="S-CI-001"></a>

| Validator / step | PR #1 | PR #2 | PR #3 | PR #4 | PR #5 |
|---|---|---|---|---|---|
| `node scripts/test-agents.js` | ✅ | ✅ | ✅ | ✅ | ✅ |
| `node scripts/validate.js` | ✅ | ✅ | ✅ | ✅ | ✅ |
| `bash scripts/test-streamline-fixture.sh` (6 intents) | ✅ | ✅ | ✅ | ✅ | ✅ |
| Word-count regression vs baseline | ✅ ≤2,650 dispatcher | ✅ ≤2,200 dispatcher | ✅ ≤700 mean agent | ✅ ≥4 references/ | ✅ ≤2,000 dispatcher; ≥5 references/ |
| Subcommand parity (`resume`/`shutdown`/`release`/`commit`/`metrics`) | — | ✅ (manual) | — | ✅ (release subset) | — |
| Autonomy-classifier smoke | — | — | — | ✅ (manual) | — |
| Whitelist-enforcement smoke | — | — | — | — | ✅ (6 intents + 1 negative) |
| Leaky-cite grep returns 0 | ✅ | ✅ | ✅ | ✅ | ✅ |
| Hooks parity (events.jsonl event types) | ✅ | ✅ | ✅ | ✅ | ✅ |

`scripts/test-streamline-fixture.sh` (P-S05) is the only new script introduced by this workflow. All other validators already exist.

---

## 5. Sequencing notes <a id="S-SEQUENCE-001"></a>

### 5.1 Strict-serial cuts (cannot parallelize across PRs)

- PR #2 → PR #3: PR #2 modifies `commands/orchestra.md` heavily; PR #3 only modifies agents. Could in theory parallelize, but the subcommand smoke in PR #2 is harder to validate if agent bodies are also in flux. Run serial.
- PR #4 → PR #5: PR #4's `cut-release` skill creation is reused by PR #5's wiring? No — `cut-release` is fully created in PR #2 (item 4) and only gets a `references/templates.md` added in PR #4 (item 8). PR #5 is independent of PR #4, but serializing keeps the smoke test unambiguous.

### 5.2 Parallelizable streams (within a single PR)

- PR #1 streams A/B/C/D all parallelize trivially (different files).
- PR #2 stream A (skill creation) must complete before stream B (dispatcher shims) for each subcommand pair.
- PR #3 streams A/B parallelize (different files).
- PR #4 streams A/B parallelize; within stream B, T-S37/T-S39 each depend on the matching references file.
- PR #5 stream B has T-S43 depending on T-S42.

### 5.3 Estimated effort (story points; 1 SP ≈ 10–15 min)

| PR | SP | Notes |
|---|---|---|
| PR #0 (v1.0.1) | 2 | doc-only; decisions + PRD revision |
| PR #1 | 12 | mostly mechanical edits; 1 new file |
| PR #2 | 22 | 4 new skills + 5 dispatcher edits + smoke per subcommand |
| PR #3 | 10 | 8 agent edits + 2 deletes |
| PR #4 | 11 | 3 references + 3 agent edits + targeted smoke (per D-2 override no new skill is created) |
| PR #5 | 8 | 1 new schema + 1 dispatcher edit |
| **Total** | **65 SP** | fits comfortably in a single sprint for one contributor |

### 5.4 Out of scope for this workflow

- v1.0.1 RELEASE / RUNBOOK / ANNOUNCEMENT authoring — handled outside this workflow per the project's `feedback_smoke-before-release-docs` discipline (smoke-test the consumer install path BEFORE these are written).
- Token-cost regression in CI (PRD-003 §S-BACKLOG-001 — deferred).
- Compressing `<example>` blocks in agents (PRD-003 §S-NONGOALS-001).
- New features, agents, hooks, or MCP tools (PRD-003 §S-NONGOALS-001).
- Migrating dispatcher Steps 1–7 to a skill (DESIGN-004 §1 explicit out-of-scope).

---

## 6. Hand-off to `/sc:sc-implement` <a id="S-HANDOFF-001"></a>

`/sc:sc-implement` consumes this workflow one PR at a time:

```
/sc:sc-implement docs/WORKFLOW-003-streamline-loading.md --pr 1
# (after PR #1 merges + smoke passes)
/sc:sc-implement docs/WORKFLOW-003-streamline-loading.md --pr 2
# (and so on)
```

Per PR, `/sc:sc-implement`:

1. Reads the per-PR §2.N section of this workflow.
2. Spawns the appropriate orchestra agents (mostly `@backend` and `@reviewer` for plugin self-modification — though for plugin development, contributor humans typically execute these tasks; the orchestra pipeline is for *consumer* projects, not for editing the orchestra plugin itself).
3. Walks the T-SNN task table in stream order (parallel within stream, serial across streams where dependencies exist).
4. Runs the per-PR exit gate (validators + smoke fixture) before declaring the PR mergeable.
5. Writes a `verify/<NNN>-VERDICT.md` per the standard pipeline-artifact shape if invoked under `/orchestra` semantics; otherwise emits a plain summary.

**Important context for `/sc:sc-implement`:** the orchestra plugin is *the system being modified*. Running `/orchestra` against this plugin's repo to modify itself would create a re-entrancy issue (the dispatcher is being edited mid-run). Contributors should run `/sc:sc-implement` against this workflow doc directly, OR execute the T-SNN tasks manually one PR at a time. The smoke fixture (P-S05) runs against a *separate* throwaway project to test the modified plugin without re-entrance.

### 6.1 Pre-merge checklist (per PR)

- [ ] All T-SNN tasks for this PR closed (boxes ticked)
- [ ] CI matrix row for this PR all-green
- [ ] Smoke fixture runs for all 6 intents (PR #3+) or applicable subset (PR #1, #2)
- [ ] CHANGELOG entry citing PRD-003 + DESIGN-004 sections
- [ ] No leaky cites in consumer surface (grep gate)
- [ ] Token-cost regression at-or-below per-PR target

---

## 7. Post-shipping addenda <a id="S-ADDENDA-001"></a>

(Filled in post-merge as PRs land. Confirmed: false until v1.0.1 RELEASE writes.)

- [ ] PR #1 actual token savings (vs §0 estimate of ~1,200)
- [ ] PR #2 actual token savings (vs ~1,000)
- [ ] PR #3 actual token savings (vs ~940)
- [ ] PR #4 actual token savings (vs ~800)
- [ ] PR #5 actual token savings (vs ~750)
- [ ] Cumulative measured reduction vs §0 estimate of ~4,690
- [ ] Any P-tasks deferred to v1.0.2 (decision points emerging from smoke runs)

---

**End of WORKFLOW-003-streamline-loading. Hand off to `/sc:sc-implement --pr 1` after E-S01..E-S04 close (or proceed to PR #1 directly since it depends on no decisions).**
