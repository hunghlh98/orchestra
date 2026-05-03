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

**Step 2 — Bootstrap if `local.yaml` is absent.** Always Pattern B regardless of feature confidence — the bootstrap is meta (it establishes the project's mode, not the feature's intent), and the project-mode classification has too many failure modes for solo authorship.

```
2a. Spawn @product with this prompt:
      "Run project-discovery (read tree, language hints, framework markers).
       Write your draft project-mode classification to
       <cwd>/.claude/.orchestra/pipeline/bootstrap/local.yaml.draft as YAML
       with keys: project_mode, primary_language, framework, scope_hints.
       End your turn after the write — do NOT call SendMessage."

2b. On the idle notification from @product's turn:
      Read(<cwd>/.claude/.orchestra/pipeline/bootstrap/local.yaml.draft).
      If the draft is missing or malformed: spawn @product once more
      with the failure note. If still missing on second attempt: write
      DEADLOCK-bootstrap.md and halt.

2c. Spawn @lead with this prompt:
      "Read <draft path> and validate against actual repo state via
       project-discovery. Write your decision to
       <cwd>/.claude/.orchestra/pipeline/bootstrap/lead-verdict.yaml
       with keys: agree (bool) and (if agree=false) suggested_revision (string).
       End your turn after the write — do NOT call SendMessage."

2d. On the idle notification from @lead's turn:
      Read(lead-verdict.yaml).
      If agree: true → goto 2f.
      If agree: false → goto 2e (one revision round only).

2e. Spawn @product once more with the suggested_revision and the original draft path:
      "Apply this revision to your prior draft and rewrite local.yaml.draft.
       End your turn."
    On idle: re-read draft. Treat as final regardless of @lead's view.
    (No second revision loop — Pattern B is exactly one round.)

2f. Parent canonicalizes: copy local.yaml.draft → local.yaml, adding
      bootstrapped_at: <ISO>
      bootstrapped_by:
        product: <@product agent id from team config>
        lead:    <@lead agent id from team config>
    Then spawn @lead one more time with this prompt:
      "Append this exact JSON line to <cwd>/.claude/.orchestra/metrics/events.jsonl
       using your Edit tool (read first, append the line, end your turn):
       <line>
       where <line> = the local.bootstrapped event per PRD §9.9 with run_id, project_mode,
       primary_language, framework filled in from local.yaml."
    Per PRD §9.9: this event is emitter-by-@lead, not by the metrics-collector hook.

2g. Three rejection rounds total (any combination of @product or @lead refusals)
    → write DEADLOCK-bootstrap.md per PRD §9.6.1, halt, escalate to user.
```

A solo bootstrap (writing `local.yaml` from the parent context, or from a single agent context that simulates both @product and @lead) is **not Pattern B**. Two distinct agent contexts, one revision round between them. Verify by checking `bootstrapped_by:` in the resulting yaml — if it doesn't list two distinct agent ids, the run was solo and is non-conformant.

**Step 3 — Spawn `@lead` to classify feature intent** per PRD §9.5 routing taxonomy (`docs` / `template` / `hotfix` / `feature` / `review-only` / `refactor`). @lead writes its classification to `<cwd>/.claude/.orchestra/pipeline/<feature-id>/intent.yaml` with `intent`, `confidence`, `pattern`. Parent reads on idle.

**Step 4 — Confidence override (optional).** Parse `--confidence high|medium|low` from `$ARGUMENTS` if present; if so, append `confidence.user-override` to the events.jsonl line @lead writes (or override @lead's classification before downstream agents read it). Confidence here is for the FEATURE workflow, distinct from the bootstrap which is always Pattern B.

**Step 5 — Spawn the workflow agents per the routing taxonomy.** For example, a `feature` intent spawns `@product` (PRD/FRS) → wait → `@lead` (CONTRACT/TDD/TASKS) → wait → `@backend`/`@frontend` (impl) → wait → `@test` (TEST plan) → wait → `@evaluator` (verdict) → wait → `@reviewer` (CODE-REVIEW) → wait → `@ship` (RELEASE/RUNBOOK). Each transition: spawn agent, wait for idle, read its output file, decide next.

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
