---
name: orchestra
description: Multi-agent SDLC pipeline behind one entry point. Routes natural language to TeamCreate → @product + @lead classification, or dispatches sprint/release/commit/help subcommands.
argument-hint: <subcommand|natural language>
---

# /orchestra dispatcher

Multi-agent SDLC pipeline. One entry surface; subcommands branch internally. See PRD §9.1.

## Parse arguments

Look at the first whitespace-separated token of `$ARGUMENTS`:

- `sprint`  → run **/orchestra sprint** flow (with optional `--size N`)
- `release` → run **/orchestra release** flow
- `commit`  → run **/orchestra commit** flow (no team; uses `commit-work` skill directly)
- `help`    → print usage block (defined below)
- otherwise → run **/orchestra <natural language>** smart router

## /orchestra <natural language> (smart router)

Default path. Spawn the 8-agent team and route per intent.

### Coordination protocol (read this before the steps)

**The 8 orchestra agents are filesystem-coupled, not message-coupled.** Per PRD §8.5 each agent's tools list is a strict tier set (T-A: `Bash/Glob/Grep/Read/Write`; T-B: `Glob/Grep/Read/Write`; T-C: `Edit/Glob/Grep/MultiEdit/Read/Write`). **`SendMessage` is not in any tier set** — adding it would break `test-agents.js` tier validation. Spawned agents therefore communicate by writing to designated paths under `<cwd>/.claude/.orchestra/`, and the parent (this dispatcher) reads those paths after each idle notification.

The handoff pattern is:

```
1. Parent: Agent({ team_name, name, subagent_type, prompt: "Write your output to <designated path>. End your turn." })
2. Spawned agent runs; writes the file; turn ends; idle notification arrives at parent automatically.
3. Parent: Read(<designated path>) to consume the agent's output.
4. Parent: optionally Agent again (or the same teammate via a follow-up Agent call) for the next stage.
```

Do NOT instruct spawned agents to call `SendMessage` — they cannot. Do NOT poll for messages — Claude Code's idle notification fires automatically when the spawned agent's turn ends. Do NOT write artifacts from the parent context — every pipeline artifact must be authored inside its assigned agent's context per the tier discipline.

### Model actions (numbered = you must do these)

**Step 1 — Create the team and join the 8 members.** Per PRD §8.5 / D-30, every `/orchestra` run MUST instantiate the persistent team BEFORE any other work. The actual primitive is two-step: `TeamCreate` creates the team container, then `Agent` calls (one per member) join teammates with `team_name` + `name` parameters.

```
TeamCreate({
  team_name: "orchestra-<run-slug>",          // e.g. "orchestra-001-hello-world"
  agent_type: "orchestra-coordinator",        // type of the team lead (parent context)
  description: "Orchestra v1 run for <user-intent-summary>"
})
```

The 8 members are NOT joined upfront — that would burn 8 agent contexts before we know which roles are needed for the routed intent. Members are spawned **on demand** as the workflow advances:

- For Pattern B bootstrap (Step 2): spawn `@product` and `@lead` only.
- For routed features (Step 6): spawn the additional members the routing taxonomy demands (`@backend`/`@frontend`/`@test`/`@evaluator`/`@reviewer`/`@ship`).

Each `Agent` call uses:
```
Agent({
  team_name: "orchestra-<run-slug>",          // same team
  name: "@<role>",                            // human-readable id used in TaskUpdate.owner + SendMessage.to
  subagent_type: "orchestra:<role>",          // matches plugin agent definition
  prompt: "<task instructions ending with: write to <path>; end your turn>"
})
```

**Step 2 — Bootstrap if `local.yaml` is absent.** Tiered: script-first for the unambiguous cases (~95% of installs), Pattern B fallback for genuinely contested cases. The bootstrap is meta (it establishes the project's mode, not the feature's intent), but most of that classification is deterministic filesystem inspection that a script handles faster and more reliably than two AI agents.

