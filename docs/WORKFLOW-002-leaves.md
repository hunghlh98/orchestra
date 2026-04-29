---
id: WORKFLOW-002-leaves
title: orchestra v1.0.0 — Leaf Components Implementation Workflow
created: 2026-04-29
status: draft
revision: 1
scope: leaf components rollout (PR #5–#7); harness already shipped (PR #1–#4)
references:
  prd:
    - id: PRD-001
      sections: [S-INVARIANTS-001, S-FRS-001, S-QUALITY-001]
  design:
    - id: DESIGN-002-leaves
      sections: [S-AGENTS-001, S-SKILLS-001, S-COMMAND-001, S-RULES-001, S-MANIFESTS-001, S-PRPLAN-001, S-RISKS-001]
  workflow:
    - id: WORKFLOW-001-infra
      sections: [S-OVERVIEW-001, S-CI-001]
---

# orchestra v1.0.0 — Leaf Components Implementation Workflow

> Output of the second `/sc:sc-workflow` pass. Converts DESIGN-002-leaves' PR plan into a dependency-ordered task graph with exit criteria, CI matrix, and risk attachments. Consumed one PR at a time by `/sc:sc-implement`. After PR #7 merges, v1.0.0 is feature-complete pending release-time polish.

---

## 0. Workflow at a glance <a id="S-OVERVIEW-001"></a>

| PR | Scope | Files added | Closes goal | Merge-gate risks |
|---|---|---|---|---|
| **Pre-flight** | Tiny | 1 (PRD edit) | Resolves R10 | none |
| **PR #5** | Medium-Large | ~17 (8 skills + ~7 references + calibration) | Unblocks val-calibration; G6 manifest-active | R7, R9 |
| **PR #6** | Medium | ~10 (8 agents + plugin.json + validators) | G2 fully-enforced; G6 fully-validated | R6 |
| **PR #7** | Medium | ~14 (1 command + 12 rules + validate.js ext) | G1 entry surface + G7 language-extensible | R8 |

After PR #7 merges, the v1.0.0 plugin is feature-complete pending release-time polish (RELEASE-v1.0.0.md, distribution scripts, README expansion).

---

## 1. Pre-flight tasks <a id="S-PREFLIGHT-001"></a>

Single one-time task that lands before PR #5 begins.

### 1.1 PRD edit (E-tasks) — bundle as Pre-flight commit

| ID | Task | Touches | Gates |
|---|---|---|---|
| **T-PA-01** | R10 resolution per DESIGN-002-leaves §7.3: amend PRD §8.7 so env-var toggles cover only **skill / hook / MCP**. Replace agent/rule/command env-var rows with their kind-specific toggle mechanism (plugin.json removal, paths-glob editing). Bump frontmatter `revision: 3 → 4`. | `docs/PRD-001.md` (§8.7 only) | PR #5 (test-removability extension assumes this scope) |

**Bundling:** lands as a single `docs(spec):` commit before PR #5 work begins. Pattern matches PR #0 from WORKFLOW-001-infra §1.1.

**Why pre-flight rather than PR #5:** test-removability's toggleable-kinds set was set to `{hook, skill, mcp}` in PR #1 and never widened. PR #5 adds 8 skill toggles assuming this scope; the PRD must agree before that PR's exit criterion ("test-removability reports 15 modules / 15 toggles") is evaluable.

### 1.2 Pre-flight dependency graph

```
T-PA-01 (PRD §8.7 amendment) ──► PR #5 ──► PR #6 ─┐
                                      └─► PR #7 ──┴──► v1.0.0 release prep
```

R10 resolution is the only pre-flight requirement. R6, R7, R8, R9, R11 are merge-gates or informational and attach to specific PRs (see §3).

---

## 2. Per-PR work breakdown <a id="S-PRTASKS-001"></a>

Every task carries `T-NNN` ID, file/script touched, and an exit-criteria check. CI verifiable unless explicitly marked manual.

### 2.1 PR #5 — Skills (Medium-Large, ~17 files)

Streams labeled A–D show parallelization within the PR.

#### Stream A — 8 SKILL.md files

| ID | Task | File | Exit criteria |
|---|---|---|---|
| T-501 | task-breakdown SKILL.md | `skills/task-breakdown/SKILL.md` | ≤400 lines; frontmatter passes new validate.js skill check; `name` matches folder |
| T-502 | project-discovery SKILL.md | `skills/project-discovery/SKILL.md` | same |
| T-503 | code-review SKILL.md | `skills/code-review/SKILL.md` | same |
| T-504 | qa-test-planner SKILL.md | `skills/qa-test-planner/SKILL.md` | same |
| T-505 | commit-work SKILL.md | `skills/commit-work/SKILL.md` | same |
| T-506 | write-contract SKILL.md | `skills/write-contract/SKILL.md` | same |
| T-507 | evaluator-tuning SKILL.md | `skills/evaluator-tuning/SKILL.md` | same |
| T-508 | java-source-intel SKILL.md | `skills/java-source-intel/SKILL.md` | same; description trigger keywords include "Java" |

Each SKILL.md follows the skeleton from DESIGN-002 §3.1. **Per CLAUDE.md surgical-changes principle:** description fields ≤200 chars with 3+ trigger keywords (PRD §10.2).

#### Stream B — references/ files

References ship **only when SKILL.md cites them** AND the depth genuinely doesn't fit in 400 lines. Aggressive triage.

| ID | Task | File | Mandatory? |
|---|---|---|---|
| **T-521** | calibration-examples.md (load-bearing) | `skills/evaluator-tuning/references/calibration-examples.md` | **YES** (val-calibration depends on it) |
| T-509 | sp-matrix.md | `skills/task-breakdown/references/sp-matrix.md` | conditional |
| T-510 | decomposition-patterns.md | `skills/task-breakdown/references/decomposition-patterns.md` | conditional |
| T-511 | language-signatures.md | `skills/project-discovery/references/language-signatures.md` | conditional |
| T-512 | framework-signatures.md | `skills/project-discovery/references/framework-signatures.md` | conditional |
| T-513 | severity-rubric.md | `skills/code-review/references/severity-rubric.md` | conditional |
| T-514 | language-checklists.md | `skills/code-review/references/language-checklists.md` | conditional |
| T-515 | coverage-strategies.md | `skills/qa-test-planner/references/coverage-strategies.md` | conditional |
| T-516 | fuzz-input-patterns.md | `skills/qa-test-planner/references/fuzz-input-patterns.md` | conditional |
| T-517–520 | commit-work + write-contract refs | `skills/{commit-work,write-contract}/references/*.md` | conditional |
| T-522–523 | java-source-intel refs (P1) | `skills/java-source-intel/references/{ripgrep-patterns,transactional-scans}.md` | conditional |

**Rule of thumb:** if SKILL.md hits ~350 lines without a topic, that topic ships as a reference. Otherwise inline. Implementer judges per-skill. **Calibration-examples.md is the only hard requirement** in this stream.

#### Stream C — Validator extensions

| ID | Task | File | Exit criteria |
|---|---|---|---|
| T-524 | validate.js skill check | `scripts/validate.js` | Walks `skills/*/SKILL.md`; asserts: frontmatter has `name`/`description`/`origin`; `name` === parent folder; description ≤200 chars; body ≤400 lines. Mutation test: a 401-line SKILL.md fails red |
| T-525 | test-hooks.js val-calibration assertion | `scripts/test-hooks.js` | When `skills/evaluator-tuning/references/calibration-examples.md` exists, val-calibration spawned with `subagent_type=evaluator` MUST emit `updatedInput.prompt` containing `<calibration-anchor>` block. The PR #3 graceful-no-op assertion flips from "no `updatedInput`" to "has `updatedInput` with anchor" |

#### Stream D — Manifest + CHANGELOG

| ID | Task | File | Exit criteria |
|---|---|---|---|
| T-526 | install-modules.json += 8 skill entries | `manifests/install-modules.json` | Schema-valid; entries match DESIGN-002 §7.1 table |
| T-527 | runtime-toggles.json += 8 skill toggles | `manifests/runtime-toggles.json` | 1:1 with T-526; test-removability green |
| T-528 | CHANGELOG entry under `## [Unreleased]` | `CHANGELOG.md` | Documents 8 skills + calibration source + 2 validator extensions |

**PR #5 exit criteria:**
- `npm test` green; all 8 validators pass
- `test-removability` reports **15 modules / 15 toggles** (7 from infra + 8 skills)
- `test-hooks.js` val-calibration assertion now asserts injection (not passthrough)
- All 8 SKILL.md files load via `Skill` tool from a sample agent prompt (manual smoke; full agent integration in PR #6)

**Pre-merge gate:** R7 (skill ≤400-line cap) — implementation may surface skills that won't fit. Mitigation per DESIGN-002 §9: aggressive use of references/. If a skill genuinely needs >400 lines, request a PRD §8.8 amendment in the same PR.

**Pre-merge gate (informational):** R9 (calibration source quality) — at least one PR-review pass should walk through a `@evaluator` boundary case using calibration-examples.md as the lens. Doesn't block merge but should flag any obvious gaps.

### 2.2 PR #6 — Agents (Medium, ~10 files)

#### Stream A — 8 agent files

| ID | Task | File | Exit criteria |
|---|---|---|---|
| T-601 | @product agent (T-B tier) | `agents/product.md` | Frontmatter passes test-agents 7-check; tools = `["Read","Grep","Glob","Write"]`; ≥1 `<example>` block |
| T-602 | @lead agent (T-B tier) | `agents/lead.md` | same shape; lists `task-breakdown`/`project-discovery`/`write-contract` in body's `## Skills` section |
| T-603 | @backend agent (T-C tier) | `agents/backend.md` | tools = `["Read","Grep","Glob","Write","Edit","MultiEdit"]` (NO `Bash`); test-bash-strip green |
| T-604 | @frontend agent (T-C tier) | `agents/frontend.md` | same; ≥1 `<example>` showing all-4-states pattern (loading/empty/error/success) |
| T-605 | @test agent (T-C tier) | `agents/test.md` | same; references `qa-test-planner` skill |
| T-606 | @evaluator agent (T-A tier +Bash +Write) | `agents/evaluator.md` | tools = `["Read","Grep","Glob","Bash","Write"]`; body declares "Write only verdict artifacts" hard boundary |
| T-607 | @reviewer agent (T-A tier +Bash +Write) | `agents/reviewer.md` | same shape; declares ≥80% confidence threshold |
| T-608 | @ship agent (T-B tier) | `agents/ship.md` | tools = `["Read","Grep","Glob","Write"]`; references `commit-work` skill |

#### Stream B — Plugin wiring

| ID | Task | File | Exit criteria |
|---|---|---|---|
| T-609 | plugin.json `agents` array | `.claude-plugin/plugin.json` | Lists 8 paths in T-601..T-608 order; validate.js still passes |
| T-610 | install-modules.json += 8 agent entries | `manifests/install-modules.json` | `kind: agent` for each |

#### Stream C — Validator extensions

| ID | Task | File | Exit criteria |
|---|---|---|---|
| T-611 | test-agents.js full validation | `scripts/test-agents.js` | Per DESIGN-002 §2.3: 7 checks (frontmatter shape, name, ≤30-word description, tools tier, model id, context_mode, ≥1 `<example>`). Mutation tests: missing `model` fails red; tools-tier-mismatch fails red |
| T-612 | test-bash-strip.js implementer detection | `scripts/test-bash-strip.js` | Hard-coded `IMPLEMENTER_AGENTS = {"backend","frontend","test"}`. For each: parse frontmatter, assert `Bash` ∉ `tools`. Mutation test: temporarily add `Bash` to a T-C agent → fails red |

#### Stream D — CHANGELOG

| ID | Task | File | Exit criteria |
|---|---|---|---|
| T-613 | CHANGELOG entry | `CHANGELOG.md` | Documents 8 agents + plugin.json wiring + 2 validator extensions |

**PR #6 exit criteria:**
- `test-agents.js` reports **8 agents validated, 0 violations**
- `test-bash-strip.js` reports **3 implementer-tier agents checked, 0 violations**
- `plugin.json` `agents` array contains exactly 8 entries (matches DESIGN-002 §2.2 table)
- `test-removability` reports **23 modules / 15 toggles** (agents add to modules, NOT toggles per Option A)

**Pre-merge gate:** R6 (agent prompt prose quality) — skeleton conformance ≠ behavioral conformance. Mitigation per DESIGN-002 §9: include ≥2 `<example>` blocks per agent showing tier-discipline behavior in worked scenarios. Optionally: a sanity test that uses a fixture prompt to verify the agent's response declares its tier.

### 2.3 PR #7 — Command + Rule system (Medium, ~14 files)

#### Stream A — Command

| ID | Task | File | Exit criteria |
|---|---|---|---|
| T-701 | /orchestra dispatcher | `commands/orchestra.md` | Frontmatter passes new validate.js command check; body has 5 subcommand sections (smart router, sprint, release, commit, help) |

#### Stream B — Rules (P0 Java + TS)

| ID | Task | File | Exit criteria |
|---|---|---|---|
| T-702 | rules/common/coding-style.md (P1) | `rules/common/coding-style.md` | Frontmatter has `paths: ["**/*"]`; body ≤40 lines |
| T-703 | rules/java/coding-style.md | `rules/java/coding-style.md` | `paths: ["**/*.java"]`; ≤40 lines |
| T-704 | rules/java/patterns.md | `rules/java/patterns.md` | same |
| T-705 | rules/java/security.md | `rules/java/security.md` | same |
| T-706 | rules/java/testing.md | `rules/java/testing.md` | same |
| T-707 | rules/typescript/coding-style.md | `rules/typescript/coding-style.md` | `paths: ["**/*.ts","**/*.tsx"]`; ≤40 lines |
| T-708 | rules/typescript/patterns.md | `rules/typescript/patterns.md` | same |
| T-709 | rules/typescript/security.md | `rules/typescript/security.md` | same |
| T-710 | rules/typescript/testing.md | `rules/typescript/testing.md` | same |

#### Stream C — Rule stubs (P2)

| ID | Task | File | Exit criteria |
|---|---|---|---|
| T-711 | rules/go stub | `rules/go/coding-style.md` | Stub template per DESIGN-002 §5.4; ≤40 lines |
| T-712 | rules/python stub | `rules/python/coding-style.md` | same |
| T-713 | rules/kotlin stub | `rules/kotlin/coding-style.md` | same |

#### Stream D — Plugin wiring + validator extensions + CHANGELOG

| ID | Task | File | Exit criteria |
|---|---|---|---|
| T-714 | plugin.json `commands` array | `.claude-plugin/plugin.json` | Lists `commands/orchestra.md` |
| T-715 | install-modules.json += 13 entries (1 cmd + 12 rules) | `manifests/install-modules.json` | per DESIGN-002 §7.1 table |
| T-716 | validate.js rule + command check | `scripts/validate.js` | Walks `rules/**/*.md`: frontmatter has `paths:` array of glob strings; body ≤40 lines. Walks `commands/*.md`: frontmatter has `name`/`description`. Mutation tests: 41-line rule fails red; missing `paths:` fails red |
| T-717 | CHANGELOG entry | `CHANGELOG.md` | Documents command + 12 rules + validate.js extensions |

**PR #7 exit criteria:**
- `/orchestra help` parses (Claude Code shows usage on dry run)
- All 12 rule files pass `validate.js` (frontmatter + paths + line cap)
- `test-removability` reports **36 modules / 15 toggles** (final v1.0.0 count)
- `npm test` green across all 8 validators

**Pre-merge gate:** R8 (rule ≤40-line cap) — security topics may be tight. Mitigation per DESIGN-002 §9: aggressive split into multiple files per language (already 4 per language). If still tight, request PRD §8.8 amendment to allow rule references/ for depth.

---

## 3. Dependency graph + risk attachments <a id="S-DEPS-001"></a>

### 3.1 Cross-PR dependency chain

```
T-PA-01 (PRD §8.7 amendment) ──► PR #5 (skills)
                                      │
                                      ▼
                          ┌───────────┴───────────┐
                          ▼                       ▼
                   PR #6 (agents)          PR #7 (cmd + rules)
                                      │
                                      ▼
                          v1.0.0 release prep (out of scope)
```

**Hard serial cuts:**
1. T-PA-01 must merge before PR #5 begins (test-removability scope assumption).
2. PR #5 must merge before PR #6 begins (agent prompts reference skills by name).
3. PR #5 must merge before PR #7 begins (val-calibration calibration source ships in PR #5; command body may reference skill examples).

**Parallelizable after PR #5:** PR #6 ∥ PR #7. Different directories (`agents/` vs `commands/+rules/`); no shared validators extended in same PR. Two-contributor split saves ~1 day.

### 3.2 Within-PR streams

| PR | Streams | Order |
|---|---|---|
| PR #5 | A (8 SKILL.md) ∥ B (references/) → C (validators) → D (manifests + CHANGELOG) | A+B → C → D |
| PR #6 | A (8 agents) → B (plugin.json + manifests) ∥ C (validators) → D (CHANGELOG) | A → B+C → D |
| PR #7 | B (P0 rules) ∥ C (P2 stubs) ∥ A (command) → D (wiring + validators + CHANGELOG) | A+B+C → D |

### 3.3 Risk-to-PR attachment

| Risk | Attached to | Type | Action |
|---|---|---|---|
| **R6** Agent prompt prose quality | PR #6 review | Informational + advisory | ≥2 `<example>` blocks per agent showing tier-discipline behavior. Optional: behavioral fixture test |
| **R7** Skill ≤400-line cap | PR #5 implementation | **Possibly blocking** | Aggressive references/ split. If a skill genuinely won't fit, amend PRD §8.8 in the same PR with justification |
| **R8** Rule ≤40-line cap | PR #7 implementation | **Possibly blocking** | Aggressive multi-file split (already 4 per language). If still tight, amend PRD §8.8 to allow rule references/ |
| **R9** Calibration source quality | PR #5 review | Informational | Walk through ≥1 boundary case using calibration-examples.md as judgment lens |
| ~~R10~~ PRD §8.7 inconsistency | ~~Pre-flight~~ | **Resolved by T-PA-01** | done before PR #5 |
| **R11** test-bash-strip name-set hard-coded | v1.1+ refactor | Out of scope | Acceptable for v1.0.0 |

**No PR-blocking merge-gate**: R7 and R8 are "possibly blocking" only if a specific implementation overruns the cap; both have escape hatches (PRD amendment with justification). R6 and R9 are advisory.

---

## 4. CI matrix <a id="S-CI-001"></a>

**No new validators introduced** in PR #5..#7 — only extensions to existing ones. Auxiliary tests (`test-metrics`, `test-probe`) unchanged.

| Validator | Pre-flight | PR #5 | PR #6 | PR #7 | Final state |
|---|---|---|---|---|---|
| `validate.js` | (no change) | + skill frontmatter + ≤400-line cap (T-524) | (no change) | + rule + command frontmatter + ≤40-line cap (T-716) | Validates manifests + plugin.json + CHANGELOG↔VERSION + skill/rule/command frontmatter |
| `test-hooks.js` | (no change) | val-calibration assertion flips to active (T-525) | (no change) | (no change) | Full hook contract suite incl. active val-calibration |
| `test-agents.js` | (no change) | (no change) | full 7-check validation (T-611) | (no change) | Validates 8 agent frontmatters end-to-end |
| `test-bash-strip.js` | (no change) | (no change) | full implementer-name detection (T-612) | (no change) | Asserts no Bash on @backend/@frontend/@test |
| `validate-drift.js` | (no change) | (no change) | (no change) | (no change) | Final shape; pass-by-default on plugin repo |
| `test-removability.js` | scope-locks via T-PA-01 | + 8 skill modules + 8 toggles | + 8 agent modules (no toggles) | + 13 cmd/rule modules (no toggles) | **36 modules / 15 toggles** |
| `test-metrics.js` | (no change) | (no change) | (no change) | (no change) | Full from PR #3 |
| `test-probe.js` | (no change) | (no change) | (no change) | (no change) | Full from PR #4 |

**CI invariant maintained:** every PR ships green on the merge commit. Each validator extension lands with fixture tests in the same PR (mutation tests verifying the extension fails-red on bad input).

---

## 5. Sequencing notes <a id="S-SEQUENCE-001"></a>

### 5.1 Strict-serial cuts (cannot parallelize)

1. **T-PA-01 before PR #5** — test-removability scope must agree with PRD §8.7 before skill toggles land.
2. **PR #5 before PR #6 and PR #7** — both downstream PRs reference the skill set by name.

### 5.2 Parallelizable after PR #5

After PR #5 merges:
- **Contributor A** can take **PR #6** (`agents/` + `plugin.json.agents` + `test-agents.js` + `test-bash-strip.js`).
- **Contributor B** can take **PR #7** (`commands/orchestra.md` + `rules/**/*.md` + `plugin.json.commands` + `validate.js` rule check).

They share:
- `manifests/install-modules.json` — both PRs append entries; coordinate by appending at end of `modules` array; merge conflicts resolve trivially.
- `CHANGELOG.md` — same coordination pattern.
- `plugin.json` — PR #6 writes `agents`; PR #7 writes `commands`. Different keys; no conflict.
- `scripts/validate.js` — PR #7 only. PR #6 doesn't touch validate.js (test-agents.js is its validator).

**No shared script files between PR #6 and PR #7** — clean fork.

### 5.3 Parallelizable for solo contributor

Within a single PR, the streams in §3.2 can run as separate commits on the same branch. Recommended for PR #5 (most parallelism — A and B streams independent).

### 5.4 Estimated effort

| PR | Estimate | Critical path |
|---|---|---|
| Pre-flight | 30 min | Sequential edit to PRD §8.7 |
| PR #5 | 2.5 days | Calibration-examples.md (load-bearing); skill prose iteration on ≤400-line cap |
| PR #6 | 2 days | Agent prose iteration; ≥2 `<example>` blocks per agent (24 examples total) |
| PR #7 | 1.5 days | Java/TS rule content iteration on ≤40-line cap (8 files) |

**Total leaf-component v1.0.0:** ~6.0 contributor-days serial, ~5.0 days with PR #6 ∥ PR #7 split.

**Combined v1.0.0 effort (PR #1–#7):** 5.5 (infra) + 6.0 (leaves) = **~11.5 contributor-days serial / ~9.5 with both splits**.

### 5.5 Out of scope for this workflow

- **Source code or prose** — every task in §2 specifies *what* file to write and *how it must validate*; the actual *content* lands in `/sc:sc-implement`.
- **Release-time polish** — `RELEASE-v1.0.0.md`, distribution scripts, README expansion, install verification on clean machines. Separate workflow doc covers these.
- **v1.1+ items** — specialist agents (`@architect`, `@ux`, `@security`, `@debugger`, `@pm`), 9 deferred skills, full Go/Python/Kotlin rule content, `/save`, `/load`, `/orchestra-disagree`, `/orchestra legacy`.

---

## 6. Hand-off to `/sc:sc-implement` <a id="S-HANDOFF-001"></a>

`/sc:sc-implement` consumes this workflow one PR at a time. For each PR:

1. Read this document's PR section (§2.x) for the file/script list and task IDs.
2. Read `docs/DESIGN-002-leaves.md` §2–§7 for the contracts those files implement.
3. Read `docs/PRD-001.md` §8.5–§8.13, §9.1–§9.8, §10 for the invariants and frontmatter contracts.
4. Implement tasks in stream order; stop at the PR exit-criteria check.
5. Run `npm test` (must stay green); resolve any attached merge-gate (R6/R7/R8/R9).
6. Open PR; merge.
7. Repeat for next PR.

**Recommended first invocation:**

```
/sc:sc-implement Pre-flight — apply T-PA-01 (PRD §8.7 amendment per WORKFLOW-002-leaves §1.1)
```

Then PR #5 with `/sc:sc-implement PR #5`, etc.

---

**End of WORKFLOW-002-leaves.** Implementation begins at `/sc:sc-implement Pre-flight`.
