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

### Model actions (numbered = you must do these)

**Step 1 — TeamCreate the 8-agent team. Mandatory and first.** Per PRD §8.5 / D-30, every `/orchestra` run MUST instantiate the persistent 8-member team via `TeamCreate` BEFORE any other work. Do not bootstrap, classify, or write artifacts in the parent context. Do not simulate two agents from the parent context as if they were separate (that violates D-30's TeamCreate vs SubAgent boundary).

```
TeamCreate({
  name: "orchestra-<run-uuid>",
  members: ["@product", "@lead", "@backend", "@frontend", "@test", "@evaluator", "@reviewer", "@ship"]
})
```

The team persists for the run; all subsequent steps execute INSIDE team-member contexts (via Task or team-message dispatch), never from the parent.

**Step 2 — Bootstrap if `local.yaml` is absent.** This step is **always Pattern B regardless of feature confidence** — the bootstrap is meta (it establishes the project's mode, not the feature's intent), and the project-mode classification has too many failure modes for solo authorship.

```
2a. Send a Task to @product: "Run project-discovery skill, then draft <cwd>/.claude/.orchestra/local.yaml proposing { project_mode, primary_language, framework, scope_hints }. Return the draft."
2b. Send a Task to @lead: "Validate @product's draft against the actual repo state. Return either { agree: true } or { agree: false, suggested-revision: <one round> }."
2c. If @lead returned `agree: false`: send ONE more Task to @product with @lead's suggested revision; @product applies it and returns the final draft. (One revision round only — no second loop. Three rejection rounds in any subsequent stage trip the circuit breaker per PRD §9.6.)
2d. After both agents agree: write `<cwd>/.claude/.orchestra/local.yaml` with `bootstrapped_by: { product: <agent-id>, lead: <agent-id> }`. Append `local.bootstrapped` event to `metrics/events.jsonl` (event emitter origin per PRD §9.9 — this is appended by @lead, not the metrics-collector hook).
2e. If @product and @lead deadlock at round 2 → write `<cwd>/.claude/.orchestra/pipeline/<id>/DEADLOCK-bootstrap.md` per PRD §9.6.1, halt, escalate.
```

A solo bootstrap (writing `local.yaml` from the parent context, or from a single agent context that simulates both @product and @lead) is **not Pattern B**. Two distinct agent contexts, one revision round between them. Verify by checking `bootstrapped_by:` in the resulting yaml — if it doesn't list two distinct agent ids, the run was solo and is non-conformant.

**Step 3 — `@lead` classifies feature intent** per PRD §9.5 routing taxonomy (`docs` / `template` / `hotfix` / `feature` / `review-only` / `refactor`).

**Step 4 — `@lead` computes feature-level confidence** per PRD §8.11 (5 signals → HIGH/MEDIUM/LOW). The user may override with `--confidence high|medium|low` (logged as `confidence.user-override`). Note: this confidence is for the FEATURE workflow, distinct from the bootstrap which is always Pattern B.

**Step 5 — Pick feature dialogue pattern** per PRD §9.4: A linear (HIGH), B one-revision (MEDIUM), C wave team (LOW).

**Step 6 — Agents work in waves per their role** (PRD §9.5). Each agent writes artifacts INTO ITS OWN TEAM-MEMBER CONTEXT (not the parent). Artifacts land in `<project>/.claude/.orchestra/pipeline/<id>/`.

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