```
2a. Run the bootstrap inspector:
      result=$(node ${CLAUDE_PLUGIN_ROOT}/scripts/bootstrap-local.js "<cwd>")
    Parse the JSON: { status, yaml_content, yaml_path, decision }.
    decision.confidence is one of HIGH | MEDIUM | LOW.

2b. If status === "exists": local.yaml already there; skip bootstrap, continue
    to Step 3.

2c. If decision.confidence === "HIGH" (clean greenfield OR clean brownfield):
      Use Claude Code's Write tool to put yaml_content at yaml_path.
      The PreToolUse:Write hook fires; metrics-collector emits the
      `local.bootstrapped` event with mode/primary_language/framework
      automatically (PRD §9.9 hook-only invariant). DO NOT manually
      append to events.jsonl — the hook owns it.
      Continue to Step 3.

2d. If decision.confidence === "MEDIUM" (e.g., source files but no commits):
      Use the Write tool with yaml_content as-is (the script flagged
      `inferred: true` already). The metrics-collector hook fires the
      same way as 2c. Continue to Step 3.
      (Rationale: MEDIUM-confidence cases benefit from inference but
      not from full Pattern B. The user can edit local.yaml if the
      classification turns out wrong; the `inferred: true` flag signals
      that downstream agents should not over-trust this row.)

2e. If decision.confidence === "LOW" or status === "ambiguous": fall back
    to Pattern B (the original two-agent flow). This branch handles
    rare cases like "git history exists but no source files" or
    "user intent contradicts filesystem state" (e.g., user says
    "rebuild from scratch" while a brownfield repo is present).

      2e.i.   Spawn @product via Agent({ team_name, name: "@product",
              subagent_type: "orchestra:product", prompt: "..." }).
              The prompt instructs @product to run project-discovery
              skill, write its draft project-mode classification to
              <cwd>/.claude/.orchestra/pipeline/bootstrap/local.yaml.draft,
              then end its turn (do NOT call SendMessage — agent tool
              sets exclude it; filesystem is the handoff).

      2e.ii.  On idle notification: Read the draft. If missing or
              malformed, spawn @product once more with the failure
              note. Two attempts maximum; second failure → DEADLOCK.

      2e.iii. Spawn @lead via Agent({ ..., name: "@lead", ... }) with
              prompt to validate the draft, writing its decision to
              <cwd>/.claude/.orchestra/pipeline/bootstrap/lead-verdict.yaml
              (agree: bool + optional suggested_revision). End turn.

      2e.iv.  On idle: Read the verdict. agree: true → goto 2e.vi.
              agree: false → one revision round only.

      2e.v.   Spawn @product once more with suggested_revision; @product
              rewrites the draft. On idle: treat the draft as final
              (no second revision loop — Pattern B is exactly one round).

      2e.vi.  Use the Write tool to put the final yaml_content at
              yaml_path with `bootstrapped_by:` listing the two distinct
              agent ids (product + lead from the team config).
              The Write triggers metrics-collector's local.bootstrapped
              emission automatically.

      2e.vii. Three rejection rounds in this Pattern B flow trip the
              circuit breaker per PRD §9.6.1: write DEADLOCK-bootstrap.md
              and halt.
```

**Conformance check:** Whether HIGH/MEDIUM/LOW path was taken, the ONLY way `local.bootstrapped` lands in `events.jsonl` is via the metrics-collector hook firing on PreToolUse:Write of `local.yaml`. The dispatcher, the bootstrap script, and any spawned agents do NOT write to events.jsonl directly. If you find yourself wanting to append a metric event manually — stop. The hook owns it.

**Step 3 — Spawn `@lead` to classify feature intent** per PRD §9.5 routing taxonomy (`docs` / `template` / `hotfix` / `feature` / `review-only` / `refactor`). @lead writes its classification to `<cwd>/.claude/.orchestra/pipeline/<feature-id>/intent.yaml` with `intent`, `confidence`, `pattern`. Parent reads on idle.

