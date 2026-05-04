---
id: WORKFLOW-001-infra
title: orchestra v1.0.0 — Infrastructure Implementation Workflow
created: 2026-04-29
status: draft
revision: 2
scope: load-bearing infra rollout (PR #0–#4); leaf components (PR #5+) deferred to future workflow
references:
  prd:
    - id: PRD-001
      sections: [S-INVARIANTS-001, S-FRS-001, S-QUALITY-001, S-TESTING-001]
  design:
    - id: DESIGN-001-infra
      sections: [S-DEPGRAPH-001, S-MANIFESTS-001, S-HOOKS-001, S-MCPS-001, S-DRIFT-001, S-PRPLAN-001, S-RISKS-001]
---

# orchestra v1.0.0 — Infrastructure Implementation Workflow

> Output of `/sc:sc-workflow`. Converts DESIGN-001-infra's PR plan into a dependency-ordered task graph with exit criteria, CI matrix, and merge-gate attachments. Consumed one PR at a time by `/sc:sc-implement`.

---

## 0. Workflow at a glance <a id="S-OVERVIEW-001"></a>

| PR | Scope | Files added | Closes goal | Merge-gate risks |
|---|---|---|---|---|
| **PR #0** | Small | 1 (PRD-001.md revision) | Locks pre-scaffold inputs | none |
| **PR #1** | Medium | ~19 | G5 from commit #1 | none |
| **PR #2** | Medium-Large | ~9 + algorithmic core | G3 (drift detection) | **R1** |
| **PR #3** | Medium | ~10 | G2 (4 remaining hooks) | R3 (informational) |
| **PR #4** | Medium | ~7 | Closes infra surface | **R4** |

After PR #4 merges, `/sc:sc-implement` proceeds to PR #5+ for agents and skills (out of scope here).

---

## 1. Pre-flight tasks <a id="S-PREFLIGHT-001"></a>

All P/E tasks run **in parallel** unless noted. Tags show which PR they gate.

### 1.1 PRD edits (E-tasks) — bundle as PR #0

| ID | Task | Touches | Gates |
|---|---|---|---|
| **E-01** | Q3=A model id propagation: `model: claude-opus-4-7` + `context_mode: 1m` field | PRD §8.10, §10.1 | PR #1 (test-agents.js model check) |
| **E-02** | Extend stdlib-only rule to hooks | PRD §8.9 | PR #2 |
| **E-03** | Freeze frontmatter grammar (block-style only; no flow `{}`/`[]`; no anchors/aliases; no multi-doc; quoted hash values) | PRD §8.13 | PR #2 (yaml-mini.js implements this grammar) |
| **E-04** | Reference shape becomes `{ type, id, section, hash-at-write }` | PRD §10.5 | PR #2 (hash-stamper resolves by this shape) |
| **E-05** | Add `validate-drift.completed` and `local.bootstrapped` events | PRD §9.9 | PR #1 (validate-drift.js stub emits the event) |
| **E-06** | `.gitignore` containing `.claude/.orchestra/{local.yaml, metrics, sessions}` becomes a release-gate prerequisite | PRD §11.2, §12 | PR #1 (writes .gitignore) |
| **E-07** | Explicit `local.bootstrapped` emission post-`local.yaml`-write | PRD §9.11 step 4 | none (doc-only) |

**Bundling:** all 7 edits land as a single PR #0. PRD frontmatter `revision` bumps to `2`. Hash-stamper does not run on `docs/PRD-001.md` (it lives outside `.claude/.orchestra/`); CI does not enforce PRD frontmatter.

### 1.2 Repo cleanup (P-tasks)

| ID | Task | Gates |
|---|---|---|
| **P-08** | Remove `.venv/` from repo root (Python virtualenv foreign to design per Q2) | PR #1 (clean tree before .gitignore lands) |

### 1.3 Risk spike (parallel; non-blocking for PR #1)

| ID | Task | Gates |
|---|---|---|
| ~~P-09~~ | **R1 spike — resolved 2026-04-29.** Claude Code's PreToolUse protocol supports `hookSpecificOutput.updatedInput` (not `modifiedToolInput`). DESIGN-001-infra §3.3 step 7 updated. Source: code.claude.com/docs/en/hooks.md | done |

**Spike result — 2026-04-29:**

- Resolved via authoritative docs lookup; no live experiment needed (docs unambiguous).
- Field name: `hookSpecificOutput.updatedInput` (NOT `modifiedToolInput` as the initial design assumed).
- Required envelope: `hookEventName: "PreToolUse"`, `permissionDecision: "allow"`, `updatedInput: { ...all original tool_input fields... }`.
- Critical gotcha: `updatedInput` must include EVERY field of the original `tool_input`, not just modified ones. For `Write`: both `file_path` and `content`. For `Edit`: `file_path`, `old_string`, `new_string`, `replace_all` (if present).
- Source: <https://code.claude.com/docs/en/hooks.md>.
- Outcome: DESIGN-001-infra §3.3 step 7 updated. PR #2 proceeds with the in-design algorithm; no fallback to PostToolUse double-write needed.

### 1.4 Pre-flight dependency graph

```
E-01..E-07 ──► PR #0 ──► PR #1 ──► PR #2 ──► PR #3 ──► PR #4
                          ▲          ▲
                          │          │
P-08 ─────────────────────┘          │
                                     │
P-09 (R1 spike) ─── runs in parallel─┘ (gates merge of PR #2 only)
```

---

## 2. Per-PR work breakdown <a id="S-PRTASKS-001"></a>

Every task carries `T-NNN` ID, file/script touched, and an exit-criteria check. Exit criteria are CI-verifiable unless explicitly marked manual.

### 2.1 PR #0 — PRD revision (Small, 1 file)

| ID | Task | File | Exit criteria |
|---|---|---|---|
| T-001 | Apply E-01..E-07 in order to PRD-001.md | `docs/PRD-001.md` | PRD parses; all 7 edits visible in diff; `revision: 2` |

**PR #0 exit:** human review approves the 7 edits as a single revision.

### 2.2 PR #1 — Manifest skeletons + CI (Medium, ~19 files)

Streams labeled A–D show parallelization opportunity within the PR.

#### Stream A — manifests + schemas

| ID | Task | File | Exit criteria |
|---|---|---|---|
| T-105 | Empty install-modules manifest | `manifests/install-modules.json` | Parses; `modules: []`; schema-valid |
| T-106 | Empty runtime-toggles manifest | `manifests/runtime-toggles.json` | Parses; `toggles: []`; schema-valid |
| T-107 | known-models manifest with 3 real Anthropic ids | `manifests/known-models.json` | Parses; `claude-opus-4-7` has `default: true`; `supportsContextMode` includes `1m` for opus only |
| T-108 | install-modules JSON Schema | `schemas/install-modules.schema.json` | Validates T-105 |
| T-109 | runtime-toggles JSON Schema | `schemas/runtime-toggles.schema.json` | Validates T-106 |
| T-110 | known-models JSON Schema | `schemas/known-models.schema.json` | Validates T-107 |

#### Stream B — repo support files

| ID | Task | File | Exit criteria |
|---|---|---|---|
| T-101 | `.gitignore` with `.claude/.orchestra/{local.yaml, metrics, sessions}`, `node_modules`, `.venv/` | `.gitignore` | `git status` clean after fresh clone; orchestra paths ignored |
| T-102 | Node ≥18 package.json with no runtime deps; scripts: `validate`, `test:hooks`, `test:agents`, `test:bash-strip`, `test:drift`, `test:removability`, `test` (chains all) | `package.json` | `npm test` resolves to all 6 validators in sequence |
| T-103 | VERSION file | `VERSION` | Single line, `1.0.0`, no trailing whitespace |
| T-104 | CHANGELOG with `## [Unreleased]` | `CHANGELOG.md` | validate.js CHANGELOG↔VERSION check passes (Unreleased section exists) |
| T-111 | Minimal plugin.json (no agents listed) | `.claude-plugin/plugin.json` | Parses; has `name`, `version`, `description`, `author: hunghlh98`, `license: MIT` |
| T-119 | README scaffold with install command | `README.md` | Exists; mentions `claude plugin install hunghlh98/orchestra` |

#### Stream C — validators (depend on A + B)

| ID | Task | File | Exit criteria |
|---|---|---|---|
| T-112 | validate.js: parse all manifests, check plugin.json keys, CHANGELOG↔VERSION, file-list audit | `scripts/validate.js` | Exits 0 on clean repo; exits non-zero on broken VERSION/CHANGELOG mismatch (fixture test) |
| T-113 | test-removability.js: vacuous-pass on empty modules; assertion logic for hook/skill/mcp 1:1 | `scripts/test-removability.js` | Exits 0 on empty manifests; exits non-zero when an added module lacks a toggle (fixture test) |
| T-114 | test-agents.js skeleton: walks `agents/*.md` (none yet), passes on empty | `scripts/test-agents.js` | Exits 0 on empty agents dir |
| T-115 | test-bash-strip.js skeleton: walks implementer-tier agents (none yet) | `scripts/test-bash-strip.js` | Exits 0 on empty implementer set |
| T-116 | test-hooks.js skeleton: empty hook walker | `scripts/test-hooks.js` | Exits 0 on empty hooks dir |
| T-117 | validate-drift.js: empty-tree pass-by-default branch only | `scripts/validate-drift.js` | Exits 0 with "No artifacts found" report when `.claude/.orchestra/` absent or has no artifacts |

#### Stream D — CI

| ID | Task | File | Exit criteria |
|---|---|---|---|
| T-118 | GitHub Actions workflow runs all 6 validators on push/PR | `.github/workflows/ci.yml` | Workflow YAML valid; on PR open, all 6 jobs run and pass |

**PR #1 exit:** `npm test` runs all 6 validators green from clean checkout; CI green on the PR.

### 2.3 PR #2 — hash-stamper + validate-drift (Medium-Large, ~9 files)

| ID | Task | File | Exit criteria |
|---|---|---|---|
| T-201 | Frozen-grammar YAML parser (parse + serialize, key-order-preserving) | `hooks/lib/yaml-mini.js` | Parses every PRD frontmatter example; round-trip test (parse→serialize→parse) is fixed point |
| T-202 | Canonical SHA256 with normalization rules (CRLF→LF, trailing-whitespace strip, anchor-line excluded) | `hooks/lib/section-hash.js` | Known-input → known-hash regression (3 fixtures) |
| T-203 | hash-stamper algorithm steps 1–7 from DESIGN §3.3 | `hooks/scripts/hash-stamper.js` | Stamp-test: write fixture artifact through hook, frontmatter `sections.<id>.hash` matches independent SHA256 of normalized slice |
| T-204 | hooks.json registers hash-stamper only | `hooks/hooks.json` | Parses; matches Claude Code hook registration schema |
| T-205 | validate-drift.js full algorithm (steps 1–9 from DESIGN §5) replacing PR #1 stub | `scripts/validate-drift.js` | Walks fixture artifacts; produces DRIFT-REPORT.md with correct severity classification (3 fixture cases: clean, drift-on-confirmed, drift-on-inferred) |
| T-206 | test-hooks.js extension: hash-equality regression suite | `scripts/test-hooks.js` | For each fixture: hash-stamper(input) == validate-drift.recompute(input) byte-for-byte |
| T-207 | install-modules.json += `hook.hash-stamper` entry | `manifests/install-modules.json` | T-113 (test-removability) green |
| T-208 | runtime-toggles.json += `ORCHESTRA_HOOK_HASH_STAMPER` toggle | `manifests/runtime-toggles.json` | 1:1 correspondence with T-207 |
| T-209 | Pipeline schema doc — type-specific frontmatter fields per artifact | `docs/pipeline-schema.md` | Documents PRD, FRS, TDD, CONTRACT, SAD, TEST, CODE-REVIEW, DOC, RELEASE, RUNBOOK frontmatter shapes |

**PR #2 merge-gate G-R1 — resolved 2026-04-29.** Spike confirmed `hookSpecificOutput.updatedInput` is the canonical field; T-203 algorithm proceeds as designed. No fallback needed.

**PR #2 exit:** all PR #1 tests still pass; new hash-equality test passes; fixture artifact round-trips through hash-stamper and validate-drift agrees.

### 2.4 PR #3 — Remaining 4 hooks (Medium, ~10 files)

| ID | Task | File | Exit criteria |
|---|---|---|---|
| T-301 | pre-write-check (Blocker) — secret regex set + skip-pattern set | `hooks/scripts/pre-write-check.js` | Blocks fixture containing AWS key (exit 2 + stderr); allows fixture with `process.env.AWS_KEY` (exit 0) |
| T-302 | post-bash-lint (Observer) — source-modifying pattern detection + linter dispatch | `hooks/scripts/post-bash-lint.js` | On fixture `npm install`, emits stderr finding; exits 0 |
| T-303 | val-calibration (Rewriter for Task) — inject calibration anchor when `subagent_type === "evaluator"` | `hooks/scripts/val-calibration.js` | When triggered with evaluator subagent, prompt contains `<calibration-anchor>` block; otherwise unchanged |
| T-304 | metrics-collector (Observer multi-event) — JSONL append for 5 trigger events + rotation | `hooks/scripts/metrics-collector.js` | Appends one line per event to `metrics/events.jsonl`; idempotent dir creation; rotation triggers above 50MB threshold (fixture test forces rotation) |
| T-305 | hooks.json += 4 registrations | `hooks/hooks.json` | Parses; 5 hooks total (hash-stamper from PR #2 + 4 new) |
| T-306 | install-modules.json += 4 hook entries | `manifests/install-modules.json` | Schema-valid |
| T-307 | runtime-toggles.json += 4 env-var entries (`ORCHESTRA_HOOK_PRE_WRITE_CHECK`, `_POST_BASH_LINT`, `_VAL_CALIBRATION`, `_METRICS_COLLECTOR`) | `manifests/runtime-toggles.json` | 1:1 correspondence |
| T-308 | test-hooks.js extension: blocker test, observer tests, rewriter test for val-calibration | `scripts/test-hooks.js` | Each hook class has at least one fixture; env-var-off path tested for each |
| T-309 | test-metrics.js: JSONL append safety + rotation behavior | `scripts/test-metrics.js` | Concurrent-append fixture passes (no torn lines); 50MB+1 byte threshold triggers rotation; 6 archives → oldest pruned |

**PR #3 informational gate G-R3:** confirm no real artifact requires forbidden YAML grammar.

**PR #3 exit:** all 5 hooks register; all 5 honor `ORCHESTRA_HOOK_<NAME>=off`; metrics JSONL appends are atomic.

### 2.5 PR #4 — MCPs (Medium, ~7 files)

| ID | Task | File | Exit criteria |
|---|---|---|---|
| T-401 | orchestra-fs MCP — `tree` tool with cwd path-escape rejection + fs.readdir fallback | `scripts/mcp-servers/orchestra-fs.js` | Round-trip test from MCP client; `..`-escape rejected; works without system `tree` CLI |
| T-402 | orchestra-probe MCP — `http_probe` + `db_state` (SELECT-only + post-substitution redaction) | `scripts/mcp-servers/orchestra-probe.js` | SELECT-only test (INSERT rejected); redaction test (probe returns row containing AWS-key-shaped string → response shows `[REDACTED:aws-key]`); DSN never logged in cleartext |
| T-403 | .mcp.json registers both servers | `.claude-plugin/.mcp.json` | Parses; matches Claude Code MCP registration schema |
| T-404 | test-probe.js: round-trips against in-process HTTP server + tmp sqlite file | `scripts/test-probe.js` | http_probe returns 200 against fixture; db_state returns expected row; timeout enforced; row cap enforced |
| T-405 | install-modules.json += 2 mcp entries | `manifests/install-modules.json` | Schema-valid |
| T-406 | runtime-toggles.json += `ORCHESTRA_MCP_ORCHESTRA_FS`, `ORCHESTRA_MCP_ORCHESTRA_PROBE` | `manifests/runtime-toggles.json` | 1:1 correspondence |
| T-407 | .gitignore allow-list per PRD §11.3 | `.gitignore` | `scripts/mcp-servers/*` ignored except `orchestra-fs.js` and `orchestra-probe.js` |

**PR #4 merge-gate G-R4:** confirm `WITH ... SELECT` CTE policy in T-402 spec. If allowed: extend SELECT-only check to recognize `WITH` + look-ahead for the underlying statement. If rejected: documented as v1.0.0 limitation.

**PR #4 exit:** both MCPs are registered, all probe tests pass, secret redaction is verified.

---

## 3. Dependency graph + risk attachments <a id="S-DEPS-001"></a>

### 3.1 Cross-PR strict serial chain

```
PR #0 (PRD edits) ──► PR #1 (manifests + CI)
                            │
                            ▼
                      PR #2 (hash-stamper + drift)  ◄── G-R1 (P-09 spike)
                            │
                            ▼
                ┌───────────┴───────────┐
                ▼                       ▼
        PR #3 (4 hooks)         PR #4 (2 MCPs)
        ◄── G-R3 (info)         ◄── G-R4 (CTE policy)
```

**PR #3 and PR #4 fork after PR #2 merges.** They share no source code (different directories, different stdlib subsets) so two contributors can split. A solo contributor serializes; recommend PR #3 first since it exercises the same `hooks/` pattern PR #2 established.

### 3.2 Within-PR streams (parallelizable)

| PR | Streams | Stream order |
|---|---|---|
| PR #1 | A (manifests+schemas), B (repo support), C (validators), D (CI) | A ∥ B → C → D |
| PR #2 | foundation (T-201, T-202), algorithm (T-203 + T-205), wiring (T-204, T-206..T-209) | foundation → algorithm → wiring |
| PR #3 | 4 hook scripts (T-301..T-304), then wiring (T-305..T-309) | 4 hooks ∥ → wiring |
| PR #4 | 2 MCPs (T-401, T-402), then wiring (T-403..T-407) | 2 MCPs ∥ → wiring |

### 3.3 Risk-to-PR attachment

| Risk | Attached to | Type | Action |
|---|---|---|---|
| ~~R1~~ Hook rewrite protocol | ~~PR #2 merge-gate~~ | **Resolved 2026-04-29** | P-09 spike done; field is `updatedInput`; DESIGN-001-infra §3.3 step 7 updated |
| **R2** validate-drift performance | post-v1.0.0 runtime | Informational | Profile after first brownfield real-run; cache if measured slow |
| **R3** YAML edge cases | PR #2 review + PR #3 informational | Informational | Confirm no real artifact requires forbidden grammar; reject as `frontmatter-grammar-violation` if found |
| **R4** SELECT-only + CTEs | PR #4 merge-gate | **Blocking** | Decide CTE policy; document; implement |
| **R5** Concurrent writes | v1.1+ | Out of scope | Single-writer assumption holds for v1.0.0 |

---

## 4. CI matrix <a id="S-CI-001"></a>

Six validators run on every push/PR after T-118 (PR #1) lands. This table shows where each is introduced and extended:

| Validator | Introduced in | Extended in | Final state at v1.0.0 |
|---|---|---|---|
| `validate.js` | PR #1 (T-112) | PR #2 (frontmatter check via yaml-mini), PR #5 (agent listings) | Validates manifests + schemas + plugin.json + CHANGELOG↔VERSION + frontmatter grammar |
| `test-hooks.js` | PR #1 (T-116, empty walker) | PR #2 (T-206, hash-equality), PR #3 (T-308, 4 hook classes) | Asserts hook contracts for all 5 hooks |
| `test-agents.js` | PR #1 (T-114, empty walker) | PR #5 (8 agents validation) | Validates 8 agent frontmatters: tier, model id, context_mode |
| `test-bash-strip.js` | PR #1 (T-115, empty walker) | PR #5 (3 implementer-tier agents) | Asserts no implementer-tier agent has `Bash` |
| `validate-drift.js` | PR #1 (T-117, empty-tree branch) | PR #2 (T-205, full algorithm) | Walks all artifacts; emits DRIFT-REPORT.md |
| `test-removability.js` | PR #1 (T-113, vacuous + logic) | PR #2..#5 (each PR adds entries that are checked) | Asserts 1:1 install-modules ↔ runtime-toggles for hook/skill/mcp |

Auxiliary tests:

| Test | Introduced in | Purpose |
|---|---|---|
| `test-probe.js` | PR #4 (T-404) | MCP round-trip + security boundaries |
| `test-metrics.js` | PR #3 (T-309) | JSONL append safety + rotation |

**CI invariant:** every PR ships green CI on the merge commit. If a validator extends in a PR, that PR also extends the validator's fixtures; no PR adds untested behavior.

---

## 5. Sequencing notes <a id="S-SEQUENCE-001"></a>

### 5.1 Strict-serial cuts

These boundaries cannot be parallelized:

1. **PR #0 before PR #1** — known-models.json content depends on PRD §8.10 form choice.
2. **PR #1 before PR #2** — yaml-mini.js (PR #2) depends on the validator skeleton + manifest schemas (PR #1).
3. **PR #2 before PR #3 and PR #4** — hooks/lib/ shared code lands in PR #2.

### 5.2 Parallelizable across contributors

After PR #2 merges:

- **Contributor A** can take PR #3 (`hooks/scripts/`).
- **Contributor B** can take PR #4 (`scripts/mcp-servers/`).
- They do not touch shared files. Manifest entries can conflict at JSON-level — coordinate by appending to the end of the `modules`/`toggles` arrays and rebasing on conflict.

### 5.3 Parallelizable for solo contributor

Within a single PR, the streams in §3.2 can run as separate commits on the same branch. Recommended for PR #1 (most files, most parallelism).

### 5.4 Estimated effort

| PR | Estimate | Critical path |
|---|---|---|
| PR #0 | 1 hour | Sequential edits to PRD-001.md |
| PR #1 | 1 day | Stream C (validators) gates merge |
| PR #2 | 2 days | yaml-mini.js + hash-stamper algorithm + R1 spike resolution |
| PR #3 | 1 day | metrics-collector rotation logic + test-metrics.js |
| PR #4 | 1.5 days | orchestra-probe security boundaries + test-probe.js fixtures |

**Total infra v1.0.0:** ~5.5 contributor-days, single-stream. ~4 contributor-days with PR #3 ∥ PR #4 split.

### 5.5 Out of scope for this workflow

- **PR #5+** — agents, skills, commands, rules. A separate workflow document covers these; the leaf components plug into the harness PR #1–#4 establishes.
- **v1.1+ items** — specialist agents, deferred MCPs, third-party integrations.

---

## 6. Hand-off to `/sc:sc-implement` <a id="S-HANDOFF-001"></a>

`/sc:sc-implement` consumes this workflow one PR at a time. For each PR:

1. Read this document's PR section (§2.x) for the file/script list.
2. Read DESIGN-001-infra §3, §4, §5 for the contracts those files implement.
3. Read PRD-001 §8, §9, §11 for the invariants and validators.
4. Implement tasks in stream order; stop at the PR exit-criteria check.
5. Open PR; wait for CI green; resolve any attached merge-gate; merge.
6. Repeat for next PR.

**Recommended first invocation:**

```
/sc:sc-implement PR #0 — apply the 7 PRD edits (E-01..E-07) per WORKFLOW-001-infra §1.1
```

Then PR #1 with `/sc:sc-implement PR #1`, etc.

---

## 7. Post-shipping addenda <a id="S-ADDENDA-001"></a>

### 7.1 W3 metrics-collector scope expansion (post-PR #3)

PR #3's original T-304 spec scoped `metrics-collector` as a single-sink (`events.jsonl`) observer with 50MB rotation. After PR #3 merged, a separate W3 work stream expanded the hook to 5 sinks:

- `events.jsonl` — original single sink (rotation preserved)
- `tokens.jsonl` — per-subagent token usage (SubagentStop)
- `runs/<run-id>.json` — per-run aggregation (Stop, parent-only)
- `insights.jsonl` — `★ Insight` extraction from session jsonls
- `manifest.json` — privacy + telemetry posture (auto-created)

The expanded contract is canonical at **DESIGN-001-infra §3.6** (rewritten in revision 3 of that doc). T-309's `test-metrics.js` correspondingly grew from JSONL append-safety + rotation coverage to ~77 assertions covering all 5 sinks, redaction, insight extraction, and manifest defaults.

PRD §9.9 also reflects the 5-sink schema; `aggregate-metrics.py` and `metrics-summary.py` were added as operator-only tooling per PRD §11.1 (not CI-gated).

### 7.2 plugin.json `hooks` field removed (post-PR #3)

DESIGN-001-infra §2.1's example showed `"hooks": "hooks/hooks.json"`. Empirically this caused a redundant-load failure with the Claude Code plugin loader; commit `f00a415` removed it. Hooks are auto-discovered from `hooks/hooks.json`. The DESIGN-001 §2.1 example has been corrected; adding the field back is a regression.

### 7.3 Bootstrap moved from agent-driven to script-first

PRD §9.11's original bootstrap flow was 5 steps, all agent-driven (`@product` + `@lead` negotiate Pattern B for every project). Post-PR #3, `scripts/bootstrap-local.js` was added to handle the deterministic file-walk + heuristic mode-detection + local.yaml write steps as a stdlib-only Node script; agents only enter for ambiguous mode-detection (step 3) and SAD initialization (step 5). PRD §9.11 has been updated to describe the script-first flow. `test-bootstrap.js` validates the script's deterministic output.

### 7.4 Forward pointers

For the canonical contract on the surfaces listed above:

- `metrics-collector` 5-sink behavior → DESIGN-001-infra §3.6
- `plugin.json` shape → DESIGN-001-infra §2.1
- script-first bootstrap → PRD §9.11 + `scripts/bootstrap-local.js`
- W2 autonomy config (forward-spec) → PRD §8.14 + DESIGN-002-leaves §10 + WORKFLOW-002-leaves §2.4

---

**End of WORKFLOW-001-infra.** Implementation begins at `/sc:sc-implement PR #0`. Post-shipping refinements are tracked under §7.
