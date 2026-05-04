---
id: DESIGN-002-leaves
title: orchestra v1.0.0 — Leaf Components Architecture Design
created: 2026-04-29
status: draft
revision: 1
scope: leaf components only (8 agents + 8 skills + 1 command + rule system); harness already complete (PR #1–#4)
references:
  prd:
    - id: PRD-001
      sections: [S-INVARIANTS-001, S-FRS-001, S-FRONTMATTER-001, S-EXAMPLE-001]
  design:
    - id: DESIGN-001-infra
      sections: [S-DEPGRAPH-001, S-HOOKS-001, S-MCPS-001, S-PRPLAN-001]
---

# orchestra v1.0.0 — Leaf Components Architecture Design

> Output of the second `/sc:sc-design` pass. Specifies the contracts, frontmatter shapes, skeleton structures, and integration points for the leaf components that plug into the PR #1–#4 harness. **No prompt prose, no skill bodies, no rule content** — those land in `/sc:sc-implement`. This doc is the input to `/sc:sc-workflow` for PR #5..#7 sequencing.

---

## 0. Scope and frame <a id="S-SCOPE-001"></a>

| In scope | Out of scope |
|---|---|
| 8 agent contracts + 3 tier-discipline templates | v1.1+ specialist agents (`@architect`, `@ux`, `@security`, `@debugger`, `@pm`) |
| 8 skill contracts + references/ pattern | v1.1+ deferred skills (`c4-architecture`, `reducing-entropy`, `post-deploy-analytics`, etc.) |
| `/orchestra` command dispatcher + 4 subcommands | `/save`, `/load`, `/orchestra-disagree`, `/orchestra legacy` |
| Java + TypeScript rule sets at P0 | Go/Python/Kotlin full rule content (only stub template) |
| `evaluator-tuning` calibration source spec | Implementation prose (lands in `/sc:sc-implement`) |
| Manifest extensions for ~29 new entries | Release-time singletons (`RELEASE-vX.Y.Z.md`, `RUNBOOK-vX.Y.Z.md`) |
| PR #5..#7 sequencing | Distribution polish (install scripts, CI badges, etc.) |

### Locked from prior phases

- **D-01..D-44** (PRD §3) — all 44 source decisions
- **Tier discipline** (PRD §8.5): strict-read-only / impl-restricted / implementer-no-Bash
- **Frontmatter contracts** (PRD §10): agent, skill, rule, command shapes
- **Three-file registration** (PRD §8.6): plugin.json + install-modules.json + runtime-toggles.json (where applicable)
- **Routing taxonomy** (PRD §9.5): docs / template / hotfix / feature / review / refactor intent → agent sequence
- **Spec-phase dialogue patterns** (PRD §9.4): A linear / B one-revision / C wave team
- **Conflict resolution** (PRD §9.6): @evaluator wins on velocity-vs-verdict; @ship wins on release-vs-stability; 3-strike circuit breaker
- **Confidence-based UX** (PRD §8.11): HIGH/MEDIUM/LOW classification → 0/1/2-3 questions, ≤3 total

---

## 1. Component dependency graph <a id="S-DEPGRAPH-001"></a>

```
                          ┌──────────────────────────────┐
                          │ PR #1–#4 harness (complete)  │
                          │  - 5 hooks                   │
                          │  - 2 MCPs                    │
                          │  - 4 manifests               │
                          │  - 1 drift validator         │
                          │  - 8 validators (CI green)   │
                          └────────────┬─────────────────┘
                                       │ leaves plug into
                                       ▼
       ┌───────────────────────────────────────────────────────────┐
       │ commands/orchestra.md                                     │  PR #7
       │  ├─ TeamCreate → instantiates 8-agent team                │
       │  └─ subcommand routing (sprint/release/commit/help)       │
       └────────────┬───────────────────────────────────────┬──────┘
                    │ spawns                                │ writes
                    ▼                                       │
       ┌──────────────────────────────────┐                 │
       │ agents/*.md  (8 agents)          │  PR #6          │
       │  - tier-correct tools array      │                 │
       │  - hard boundaries in prompt     │                 │
       │  - frontmatter validated by      │                 │
       │    test-agents.js + bash-strip   │                 │
       └────────────┬─────────────────────┘                 │
                    │ invokes via Skill                     │
                    ▼                                       │
       ┌──────────────────────────────────┐                 │
       │ skills/<name>/SKILL.md (8)       │  PR #5 (FIRST)  │
       │  - ≤400 lines per validate.js    │                 │
       │  - references/ for depth         │                 │
       │  - evaluator-tuning unblocks     │                 │
       │    val-calibration hook          │                 │
       └────────────┬─────────────────────┘                 │
                    │ rules path-activate                   │
                    ▼                                       │
       ┌──────────────────────────────────┐                 │
       │ rules/<lang>/*.md  (12 files)    │  PR #7          │
       │  - paths: glob in frontmatter    │                 │
       │  - ≤40 lines per validate.js     │                 │
       │  - Java + TS at P0               │                 │
       │  - Go/Python/Kotlin stubs        │                 │
       └──────────────────────────────────┘                 │
                                                            ▼
       ┌────────────────────────────────────────────────────────┐
       │ pipeline artifacts (PRD §9.3) — written by agents,     │
       │ stamped by hash-stamper (PR #2), drift-checked by      │
       │ validate-drift.js (PR #2)                              │
       └────────────────────────────────────────────────────────┘
```

**Critical ordering insight:** PR #5 (skills) **must** precede PR #6 (agents) because:
- val-calibration (PR #3) needs `skills/evaluator-tuning/references/calibration-examples.md` to do anything useful
- Agents reference skills by name in their `Skills` section; if a skill doesn't exist, the agent's prompt has dangling references
- test-agents.js validation in PR #6 would happen against a skill set that's already locked

---

## 2. Per-agent contracts <a id="S-AGENTS-001"></a>

### 2.1 Three tier-discipline templates

Each agent's prompt body follows one of three skeletons based on its tier. The skeletons differ in tool boundaries, allowed write surface, and refusal patterns.

#### Template T-A: Strict read-only (+Bash for tests/probes, +Write for verdict-only)

Used by `@evaluator` and `@reviewer`. The "strict" label signals **never modifies source**; the agent CAN write its single verdict/review artifact.

```yaml
---
name: <role>
description: <30-word description>. Read-only tier — never modifies source code; writes only the verdict/review artifact.
tools: ["Read", "Grep", "Glob", "Bash", "Write"]
model: claude-opus-4-7
context_mode: 1m
color: <color>
---
```

Body skeleton:

```markdown
You are <role>. <One-sentence purpose>.

## Tier discipline

Strict read-only. You may:
- READ any file, GREP any pattern, GLOB any path
- BASH for tests, static analysis, runtime probes — never to modify source
- WRITE exactly one artifact: <ARTIFACT-PATH>

You may NOT:
- Edit or MultiEdit any file
- Bash commands that modify source files (npm install, sed -i, > redirect, tee)
- Patch failing tests, tune mocks, or "fix" issues you find — your job is to report

## Hard boundaries

- <forbidden 1: e.g. "Cannot patch failing tests by design">
- <forbidden 2: e.g. "Cannot Write/Edit anything except verdict artifacts">
- <forbidden 3: e.g. "≥80% confidence threshold; below that you say 'unclear', not 'fail'">

## Inputs / Outputs / Skills / Workflow / Examples
[as below]
```

#### Template T-B: Implementation-restricted (Write artifacts only)

Used by `@product`, `@lead`, `@ship`. Writes **artifacts** (PRD/FRS/SAD/TDD/CONTRACT/RELEASE/etc.) but never source code.

```yaml
---
name: <role>
description: <30-word description>. Implementation-restricted — writes artifacts, never source code or tests.
tools: ["Read", "Grep", "Glob", "Write"]
model: claude-opus-4-7
context_mode: 1m
color: <color>
---
```

Body skeleton:

```markdown
You are <role>. <One-sentence purpose>.

## Tier discipline

Implementation-restricted. You may:
- READ/GREP/GLOB to gather context
- WRITE artifacts under `<project>/.claude/.orchestra/` (per-feature folder OR singleton path)

You may NOT:
- Edit or MultiEdit anything
- Bash anything (no test runs, no scans — those are evaluator's domain)
- Write source code or tests (those belong to implementer-tier agents)

## Hard boundaries
[as appropriate to role]
```

#### Template T-C: Implementer (no Bash)

Used by `@backend`, `@frontend`, `@test`. Writes source code/tests but **cannot run anything** — every verdict-bearing run goes through `@evaluator`.

```yaml
---
name: <role>
description: <30-word description>. Implementer — writes code/tests; cannot run them (Bash is stripped by design).
tools: ["Read", "Grep", "Glob", "Write", "Edit", "MultiEdit"]
model: claude-opus-4-7
context_mode: 1m
color: <color>
---
```

Body skeleton:

```markdown
You are <role>. <One-sentence purpose>.

## Tier discipline

Implementer (no Bash). You may:
- READ/GREP/GLOB to gather context
- WRITE/EDIT/MULTIEDIT source files within your scope

You may NOT:
- Bash anything — verdict-bearing runs go through @evaluator
- See a green test run and interpret it as success — only @evaluator's verdict counts
- Touch <other-side> files (prompt-only behavioral expectation in v1.0.0; mechanical scoping deferred)

## Hard boundaries
[as appropriate to role]
```

`test-bash-strip.js` enforces tier-C structurally: any agent whose `name` is in `{backend, frontend, test}` MUST NOT have `Bash` in its `tools` array.

### 2.2 The 8 agents — frontmatter and role declarations

All agents use `model: claude-opus-4-7` and `context_mode: 1m` per Q3=A. Description is one sentence ≤30 words; the body declares the role per the tier template above.

| Agent | Tier | Tools | Hard boundaries (prompt-enforced) |
|---|---|---|---|
| `@product` | T-B | Read, Grep, Glob, Write | No system design; no code; no unilateral greenfield/brownfield classification |
| `@lead` | T-B | Read, Grep, Glob, Write | No PRD/FRS authoring (product-side); no code |
| `@backend` | T-C | + Edit, MultiEdit | No FE files (prompt-only); no test runs (mechanical via Bash strip); escalates new-infra needs via ESCALATE-ARCH-*.md |
| `@frontend` | T-C | + Edit, MultiEdit | No BE files (prompt-only); no test runs; no shipping without all 4 states (loading/empty/error/success) |
| `@test` | T-C | + Edit, MultiEdit | No verdict-bearing test runs (`@evaluator` owns); no mocking domain logic |
| `@evaluator` | T-A | + Bash, Write (verdict-only) | Cannot patch failing tests by design; Write only on TEST-*.md verdict block + CRITERIA-*.md grade |
| `@reviewer` | T-A | + Bash (static analysis), Write (CODE-REVIEW-*.md only) | Will not fix issues; ≥80% confidence threshold; 4th REQUEST_CHANGES → circuit breaker |
| `@ship` | T-B | Read, Grep, Glob, Write | No code, no review; will not cut release with open DEADLOCK or failed gates |

### 2.3 Frontmatter validation in `test-agents.js`

PR #6 extends `test-agents.js` to enforce:

1. **Frontmatter shape** — all 6 required keys present (`name`, `description`, `tools`, `model`, `context_mode`, `color`)
2. **Name match** — `name` ∈ `{product, lead, backend, frontend, test, evaluator, reviewer, ship}`
3. **Description length** — ≤30 words (stricter than the 200-char skill rule)
4. **Tools tier** — tools array matches one of the three templates above (a small union check)
5. **Model id** — `model` ∈ `manifests/known-models.json[].id`
6. **Context mode** — `context_mode` ∈ that model's `supportsContextMode` set
7. **`<example>` blocks** — body contains ≥1 `<example>...</example>` block

`test-bash-strip.js` extension:
- Hard-coded set: `IMPLEMENTER_AGENTS = {"backend", "frontend", "test"}`
- For each agent file: parse frontmatter, check `name`. If in set, assert `Bash` ∉ `tools`.
- Exits 2 with named violation on any breach.

### 2.4 `<example>` block convention

Per PRD §10.1: "Include `<example>` blocks after frontmatter."

Format:

```html
<example>
Context: <one-sentence scenario describing user/team state>
User invokes: <prompt or trigger>
Action: <how this agent responds, with the specific tool calls or artifact writes>
</example>
```

Each agent ships with **2–3** `<example>` blocks covering:
- One canonical happy-path scenario for the role
- One boundary case (e.g., escalation, refusal, deadlock)
- (Optional) One brownfield/inferred-section interaction

---

## 3. Per-skill contracts <a id="S-SKILLS-001"></a>

### 3.1 SKILL.md skeleton

Per PRD §10.2 frontmatter + §8.8 ≤400-line cap.

```yaml
---
name: skill-name                # MUST match parent folder
description: <≤200 chars with 3+ trigger keywords. Used by Skill tool to match user intent.>
origin: orchestra
---
```

Body skeleton:

```markdown
# <Skill Title>

<One-paragraph purpose. What this skill *does*, not what it *is*.>

## When to use

<3–5 trigger conditions, written as situations not commands>

## Approach

<Methodology, ordered steps, decision tree, or checklist. The bulk of the body lives here.>

## References

For depth, see:
- `references/<topic>.md` — <one-line summary>
- `references/<topic>.md` — <one-line summary>

## Worked example

<1 worked example showing the skill applied to a concrete situation>
```

### 3.2 references/ pattern

Per PRD §8.8: "Depth lives in `references/` and is loaded on-demand."

Structure:
```
skills/
└── <name>/
    ├── SKILL.md                    # ≤400 lines
    └── references/
        ├── <topic-1>.md            # full prose; loaded when SKILL.md cites it
        ├── <topic-2>.md
        └── <topic-3>.md
```

Loading mechanic: SKILL.md mentions a reference file; the agent reading SKILL.md can choose to follow the citation by Reading the references file. No automatic preload — saves tokens.

### 3.3 The 8 skills — frontmatter + body shape

| Skill | Priority | Description trigger keywords | references/ files (planned) | Consumed by |
|---|---|---|---|---|
| `task-breakdown` | P0 | "decompose, story points, task graph, dependency, estimation" | `sp-matrix.md`, `decomposition-patterns.md` | `@lead` |
| `project-discovery` | P0 | "discovery, language detection, framework, project mode, brownfield" | `language-signatures.md`, `framework-signatures.md` | `@product`, `@lead` |
| `code-review` | P0 | "review, code quality, idioms, performance, security checklist" | `severity-rubric.md`, `language-checklists.md` | `@reviewer` |
| `qa-test-planner` | P0 | "test plan, coverage strategy, adversarial fuzz, edge cases" | `coverage-strategies.md`, `fuzz-input-patterns.md` | `@test` |
| `commit-work` | P0 | "conventional commits, scope, message, git diff" | `commit-types.md`, `scoping-guide.md` | `@ship`, `/orchestra commit` |
| `write-contract` | P0 | "CONTRACT, weighted criteria, probe DSL, PASS/FAIL calibration" | `probe-dsl.md`, `criteria-examples.md` | `@lead` |
| `evaluator-tuning` | P0 | "evaluator, calibration, verdict, criteria grading, divergence" | `calibration-examples.md` (load-bearing — see §6) | `@evaluator` (via val-calibration hook) |
| `java-source-intel` | P1 | "Java, ripgrep, callers, impact, @Transactional, Spring" | `ripgrep-patterns.md`, `transactional-scans.md` | `@backend` (Java work) |

### 3.4 Description-field trigger phrasing

Per PRD §10.2: "Under 200 chars with trigger keywords."

The Skill tool uses this description to decide *whether to invoke* a skill. Keywords matter. Pattern:

```
description: "<verb-phrase: what it does>. <Trigger condition>. <3+ keywords>."
```

Example (for task-breakdown):

```
description: "Decompose user intent into a task graph with SP estimates and agent assignments. Use when @lead routes a feature/refactor/template intent. Keywords: decompose, story points, task graph, dependency."
```

Constraint: ≤200 chars. Validate.js will gate this (PR #5 extension).

### 3.5 Skill-to-agent dependency map

The agent's Skills section in its prompt body lists which skills it may invoke. v1.0.0 mapping:

```
@product   → project-discovery
@lead      → task-breakdown, project-discovery, write-contract
@backend   → java-source-intel (P1; Java projects only)
@frontend  → (none in v1.0.0; FE-specific skill deferred)
@test      → qa-test-planner
@evaluator → (calibration auto-injected via val-calibration hook; no explicit Skill use)
@reviewer  → code-review
@ship      → commit-work
```

`@evaluator`'s skill (`evaluator-tuning`) is consumed indirectly: the val-calibration hook reads `references/calibration-examples.md` and injects it into every Task spawn for `@evaluator`. The agent doesn't invoke the skill via the Skill tool — the hook does the work.

---

## 4. Command dispatcher <a id="S-COMMAND-001"></a>

### 4.1 `commands/orchestra.md` shape

Per PRD §10.4 + §9.1.

```yaml
---
name: orchestra
description: Multi-agent SDLC pipeline behind one entry point. Routes natural language to TeamCreate → @product + @lead classification, or dispatches sprint/release/commit/metrics/help subcommands.
argument-hint: <subcommand|natural language>
---
```

Body structure (5 subcommands + smart router + autonomy parsing):

```markdown
# /orchestra dispatcher

## Parse flags (before subcommand routing)

Strip `--autonomy=<tag>` and `--confidence=<tier>` from `$ARGUMENTS` first
(per PRD §8.14, §8.11). Apply autonomy resolution precedence:
  CLI flag > local.yaml.autonomy.level > DRAFT_AND_GATE
The resolved level is passed to every TeamCreate call and stamped on
the run-summary `runs/<run-id>.json` (§9.9).

## Parse arguments

Look at the first whitespace-separated token of `$ARGUMENTS`:

- `sprint`  → run `## /orchestra sprint` flow (with optional `--size N`)
- `release` → run `## /orchestra release` flow
- `commit`  → run `## /orchestra commit` flow (no team; uses commit-work skill directly)
- `metrics` → run `## /orchestra metrics` flow (no team; reads runs/*.json)
- `help`    → print usage block (defined below)
- otherwise → run `## /orchestra <natural language>` smart router

## /orchestra <natural language> (smart router)

[detailed flow per PRD §8.11 confidence classification + §9.5 routing taxonomy
 + §8.14 autonomy pause transitions — see §11 of this design for the full
 4-pause integration]

## /orchestra sprint [--size N]

[pull N issues from .claude/.orchestra/backlog/issues/, run as multi-task /orchestra;
 autonomy level applies to each issue's run]

## /orchestra release

[verify gates cleared → write RELEASE-vX.Y.Z.md + RUNBOOK if topology changed
 + update CHANGELOG + draft ANNOUNCEMENT-*.md]

## /orchestra commit

[Conventional Commits message from `git diff --staged`, no team]

## /orchestra metrics [--limit N]

[Console summary of recent /orchestra runs. No team, no model call. Reads
 .claude/.orchestra/metrics/runs/*.json, sorts by started_at desc, prints
 last N (default 10) as a table with columns: feature_id, intent,
 confidence, pattern, gates verdict, total tokens, duration. Footer shows
 cumulative pass-rate and median tokens/run across ALL runs (not just the
 displayed window). Backed by scripts/metrics-summary.py.]

## /orchestra help

[print usage including all 5 subcommands and --autonomy/--confidence flags]
```

### 4.2 Smart-router flow

```
0. Resolved autonomy level = --autonomy CLI flag (per-run)
                           ∨ local.yaml.autonomy.level (per-project)
                           ∨ DRAFT_AND_GATE (default)
1. metrics-collector logs prompt.submitted with matched_orchestra: true
   (prompt_summary redacted unless manifest.redact_prompts=false)
2. (script) bootstrap-local.js runs project-discovery deterministically →
   returns { has_source, primary_language, framework, scope_hints }
3. If local.yaml absent: greenfield/brownfield bootstrap (§9.11) — script-first
   for clear cases, @product + @lead negotiate Pattern B for ambiguous cases
4. @lead classifies intent per §9.5 routing taxonomy and runs autonomy
   diagnostic (§11) → confirms or suggests an autonomy override
5. metrics-collector emits intent-decision event (intent, confidence,
   pattern, autonomy_level)
6. PAUSE-1 (DRAFT_AND_GATE only): AskUserQuestion confirms classification —
   "intent=feature, confidence=MEDIUM, pattern=B, autonomy=DRAFT_AND_GATE.
    Proceed?" User can override classifier without re-prompting.
7. Pattern A (HIGH) / B (MEDIUM, 1-revision) / C (LOW, wave team) per §9.4
8. TeamCreate instantiates the 8-agent team (autonomy_level passed in)
9. Agents work in waves per their role; artifacts written to
   <project>/.claude/.orchestra/pipeline/<id>/
10. PAUSE-2 (DRAFT_AND_GATE only, after PRD+FRS): AskUserQuestion confirms
    spec is what user wants
11. Each artifact write triggers hash-stamper → frontmatter section hashes
    stamped; metrics-collector emits skill.invoked when agents load skills
12. PAUSE-3 (DRAFT_AND_GATE only, after CONTRACT signed): AskUserQuestion
    confirms gate is right gate before implementation kickoff
13. Builders → @test → @evaluator (verdict) → @reviewer
14. PAUSE-4 (DRAFT_AND_GATE only, after CODE-REVIEW verdict): AskUserQuestion
    confirms review acceptable, gates cleared
15. @ship writes DOC + CHANGELOG + RELEASE; pre-release validate-drift.js runs
16. At Stop: metrics-collector aggregates the parent run into
    runs/<run-id>.json (feature_id, intent, confidence, pattern,
    autonomy_level, gates verdict, agents_spawned, total tokens, duration,
    insights_count) and extracts ★ Insight blocks from the session jsonl
    into insights.jsonl (body redacted unless capture_insight_text=true)
```

`PAUSE-1..PAUSE-4` only fire at `DRAFT_AND_GATE`. At `FULL_AUTONOMY` they become async draft-and-resume artifacts (v1.2+); at `JOINT_PROCESSING` they collapse into per-stage Pattern B; at `OPTION_SYNTHESIS` the run stops at PAUSE-1 with an option set; at `EXECUTION_ONLY` confidence classification is skipped and the user's prompt drives the agent sequence directly.

### 4.3 AskUserQuestion usage

Per PRD §8.11: confidence tier → number of questions.

| Confidence | Questions | When to ask |
|---|---|---|
| HIGH | 0 | Trivial intent, ≤15 words, files_touched <5 |
| MEDIUM | 1 | Intent ambiguous OR brownfield with 1+ inferred sections on path |
| LOW | 2–3 | Novel intent OR brownfield with multiple inferred sections OR >20 files touched |
| Any | Hard cap 3 | Never more than 3 questions per request (§8.11) |

Circuit breaker: 3 rejection rounds in any review stage → write `DEADLOCK-<id>.md`, escalate.

---

## 5. Rule system <a id="S-RULES-001"></a>

### 5.1 Rule frontmatter contract

Per PRD §10.3:

```yaml
---
paths:
  - "**/*.<ext>"
  - "<other-glob>"
---
```

Multiple globs per rule allowed. Path activation: a rule applies to a Read/Edit/Write operation iff the file path matches any glob in `paths`.

Body ≤40 lines per PRD §8.8. validate.js (PR #5 extension) enforces both shape and length.

### 5.2 Rule body structure

```markdown
# <Language> <Topic>

## Rules

- <imperative rule statement>
- <imperative rule statement>
- <imperative rule statement>

## Examples

```<lang>
// Good
<short positive example>

// Bad
<short negative example>
```

## Anti-patterns

- <pattern to avoid> — why
- <pattern to avoid> — why
```

40-line cap forces narrow focus: one topic per file (coding-style, patterns, security, testing).

### 5.3 The 12 rule files (v1.0.0)

| Path | Priority | paths: glob | Shape |
|---|---|---|---|
| `rules/common/coding-style.md` | P1 | `**/*` | full body |
| `rules/java/coding-style.md` | P0 | `**/*.java` | full body |
| `rules/java/patterns.md` | P0 | `**/*.java` | full body |
| `rules/java/security.md` | P0 | `**/*.java` | full body |
| `rules/java/testing.md` | P0 | `**/*.java` | full body |
| `rules/typescript/coding-style.md` | P0 | `**/*.ts`, `**/*.tsx` | full body |
| `rules/typescript/patterns.md` | P0 | `**/*.ts`, `**/*.tsx` | full body |
| `rules/typescript/security.md` | P0 | `**/*.ts`, `**/*.tsx` | full body |
| `rules/typescript/testing.md` | P0 | `**/*.ts`, `**/*.tsx` | full body |
| `rules/go/coding-style.md` | P2 | `**/*.go` | **stub** |
| `rules/python/coding-style.md` | P2 | `**/*.py` | **stub** |
| `rules/kotlin/coding-style.md` | P2 | `**/*.kt`, `**/*.kts` | **stub** |

### 5.4 Stub template for deferred languages

Each P2 stub uses this exact body (~10 lines, well under cap):

```markdown
---
paths:
  - "**/*.<ext>"
---
# <Language> coding-style

> v1.0.0 ships a stub. Full ruleset in v1.1+.

This file is a placeholder so:
- `paths:` activation works (validate.js sees the frontmatter)
- The plugin's language coverage is documented
- Contributors know where to add <Language>-specific rules

For now: follow the standard `<official-formatter>` and `<official-linter>` conventions.
See <https://example.org/<lang>-style-guide> for canonical guidance.
```

The stub:
- Validates against the rule frontmatter contract
- Activates on the right paths (so the validator can verify path-glob behavior)
- Documents intent without making claims about rule content
- Is small enough to be obviously a stub (no copy/paste from a real ruleset)

---

## 6. val-calibration source spec <a id="S-CALIBRATION-001"></a>

### 6.1 File path and load mechanic

`skills/evaluator-tuning/references/calibration-examples.md`. Loaded by `hooks/scripts/val-calibration.js` (PR #3) on every Task spawn where `subagent_type === "evaluator"`. Wrapped as `<calibration-anchor>...</calibration-anchor>` and prepended to the agent's prompt.

If the file is missing, val-calibration is a graceful no-op (PRD §9.9 invariant 4) — which is what's happening today between PR #3 (hook lands) and PR #5 (calibration source lands).

### 6.2 Schema

```markdown
# @evaluator calibration examples

## Verdict semantics

A criterion's verdict is one of: PASS / FAIL / pending.
- PASS — every probe passes; no critical-failure conditions; all adversarial fuzz inputs handled correctly.
- FAIL — any probe fails; OR any critical-failure condition triggered; OR adversarial input regression.
- pending — probes haven't been run yet (initial state).

## PASS criteria (all must hold)

- <bulleted list of conditions for PASS>

## FAIL criteria (any triggers FAIL)

- <bulleted list of conditions>

## Boundary cases

### Case <id>: <short title>
**Scenario:** <description>
**Verdict:** <PASS|FAIL|pending>
**Why:** <one-paragraph rationale>

[5–10 boundary cases covering: empty body with 200 status, near-timeout edges,
partial-pass weighted scoring, unspecified threshold cases, redirect chains,
DB row uniqueness ambiguity, etc.]
```

### 6.3 Boundary case scope (v1.0.0)

The 5–10 cases must cover at least:

1. **Probe returns 200, body empty** — what counts as success?
2. **Probe times out at 4.95s with 5s cap** — boundary on timeout
3. **3 of 4 weighted criteria pass (75/100)** — threshold judgment
4. **Adversarial fuzz: replay attack passes** — security regression check
5. **Redirect chain: 302 → 200 within follow_redirects=false** — what's the verdict?
6. **DB row exists but `secret` field redacted in response** — false-negative possibility
7. **Critical-failure condition flagged but probes all pass** — which wins?
8. **`inferred:` upstream section drift detected mid-test** — block or warn?

Each case ships with explicit verdict + rationale so `@evaluator`'s judgment is calibrated against worked examples.

---

## 7. Manifest extensions <a id="S-MANIFESTS-001"></a>

### 7.1 install-modules.json — new entries

| name | kind | path | defaultEnabled | stability |
|---|---|---|---|---|
| `agent.product` | agent | `agents/product.md` | true | stable |
| `agent.lead` | agent | `agents/lead.md` | true | stable |
| `agent.backend` | agent | `agents/backend.md` | true | stable |
| `agent.frontend` | agent | `agents/frontend.md` | true | stable |
| `agent.test` | agent | `agents/test.md` | true | stable |
| `agent.evaluator` | agent | `agents/evaluator.md` | true | stable |
| `agent.reviewer` | agent | `agents/reviewer.md` | true | stable |
| `agent.ship` | agent | `agents/ship.md` | true | stable |
| `skill.task-breakdown` | skill | `skills/task-breakdown/SKILL.md` | true | stable |
| `skill.project-discovery` | skill | `skills/project-discovery/SKILL.md` | true | stable |
| `skill.code-review` | skill | `skills/code-review/SKILL.md` | true | stable |
| `skill.qa-test-planner` | skill | `skills/qa-test-planner/SKILL.md` | true | stable |
| `skill.commit-work` | skill | `skills/commit-work/SKILL.md` | true | stable |
| `skill.write-contract` | skill | `skills/write-contract/SKILL.md` | true | stable |
| `skill.evaluator-tuning` | skill | `skills/evaluator-tuning/SKILL.md` | true | stable |
| `skill.java-source-intel` | skill | `skills/java-source-intel/SKILL.md` | true | stable |
| `command.orchestra` | command | `commands/orchestra.md` | true | stable |
| `rule.common.coding-style` | rule | `rules/common/coding-style.md` | true | stable |
| `rule.java.coding-style` | rule | `rules/java/coding-style.md` | true | stable |
| `rule.java.patterns` | rule | `rules/java/patterns.md` | true | stable |
| `rule.java.security` | rule | `rules/java/security.md` | true | stable |
| `rule.java.testing` | rule | `rules/java/testing.md` | true | stable |
| `rule.typescript.coding-style` | rule | `rules/typescript/coding-style.md` | true | stable |
| `rule.typescript.patterns` | rule | `rules/typescript/patterns.md` | true | stable |
| `rule.typescript.security` | rule | `rules/typescript/security.md` | true | stable |
| `rule.typescript.testing` | rule | `rules/typescript/testing.md` | true | stable |
| `rule.go.coding-style` | rule | `rules/go/coding-style.md` | true | stable |
| `rule.python.coding-style` | rule | `rules/python/coding-style.md` | true | stable |
| `rule.kotlin.coding-style` | rule | `rules/kotlin/coding-style.md` | true | stable |

**29 new entries.** Total install-modules count after PR #5..#7: 7 (existing) + 29 = **36**.

### 7.2 runtime-toggles.json — new entries (skills only)

Per the design call in §0 Insight: only **skills** get env-var toggles in v1.0.0 to keep the toggle surface manageable. Agents toggle via `plugin.json` removal; rules toggle via `paths:` glob editing; commands toggle via `plugin.json` removal.

| module | envVar | default | description |
|---|---|---|---|
| `skill.task-breakdown` | `ORCHESTRA_SKILL_TASK_BREAKDOWN` | on | Decomposition + SP estimation. |
| `skill.project-discovery` | `ORCHESTRA_SKILL_PROJECT_DISCOVERY` | on | Pre-`/orchestra` discovery (tree, language, framework). |
| `skill.code-review` | `ORCHESTRA_SKILL_CODE_REVIEW` | on | Multi-domain review checklist used by `@reviewer`. |
| `skill.qa-test-planner` | `ORCHESTRA_SKILL_QA_TEST_PLANNER` | on | Test plan + coverage + adversarial fuzz inputs. |
| `skill.commit-work` | `ORCHESTRA_SKILL_COMMIT_WORK` | on | Conventional Commits formatting. |
| `skill.write-contract` | `ORCHESTRA_SKILL_WRITE_CONTRACT` | on | CONTRACT schema + Probe DSL. |
| `skill.evaluator-tuning` | `ORCHESTRA_SKILL_EVALUATOR_TUNING` | on | Calibration examples for `@evaluator` (consumed by val-calibration hook). |
| `skill.java-source-intel` | `ORCHESTRA_SKILL_JAVA_SOURCE_INTEL` | on | Java ripgrep + impact patterns. |

**8 new toggle entries.** Total runtime-toggles count after PR #5..#7: 7 (existing) + 8 = **15**. test-removability validates that skill entries in install-modules (8) match toggle entries (8) 1:1.

### 7.3 PRD §8.7 amendment recommendation

Current PRD §8.7 says all four kinds (agent/skill/rule/command) have env-var toggles. Recommend amending to:

> **Skill** → remove from `manifests/install-modules.json`, OR set `ORCHESTRA_SKILL_<NAME>=off`.
> **Hook / MCP** → as before.
> **Agent** → remove from `plugin.json.agents`, OR omit from `local.yaml.agents` (per-project disable).
> **Rule** → edit `paths:` glob to exclude target files.
> **Command** → remove from `plugin.json.commands`.

This collapses the env-var toggle surface to 5 hooks + 8 skills + 2 MCPs = 15 toggle entries (instead of 44 if all four kinds had env vars). Rationale: agents/rules/commands have natural toggle mechanisms that don't need a parallel env-var registry.

---

## 8. PR sequencing recommendation <a id="S-PRPLAN-001"></a>

Three PRs, each green-CI on merge, dependency-ordered.

### PR #5 — Skills (8 SKILL.md files + references/ + calibration source)

**Why first:** unblocks `val-calibration` hook (PR #3). Skills are also consumed by agent prompts in PR #6 — having the skill set locked first means PR #6's agent bodies reference real files.

**Adds:**
- `skills/<name>/SKILL.md` × 8 (≤400 lines each)
- `skills/<name>/references/*.md` — depth files per §3.5 (planned ~16–20 files total)
- **`skills/evaluator-tuning/references/calibration-examples.md`** (load-bearing — see §6)
- 8 `install-modules.json` entries (kind=skill)
- 8 `runtime-toggles.json` entries
- `scripts/validate.js` extension: skill frontmatter shape, ≤400-line cap, `name`-matches-folder check
- `scripts/test-hooks.js` extension: assert val-calibration injects `<calibration-anchor>` block when calibration-examples.md is present

**Exit criteria:**
- All 8 skills pass `validate.js` (frontmatter + line cap + name match)
- val-calibration test now asserts `updatedInput` IS present (was passthrough in PR #3)
- `test-removability` reports `15 modules / 15 toggles` (7 from infra + 8 skills)

**Estimated scope:** Medium-Large (~25 files, ~2.5 contributor-days)

### PR #6 — Agents (8 agents/*.md)

**Why second:** agent prompts reference skills by name. PR #5's skill set is the dependency.

**Adds:**
- `agents/<name>.md` × 8 (frontmatter + tier-template body + `<example>` blocks)
- 8 `install-modules.json` entries (kind=agent)
- `plugin.json` `agents` array populated with all 8
- `scripts/test-agents.js` full validation (per §2.3 7-check list)
- `scripts/test-bash-strip.js` full validation (name-based implementer detection)

**Exit criteria:**
- `test-agents.js` reports 8 agents validated, 0 violations
- `test-bash-strip.js` reports 3 implementer-tier agents checked, 0 violations
- `plugin.json` lists 8 agents as explicit file paths
- `test-removability` reports `23 modules / 15 toggles` (agents add to modules but not toggles)

**Estimated scope:** Medium (~10 files of dense prose, ~2 contributor-days)

### PR #7 — Command + Rule system

**Why last:** independent of PR #5/#6 internally but ships the user-visible entry surface (`/orchestra`) and the language-rule scaffold. Lands once agents + skills are in place because the command body references both.

**Adds:**
- `commands/orchestra.md` (dispatcher per §4.1)
- `rules/common/coding-style.md` (P1)
- `rules/java/{coding-style, patterns, security, testing}.md` (P0)
- `rules/typescript/{coding-style, patterns, security, testing}.md` (P0)
- `rules/{go, python, kotlin}/coding-style.md` (P2 stubs per §5.4)
- 13 new `install-modules.json` entries (1 command + 12 rules)
- `plugin.json` `commands` array populated
- `scripts/validate.js` extension: rule frontmatter shape (`paths:`), ≤40-line cap

**Exit criteria:**
- `/orchestra help` parses (Claude Code shows usage)
- All 12 rule files pass `validate.js` (frontmatter + paths + line cap)
- `test-removability` reports `36 modules / 15 toggles` (final v1.0.0 count)

**Estimated scope:** Medium (~14 files, ~1.5 contributor-days)

### Dependency graph

```
PR #5 (skills) ──────────────┐
                             │
                             ▼
PR #6 (agents)         PR #7 (command + rules)
       │                     │
       └──────────────┬──────┘
                      ▼
              v1.0.0 release prep
              (RELEASE-v1.0.0.md, distribution polish)
```

PR #6 and PR #7 are **independent after PR #5**. A solo contributor sequences PR #5 → PR #6 → PR #7. A two-contributor team can split PR #6 ∥ PR #7 after PR #5 merges.

### Total leaf-component effort

| PR | Scope | Days |
|---|---|---|
| PR #5 | Medium-Large | 2.5 |
| PR #6 | Medium | 2.0 |
| PR #7 | Medium | 1.5 |
| **Total** | | **~6 contributor-days serial / ~5 with PR #6 ∥ PR #7** |

Combined with PR #1..#4's ~5.5 days, **v1.0.0 total ~11.5 contributor-days serial**.

---

## 9. Open design risks <a id="S-RISKS-001"></a>

Continues the R-numbering from DESIGN-001-infra (R1..R5).

| # | Risk | Surfaces at | Resolution |
|---|---|---|---|
| **R6** | Agent prompt prose quality determines model behavior; skeleton conformance doesn't guarantee role compliance | PR #6 review | Add fixture-based behavioral tests in PR #6 — synthetic prompts assert agent declares its tier and refuses out-of-tier work in worked examples. Limited verification but better than nothing |
| **R7** | Some skills (`qa-test-planner`, `code-review`, `write-contract`) may exceed 400-line cap when methodology is dense | PR #5 implementation | Aggressive use of `references/` for depth; SKILL.md focuses on triage + decision tree. If a skill won't fit even after aggressive split, request a PRD §8.8 amendment to allow 600 lines for specific skills (justified case-by-case) |
| **R8** | Rule ≤40-line cap is tight for security topics with many points | PR #7 implementation | Split aggressively into multiple rule files per language (already 4 per language). If still too tight, allow Markdown linkage to `references/` for depth in rules (PRD §8.8 amendment) |
| **R9** | val-calibration source quality directly shapes `@evaluator` judgment; bad examples → bad verdicts | PR #5 review | Include all 8 boundary cases from §6.3 minimum; have @evaluator's own behavior reviewed by calling out at least one ambiguous case to a human reviewer in the implementation phase |
| **R10** | PRD §8.7 inconsistency: spec says all 4 kinds have env-var toggles but v1.0.0 implements only skills+hooks+MCPs | PR #5 (or before PR #5 ships) | Amend PRD §8.7 per §7.3 of this design. Or: extend `runtime-toggles.json` to cover agents/rules/commands (29 more entries; tedious but consistent). Recommend the amendment |
| **R11** | `test-bash-strip.js` uses hard-coded implementer-name set `{backend, frontend, test}`. Adding a new implementer-tier agent in v1.1 requires a code change. | When PR adds a new implementer agent (likely v1.1+) | Acceptable for v1.0.0. v1.1+ may add a `tier:` field to agent frontmatter (PRD §10.1 amendment) and have `test-bash-strip.js` read tier from frontmatter instead |

R10 is the only one that *might* require action **before** PR #5 starts (depending on whether the team wants to amend PRD §8.7 or extend the toggle surface). Recommend amending — keeps the toggle surface focused.

---

## 10. Autonomy taxonomy <a id="S-AUTONOMY-002"></a>

> Forward-spec for W2 (autonomy config). Implements PRD §8.14 in this design pass. Vendored from `~/second-brain/research/ai-agent-autonomy-level-diagnostic.md` (read 2026-05-04). The 5-question diagnostic and 3-axis matrix are inlined here so the plugin is self-contained on consumer installs — no external file dependency.

### 10.1 The five tags

Five autonomy levels, one tag each. Tags are routable: orchestration pipelines key off them, audit logs record them per-run (`runs/<run-id>.autonomy_level`), escalation routers consult them when deciding whether to pause.

| Level | Tag | Mental model |
|---|---|---|
| **Operator** | `EXECUTION_ONLY` | Human directs, AI executes. Step-by-step instructions, no agent strategy. |
| **Collaborator** | `JOINT_PROCESSING` | AI assists; tight iterative loop. Agent and human co-author logic. |
| **Consultant** | `OPTION_SYNTHESIS` | AI suggests options; human chooses **and acts**. Inversion: execution returns to human. |
| **Approver** | `DRAFT_AND_GATE` | AI prepares full solution; pauses at authorization checkpoints; human approves; AI executes. **v1.0.0 default.** |
| **Observer** | `FULL_AUTONOMY` | AI acts end-to-end; human monitors via telemetry/alerts. |

### 10.2 Diagnostic — five ordered yes/no questions

Run in order. **First yes wins.** Later matches do not override the tighter constraint. No yes anywhere → not delegable in current form (tighten the spec, narrow the scope, or keep the work human).

1. **`EXECUTION_ONLY`** — Does the task require the agent to strictly follow explicit, step-by-step instructions without formulating its own logic or strategy?
2. **`JOINT_PROCESSING`** — Does the task require an iterative, synchronous loop where the agent and human co-author logic, troubleshoot state, or refine artifacts in real-time?
3. **`OPTION_SYNTHESIS`** — Is the agent's primary objective to analyze constraints and generate a bounded list of viable, optimized strategies for the human to evaluate and select?
4. **`DRAFT_AND_GATE`** — Can the agent autonomously generate a complete solution, halting strictly at a final authorization checkpoint before executing any state-changing actions?
5. **`FULL_AUTONOMY`** — Is the task sufficiently bounded and resilient that the agent can execute it end-to-end, relying on the human solely for asynchronous auditing via telemetry or alert thresholds?

`@lead` runs this diagnostic in §10.4 to suggest a level when classifying a `/orchestra` request.

### 10.3 The 3-axis decision matrix

Autonomy is not a single dial; it decomposes into three independent axes — *who* formulates strategy, *who* makes the final decision, *who* executes the state-changing action.

| **Level (Tag)**                       | **Strategy & Logic** | **Final Decision** | **Execution**       |
|---------------------------------------|----------------------|--------------------|---------------------|
| **Operator** (`EXECUTION_ONLY`)       | Human                | Human              | AI                  |
| **Collaborator** (`JOINT_PROCESSING`) | Both (iterative)     | Both (consensus)   | AI                  |
| **Consultant** (`OPTION_SYNTHESIS`)   | AI                   | Human              | **Human**           |
| **Approver** (`DRAFT_AND_GATE`)       | AI                   | Human              | AI                  |
| **Observer** (`FULL_AUTONOMY`)        | AI                   | AI                 | AI                  |

**The Consultant inversion is real.** L3 (`OPTION_SYNTHESIS`) is the only level where Execution moves *back* to the human after AI does the strategy work. Use it deliberately for high-leverage, irreversible decisions: architecture proposals, vendor selection, hiring loops. An orchestration router that models autonomy as a single dial misroutes Consultant-shaped tasks (lets the AI act when it was only meant to advise). v1.0.0 routes `OPTION_SYNTHESIS` to a degenerate form — `@lead` produces an option set then halts at PAUSE-1; full Consultant-mode artifacts (e.g. `PROPOSAL-<id>.md`) are deferred to v1.1+.

### 10.4 Auto-classification by `@lead`

`@lead`'s prompt body includes this section's diagnostic. On every `/orchestra <natural language>` invocation, `@lead`:

1. Reads the user prompt + `local.yaml.autonomy.level` (default fallback `DRAFT_AND_GATE`).
2. Runs the 5-question diagnostic against the prompt; records the suggested tag.
3. If suggested tag ≠ current default, surfaces it at PAUSE-1: *"Default is `DRAFT_AND_GATE`; this looks like `OPTION_SYNTHESIS` (architecture proposal — you'll want to do the apply step yourself). Confirm or override?"*
4. If user accepts: run continues at suggested tag. If user overrides: run continues at user's tag.
5. The resolved tag is recorded in `runs/<run-id>.json.autonomy_level`.

Auto-classification is suggestion-only in v1.0.0 — it never *changes* the level without user assent. v1.1+ may make assent implicit when classifier confidence is high.

### 10.5 Pause integration in the dispatcher (`commands/orchestra.md`)

The dispatcher resolves the autonomy level (CLI flag → local.yaml → default) before TeamCreate. The level is passed to `@lead` and is consulted at four pause transitions during the `/orchestra <natural language>` flow per §4.2:

| # | Transition | Pause behavior at `DRAFT_AND_GATE` |
|---|---|---|
| 1 | After intent classification | `AskUserQuestion`: *"intent=feature, confidence=MEDIUM, pattern=B, autonomy=DRAFT_AND_GATE — proceed?"* (also where auto-classification suggestion surfaces). |
| 2 | After PRD + FRS drafted | `AskUserQuestion`: *"This spec captures `<one-line summary>`. Proceed to architecture/contract?"* |
| 3 | After CONTRACT co-signed | `AskUserQuestion`: *"Gate is `<criteria summary>`. Kick off implementation?"* |
| 4 | After CODE-REVIEW verdict | `AskUserQuestion`: *"Review verdict: `APPROVED` (2 minor, 0 blockers). Ship?"* |

Other autonomy levels behave per PRD §8.14.3:
- `EXECUTION_ONLY` — confidence classification is skipped; `@lead` follows the user's prompt as a literal task list.
- `JOINT_PROCESSING` — every artifact write is followed by a back-and-forth dialogue (Pattern B per stage).
- `OPTION_SYNTHESIS` — run halts at PAUSE-1 after producing the option set.
- `FULL_AUTONOMY` — pauses become async `PAUSE-<phase>-<id>.md` artifacts (v1.2+); v1.0.0 simply omits all pauses.

### 10.6 Manifest integration

`local.yaml.autonomy.level` is the per-project default (PRD §9.12). v1.0.0 does not add an `ORCHESTRA_AUTONOMY_*` env-var toggle — overrides happen via the CLI flag (per-run) or YAML edit (per-project), matching the §7.3 toggle-surface scope discipline (env vars only for hooks/skills/MCPs; commands and behavioral modes use natural mechanisms).

### 10.7 Telemetry

Every `runs/<run-id>.json` records `autonomy_level: "<tag>"`. Aggregation (`scripts/aggregate-metrics.py`) can break runs out by autonomy level. Two questions the data answers:

1. **How often does the default survive?** Pass-rate at `DRAFT_AND_GATE` vs override rate. If users override every time, the default is wrong.
2. **Which intents correlate with which levels?** If `feature` always runs at `FULL_AUTONOMY` and `refactor` always runs at `OPTION_SYNTHESIS`, the dispatcher could pre-bias suggestions per-intent.

Both feed v1.1+ refinements to the auto-classifier.

---

## 11. Summary <a id="S-SUMMARY-001"></a>

PR #5 ships all 8 skills (and unblocks val-calibration via the calibration source); PR #6 adds the 8-agent surface against the now-complete skill set; PR #7 ships the `/orchestra` entry command and the language-rule system; **PR #8 ships the autonomy config** (per WORKFLOW-002 §2.4 and §10 of this design). After PR #8, the v1.0.0 plugin is feature-complete pending release-time polish (`RELEASE-v1.0.0.md`, distribution scripts, README expansion).

**29 new manifest entries**, **8 new toggles**, **~36 new files** in PR #5–#7 plus **~5 files** in PR #8 (autonomy schema, dispatcher flag parser, 4 pause call sites, auto-classifier in `@lead`). Each PR ships green-CI on merge; the same `npm test` chain that protected PR #1..#4 protects PR #5..#8 as new validation extensions plug in.

**Next step:** confirm the PRD §8.7 amendment (R10) — keep or extend the toggle surface — then hand off to `/sc:sc-workflow` for the PR #5..#8 task graph.

---

**End of DESIGN-002-leaves.** Hand-off to `/sc:sc-workflow` for PR #5..#7 sequencing.