**Step 4 — Confidence override (optional).** Parse `--confidence high|medium|low` from `$ARGUMENTS` if present; if so, append `confidence.user-override` to the events.jsonl line @lead writes (or override @lead's classification before downstream agents read it). Confidence here is for the FEATURE workflow, distinct from the bootstrap which is always Pattern B.

**Step 5 — Spawn the workflow agents per the routing taxonomy (PRD §9.5).** Use the table below as the **artifact whitelist**. Spawn ONLY the agents listed for the classified intent, and instruct each spawned agent on what they may and may not produce. Each transition: spawn agent, wait for idle, Read its output file, decide next.

| Intent | Agents (in order) | Artifacts they author |
|---|---|---|
| **docs** | `@product` (intent only) → `@ship` → `@reviewer` | (no PRD, no FRS, no TDD, no CONTRACT, no TEST) — only the doc files themselves + CODE-REVIEW |
| **template** | `@product` (intent only) → `@lead` → builder → `@test` → `@evaluator` → `@reviewer` | TDD-NNN.md, TASKS-NNN.md, impl source, TEST-NNN.md, VERDICT-NNN.md, CODE-REVIEW-NNN.md (no PRD/FRS, no CONTRACT, no API) |
| **hotfix** | `@lead` → builder → `@test` → `@evaluator` → `@ship` | TDD-NNN.md, TASKS-NNN.md, impl-fix, TEST-NNN.md, VERDICT-NNN.md, RELEASE (no PRD/FRS, no CONTRACT, no API, no CODE-REVIEW) |
| **feature** | `@product` → `@lead` → builder → `@test` → `@evaluator` → `@reviewer` → `@ship` | **Full set:** PRD-NNN.md, FRS-NNN.md, TDD-NNN.md, API-NNN.openapi.yaml, CONTRACT-NNN.md, TASKS-NNN.md, impl source, TEST-NNN.md, VERDICT-NNN.md, CODE-REVIEW-NNN.md, RELEASE/RUNBOOK |
| **review-only** | `@reviewer` (assess only — no downstream) | CODE-REVIEW-NNN.md only (no PRD/FRS/TDD/CONTRACT/TEST/RELEASE) |
| **refactor** | `@reviewer` (assess) → `@lead` (TDD update) → builder → `@test` → `@evaluator` | CODE-REVIEW-NNN.md, TDD-NNN.md (update), impl, TEST-NNN.md, VERDICT-NNN.md (no PRD/FRS, no CONTRACT, no API) |

**Each spawned agent MUST be given the routed intent in its prompt.** Concretely, every Step-5 `Agent` call's `prompt` MUST include a line like:

> `Routed intent for this run: <intent>. Per PRD §9.5 routing taxonomy your authorized artifacts are: <list-from-row-above>. Do NOT author any artifact outside this whitelist; if you believe a different artifact is required, write an ESCALATE-<id>.md note instead and end your turn.`

This propagates the whitelist as a runtime invariant. Each agent's own routing-taxonomy guard (in their definition) cross-checks against the `intent.yaml` written in Step 3 for defense-in-depth.

**Step 6 — Each artifact lands in `<project>/.claude/.orchestra/pipeline/<feature-id>/`.** Agents author their artifact frontmatter per PRD §10.5 (sections, references). The parent does NOT copy/edit those artifacts — each agent owns its outputs.

### Runtime hooks (these fire automatically — DO NOT replicate manually)

The orchestra plugin registers 5 hooks in `hooks/hooks.json`. Claude Code invokes them on the corresponding lifecycle events without any model action. Do not attempt to log events manually, hash frontmatter manually, or replicate any hook's work in your output.

| Hook | Event | What fires |
|---|---|---|
| `metrics-collector` | UserPromptSubmit | Logs `prompt.submitted` with `matched_orchestra: true` to `<cwd>/.claude/.orchestra/metrics/events.jsonl`. Fires the moment the user submits the `/orchestra` prompt — before Step 1 of your action list. |
| `hash-stamper` | PreToolUse:Write\|Edit\|MultiEdit | Stamps `sections:` and resolves `references[].hash-at-write: TBD` in artifact frontmatter when writing under `<project>/.claude/.orchestra/**/*.md`. Note: hooks attach to the parent context's tool calls; subagent writes may bypass this hook, which is why agents author `sections:` and `references:` blocks explicitly per PRD §10.5. |
| `pre-write-check` | PreToolUse:Write\|Edit\|MultiEdit | Blocks writes containing detectable secrets (8 patterns: AWS keys, GitHub PATs, JWTs, etc.). Exits 2 (blocking) on hit. |
| `val-calibration` | PreToolUse:Task | Injects `<calibration-anchor>` block into Task prompts where `subagent_type === "evaluator"`. |
| `post-bash-lint` | PostToolUse:Bash | Surfaces source-modifying Bash commands (`npm install`, `sed -i`, etc.) to stderr. Observer; never blocks. |
| `metrics-collector` | PreToolUse:Task / PreToolUse:mcp__orchestra-* / SubagentStop / Stop | Logs `task.subagent.invoked`, `mcp.tool.called`, and `session.stopped` events. The `session.stopped` event fires automatically at the end of the run with `total_token_in`, `total_token_out`, `agents_used`. |

If the model finds itself wanting to write to `events.jsonl` directly, or compute sha256 hashes for artifact frontmatter manually — stop. The hooks own those concerns. Your job is the action steps above.

### AskUserQuestion budget (PRD §8.11)

| Confidence | Questions | When to ask |
|---|---|---|
| HIGH | 0 | Trivial intent, ≤15 words, files_touched <5 |
| MEDIUM | 1 | Ambiguous intent OR brownfield with 1+ inferred sections on path |
| LOW | 2–3 | Novel intent OR brownfield with multiple inferred sections OR >20 files touched |
| Any | Hard cap 3 | Never more than 3 questions per request |

Three rejection rounds in any review stage trip the circuit breaker (PRD §9.6) → write `DEADLOCK-<id>.md`, halt, escalate. Resume per PRD §9.6.1 (human edits `resolution:` / `direction:` then re-invokes `/orchestra`).

## /orchestra sprint [--size N]

1. Read `<project>/.claude/.orchestra/backlog/issues/`. Default `N=3`; respect `--size N` if provided.
2. For each of the top-N issues, run the smart router as if the user had typed the issue title + body verbatim.
3. Sequence them; one feature per pipeline id; never parallel-write the same artifact (PRD §8 single-writer assumption).

## /orchestra release

1. Verify all gates cleared on every artifact in the active feature folder. Any `confirmed: false`, open drift-on-confirmed flag, or failing CONTRACT criterion → halt with the failing artifact path.
2. `@ship` writes `releases/RELEASE-vX.Y.Z.md`.
3. If topology changed (new MCP, new agent, new infra dep), `@ship` also writes `runbooks/RUNBOOK-vX.Y.Z.md`.
4. Update `CHANGELOG.md` Unreleased → versioned entry; bump `VERSION`.
5. Draft `ANNOUNCEMENT-<id>.md` (one sentence, link to RELEASE).
6. `@ship` runs `commit-work` skill to produce the release commit message; user reviews and commits manually.

## /orchestra commit

No team. Direct invocation of the `commit-work` skill.

1. Run `git diff --staged --stat`. If empty: stop, tell the user nothing is staged.
2. Read the staged diff and produce a Conventional Commits message: `<type>(<scope>): <subject>` per the skill body.
3. Hand the message to the user; the user runs `git commit` themselves (no auto-commit).

## /orchestra help

Print usage:

```
/orchestra <natural language>   Smart router. TeamCreate → @product + @lead classify → specialists work in waves.
/orchestra sprint [--size N]    Pull N issues from .claude/.orchestra/backlog/issues/ and run as a batch (default N=3).
/orchestra release              Verify gates → write RELEASE / RUNBOOK / ANNOUNCEMENT artifacts and bump VERSION.
/orchestra commit               Conventional Commits message from `git diff --staged`. No team.
/orchestra help                 This message.
```

Flags:
- `--confidence {high,medium,low}` — override `@lead`'s confidence classification (logged).

Deferred (v1.1+): `/save`, `/load`, `/orchestra-disagree`, `/orchestra legacy`, `/orchestra resume`.
