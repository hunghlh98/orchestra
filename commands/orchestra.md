---
name: orchestra
description: Multi-agent SDLC pipeline behind one entry point. Routes natural language to TeamCreate → @product + @lead classification, or dispatches sprint/release/commit/help subcommands.
argument-hint: <subcommand|natural language>
---

# /orchestra dispatcher

Multi-agent SDLC pipeline. One entry surface; subcommands branch internally.

## Invariants

The 5 hooks (see "Runtime hooks" table below) own their events and side effects. Do not write to `<cwd>/.claude/.orchestra/metrics/events.jsonl` directly, hash artifact frontmatter manually, or replicate any hook's work — every "do not do this manually" you might infer reduces to this one rule.

## Status output

The dispatcher emits two kinds of terminal output beyond agent prose and pause questions: **status lines** at filesystem-coupled transitions, and **banners** when reading exception artifacts. Both are model-emitted dispatcher text, NOT hook output.

**Status lines** — single line, no ANSI, no emoji. One emitted at each:

- Before every `Agent({ subagent_type: "<role>" })` call: `[orchestra] spawn @<role> → <artifact-target>`
- After every parent `Read(<path>)` returns: `[orchestra] read  @<role> wrote <filename>`
- Before every `AskUserQuestion` pause: `[orchestra] pause PAUSE-<N>: <one-line question>`
- At terminal state (Step 7): `[orchestra] shutdown <terminal_state> feature=<feature-id> duration=<Ns>`

**Banners** — multi-line, fire after a parent `Read` returns an artifact whose basename matches `DEADLOCK-*.md`, `ESCALATE-*.md`, or `ESCALATE-ARCH-*.md`. At every autonomy level:

```
============================================================
[orchestra] <ARTIFACT_TYPE> detected
  triggered_by_<stage|agent>: <value-from-frontmatter>
  resolution: <value-from-frontmatter>
  path: <absolute path to artifact>
============================================================
```

The metrics-collector hook captures structurally-equivalent events (`task.subagent.invoked`, `artifact.written`, `team.shutdown`) for replay; status lines + banners are the user's live signal.

## Parse arguments

Look at the first whitespace-separated token of `$ARGUMENTS`:

- `sprint`   → run **/orchestra sprint** flow (with optional `--size N`)
- `release`  → run **/orchestra release** flow
- `commit`   → run **/orchestra commit** flow (no team; uses `commit-work` skill directly)
- `resume`   → run **/orchestra resume** flow (with optional `<feature-id>` argument)
- `shutdown` → run **/orchestra shutdown** flow (in-session teardown)
- `help`     → print usage block (defined below)
- otherwise  → run **/orchestra <natural language>** smart router

## /orchestra <natural language> (smart router)

Default path. Spawn the 8-agent team and route per intent.

### Coordination protocol (read this before the steps)

**The 8 orchestra agents are filesystem-coupled, not message-coupled.** Each agent's tools list is a strict tier set (T-A: `Bash/Glob/Grep/Read/Write`; T-B: `Glob/Grep/Read/Write`; T-C: `Edit/Glob/Grep/MultiEdit/Read/Write`). **`SendMessage` is not in any tier set** — adding it would break `test-agents.js` tier validation. Spawned agents therefore communicate by writing to designated paths under `<cwd>/.claude/.orchestra/`, and the parent (this dispatcher) reads those paths after each idle notification.

The handoff pattern is:

```
1. Parent: Agent({ team_name, name, subagent_type, prompt: "Write your output to <designated path>. End your turn." })
2. Spawned agent runs; writes the file; turn ends; idle notification arrives at parent automatically.
3. Parent: Read(<designated path>) to consume the agent's output.
4. Parent: optionally Agent again (or the same teammate via a follow-up Agent call) for the next stage.
```

Do NOT instruct spawned agents to call `SendMessage` — they cannot. Do NOT poll for messages — Claude Code's idle notification fires automatically when the spawned agent's turn ends. Do NOT write artifacts from the parent context — every pipeline artifact must be authored inside its assigned agent's context per the tier discipline.

### Autonomy resolution + pause transitions

**Resolved level = `--autonomy=<tag>` in `$ARGUMENTS` > `local.yaml.autonomy.level` > hard-coded `DRAFT_AND_GATE`.** Tags: `EXECUTION_ONLY` | `JOINT_PROCESSING` | `OPTION_SYNTHESIS` | `DRAFT_AND_GATE` | `FULL_AUTONOMY`. Resolve at run start (Step 1); pass into TeamCreate description and `@lead`'s prompt; record in `runs/<run-id>.json.autonomy_level`.

**Pauses fire ONLY when resolved level is `DRAFT_AND_GATE`.** Behavior at other levels: `FULL_AUTONOMY` skips all 4 pauses; `EXECUTION_ONLY` skips confidence classification; `JOINT_PROCESSING` adds per-stage dialogue; `OPTION_SYNTHESIS` halts after option set (v1.0.0 routes through `DRAFT_AND_GATE` PAUSE-1 with an explicit "you'll do the apply step yourself" message).

When you reach a step marked `→ PAUSE-N` below, call `AskUserQuestion` per this table. On user reject → write `DEADLOCK-<id>.md` and halt:

| # | Fires after | Question shape |
|---|---|---|
| 1 | Step 3 (intent + autonomy classification) | "intent=`<intent>`, confidence=`<conf>`, pattern=`<A\|B\|C>`, autonomy=`<tag>` — proceed?" Also surfaces @lead's auto-classified suggestion if it differs from the resolved default. |
| 2 | Step 5 (after `@product` writes PRD + FRS) | "Spec captures: `<one-line summary>`. Proceed to architecture/contract?" |
| 3 | Step 5 (after `@lead` writes CONTRACT) | "Gate is `<criteria summary>`. Kick off implementation?" |
| 4 | Step 5 (after `@reviewer` writes CODE-REVIEW) | "Review verdict: `<APPROVED\|REQUEST_CHANGES>` (`<N minor, M blockers>`). Ship?" |

### Model actions (numbered = you must do these)

**Step 1 — Resolve autonomy + create the team.** Resolve the autonomy tag per the precedence above (CLI flag → `local.yaml.autonomy.level` → `DRAFT_AND_GATE`); include it in TeamCreate's `description` and pass it into every spawned agent's prompt. Then `TeamCreate` (container) + `Agent` calls (members joined on demand).

```
TeamCreate({
  team_name: "orchestra-<run-slug>",          // e.g. "orchestra-001-hello-world"
  agent_type: "orchestra-coordinator",        // type of the team lead (parent context)
  description: "Orchestra v1 run for <user-intent-summary>"
})
```

Members spawn on demand: `@product` + `@lead` for bootstrap; the rest as the routing taxonomy demands.

```
Agent({
  team_name: "orchestra-<run-slug>",          // same team
  name: "@<role>",                            // human-readable id used in TaskUpdate.owner + SendMessage.to
  subagent_type: "orchestra:<role>",          // matches plugin agent definition
  prompt: "<task instructions ending with: write to <path>; end your turn>"
})
```

**Step 2 — Bootstrap if `local.yaml` is absent.** Script-first decision tree; Pattern B fallback only for ambiguous cases.

```
2a. result=$(node ${CLAUDE_PLUGIN_ROOT}/scripts/bootstrap-local.js "<cwd>")
    Parse: { status, yaml_content, yaml_path, decision.confidence }
    decision.confidence ∈ { HIGH, MEDIUM, LOW }

2b. status === "exists" → skip to Step 3.

2c. confidence === "HIGH" or "MEDIUM" → Write yaml_content at yaml_path.
    Continue to Step 3.

2d. confidence === "LOW" or status === "ambiguous" → Pattern B fallback:
    i.   Spawn @product (subagent_type: orchestra:product). Prompt: run
         project-discovery, write draft to
         .orchestra/pipeline/bootstrap/local.yaml.draft, end turn.
         (No SendMessage — filesystem-coupled per Coordination protocol above.)
    ii.  On idle: Read draft. Missing/malformed → re-spawn once.
         2nd failure → DEADLOCK.
    iii. Spawn @lead with the draft. Prompt: validate; write
         lead-verdict.yaml { agree: bool, suggested_revision? }. End turn.
    iv.  On idle: Read verdict. agree:true → goto vi.
         agree:false → one revision round only.
    v.   Spawn @product with suggested_revision; rewrite draft. Treat next
         draft as final (Pattern B is exactly one round).
    vi.  Write final yaml_content at yaml_path with bootstrapped_by: listing
         both agent ids.
    vii. 3 rejection rounds → DEADLOCK-bootstrap.md, halt.
```

**Step 3 — Spawn `@lead` to classify feature intent** per the routing taxonomy (`docs` / `template` / `hotfix` / `feature` / `review-only` / `refactor`). @lead writes its classification to `<cwd>/.claude/.orchestra/pipeline/<feature-id>/intent.yaml` with `intent`, `confidence`, `pattern`, plus a suggested `autonomy_level` from the diagnostic in `agents/lead.md`'s `Autonomy classification` section. Parent reads on idle. **→ PAUSE-1** (intent + autonomy confirmation).

**Step 4 — Confidence override (optional).** If `--confidence` flag in `$ARGUMENTS`, override @lead's feature-confidence classification before downstream agents read it.

**Step 5 — Spawn the workflow agents per the routing taxonomy.** Use the table below as the **artifact whitelist**. Spawn ONLY the agents listed for the classified intent, and instruct each spawned agent on what they may and may not produce. Each transition: spawn agent, wait for idle, Read its output file, decide next.

| Intent | Agents (in order) | Artifacts they author |
|---|---|---|
| **docs** | `@product` (intent only) → `@ship` → `@reviewer` | (no PRD, no FRS, no TDD, no CONTRACT, no TEST) — only the doc files themselves + CODE-REVIEW |
| **template** | `@product` (intent only) → `@lead` → builder → `@test` → `@evaluator` → `@reviewer` | `design/<NNN>-TDD.md`, `plan/<NNN>-TASKS.md`, impl source, `verify/<NNN>-TEST.md`, `verify/<NNN>-VERDICT.md`, `verify/<NNN>-CODE-REVIEW.md` (no PRD/FRS, no CONTRACT, no API) |
| **hotfix** | `@lead` → builder → `@test` → `@evaluator` → `@ship` | `design/<NNN>-TDD.md`, `plan/<NNN>-TASKS.md`, impl-fix, `verify/<NNN>-TEST.md`, `verify/<NNN>-VERDICT.md`, RELEASE (no PRD/FRS, no CONTRACT, no API, no CODE-REVIEW) |
| **feature** | `@product` → `@lead` → builder → `@test` → `@evaluator` → `@reviewer` → `@ship` | **Full set:** `requirements/<NNN>-PRD.md`, `requirements/<NNN>-FRS.md`, `design/<NNN>-TDD.md`, `interfaces/<NNN>-API.openapi.yaml`, `interfaces/<NNN>-CONTRACT.md`, `plan/<NNN>-TASKS.md`, impl source, `verify/<NNN>-TEST.md`, `verify/<NNN>-VERDICT.md`, `verify/<NNN>-CODE-REVIEW.md`, RELEASE/RUNBOOK |
| **review-only** | `@reviewer` (assess only — no downstream) | `verify/<NNN>-CODE-REVIEW.md` only (no PRD/FRS/TDD/CONTRACT/TEST/RELEASE) |
| **refactor** | `@reviewer` (assess) → `@lead` (TDD update) → builder → `@test` → `@evaluator` | `verify/<NNN>-CODE-REVIEW.md`, `design/<NNN>-TDD.md` (update), impl, `verify/<NNN>-TEST.md`, `verify/<NNN>-VERDICT.md` (no PRD/FRS, no CONTRACT, no API) |

**Each spawned agent MUST be given the routed intent in its prompt.** Concretely, every Step-5 `Agent` call's `prompt` MUST include a line like:

> `Routed intent for this run: <intent>. Per the routing taxonomy your authorized artifacts are: <list-from-row-above>. Do NOT author any artifact outside this whitelist; if you believe a different artifact is required, write an ESCALATE-<id>.md note instead and end your turn.`

**Step 5b — Pause integration during the spawn loop.** When resolved autonomy is `DRAFT_AND_GATE`, fire `AskUserQuestion` at three transitions inside Step 5 (in addition to PAUSE-1 already fired in Step 3): **→ PAUSE-2** after `@product` writes PRD + FRS, before spawning `@lead`/builder; **→ PAUSE-3** after `@lead` writes CONTRACT, before spawning the implementer/`@test`; **→ PAUSE-4** after `@reviewer` writes CODE-REVIEW, before spawning `@ship`. Question shapes per the Pause transitions table above. On reject → write `DEADLOCK-<id>.md` and halt. For `feature` intent all 4 pauses fire; lighter intents (`docs`/`hotfix`/`template`/`refactor`/`review-only`) fire only the pauses whose preceding step actually ran (e.g., `hotfix` skips PAUSE-2 because there is no `@product` PRD/FRS).

**Step 6 — Each artifact lands in `<project>/.claude/.orchestra/pipeline/<feature-id>/`.** Agents author their artifact frontmatter (sections, references) per `schemas/pipeline-artifact.schema.md`. The parent does NOT copy/edit those artifacts — each agent owns its outputs.

**Step 7 — Terminal-state detection + closure.** After every parent `Read` in Step 5, evaluate the just-read artifact's basename:

- `RELEASE-vX.Y.Z.md` → `terminal_state = "success"`
- `DEADLOCK-*.md` → `terminal_state = "deadlock"`
- `ESCALATE(-ARCH)?-*.md` with frontmatter `resolution: abandoned` → `terminal_state = "escalated"`
- otherwise → continue Step 5 spawn loop

On terminal state:

1. Parent `Write(<feature-dir>/SUMMARY-<feature-id>.md, ...)` per `schemas/pipeline-artifact.schema.md` SUMMARY shape: `team_name`, `started_at` (the team.created timestamp from earlier in this run; fallback to first matching `team.created` in events.jsonl), `ended_at` (now), `duration_seconds`, `terminal_state`, `artifact_count`. Body: 1–3 line plain-text closing note. SUMMARY is parent-authored bookkeeping at terminal state — narrowly carved exception to the Coordination-protocol "no parent artifact writes" rule, because no agent is in scope after teardown begins.
2. Parent `TeamDelete()` (zero-param primitive — team is implicit from current session context; failure mode: throws on active members, but Orchestra's filesystem-coupled flow has SubagentStop drain members synchronously by the time terminal state is detected).
3. Emit closing status line per `## Status output`.

### Runtime hooks

The plugin registers 5 hooks in `hooks/hooks.json`. Claude Code fires them automatically on the listed lifecycle events.

| Hook | Event | What fires |
|---|---|---|
| `metrics-collector` | UserPromptSubmit | Logs `prompt.submitted` with `matched_orchestra: true` to `<cwd>/.claude/.orchestra/metrics/events.jsonl`. Fires the moment the user submits the `/orchestra` prompt — before Step 1 of your action list. |
| `hash-stamper` | PreToolUse:Write\|Edit\|MultiEdit | Stamps `sections:` and resolves `references[].hash-at-write: TBD` in artifact frontmatter when writing under `<project>/.claude/.orchestra/**/*.md`. Note: hooks attach to the parent context's tool calls; subagent writes may bypass this hook, which is why agents author `sections:` and `references:` blocks explicitly per `schemas/pipeline-artifact.schema.md`. |
| `pre-write-check` | PreToolUse:Write\|Edit\|MultiEdit | Blocks writes containing detectable secrets (8 patterns: AWS keys, GitHub PATs, JWTs, etc.). Exits 2 (blocking) on hit. |
| `val-calibration` | PreToolUse:Task\|Agent | Injects `<calibration-anchor>` block into subagent-spawn prompts where `subagent_type === "evaluator"`. The matcher is `Task\|Agent` so it fires on both legacy (`Task`) and canonical (`Agent`) tool names. |
| `post-bash-lint` | PostToolUse:Bash | Surfaces source-modifying Bash commands (`npm install`, `sed -i`, etc.) to stderr. Observer; never blocks. |
| `metrics-collector` | PreToolUse:Task\|Agent / PreToolUse:TeamCreate / PreToolUse:TeamDelete / PreToolUse:Skill / PreToolUse:Write\|Edit\|MultiEdit / PreToolUse:mcp__orchestra-* / SubagentStop / Stop | Logs `task.subagent.invoked` (with `agent_name` + `team_name` + `prompt_summary` enrichment), `team.created` (team boundary), `team.shutdown` (run-end at terminal state), `skill.invoked` (skill name + args summary — captures the decision-laden moments of a feature run), `local.bootstrapped` (on local.yaml writes), `artifact.written` (any pipeline write — feature_id + artifact_type + file_name; for `intent.yaml` writes, also extracts `intent` / `confidence` / `pattern` into the event for insight-tracker semantics; for `SUMMARY-*.md` writes, extracts `team_name` / `terminal_state` / `duration_seconds`), `mcp.tool.called`, `subagent.stopped`, `session.stopped`. **Goal**: events.jsonl alone reconstructs the full smoke trace; no need to read Claude Code's session jsonl to debug a run. |

### AskUserQuestion budget

Each spawned agent applies its own confidence-tier question budget per its body. Three rejection rounds in any review stage trip the circuit breaker → `DEADLOCK-<id>.md`, halt, escalate.

## /orchestra sprint [--size N]

1. Read `<project>/.claude/.orchestra/backlog/issues/`. Default `N=3`; respect `--size N` if provided.
2. For each of the top-N issues, run the smart router as if the user had typed the issue title + body verbatim.
3. Sequence them; one feature per pipeline id; never parallel-write the same artifact (single-writer assumption).

## /orchestra release

1. Verify gates: any `confirmed: false`, drift-on-confirmed, or failing CONTRACT criterion → halt with the failing artifact path.
2. `@ship` writes `releases/RELEASE-vX.Y.Z.md` and (if topology changed) `runbooks/RUNBOOK-vX.Y.Z.md`.
3. Draft `ANNOUNCEMENT-<id>.md` (one sentence, link to RELEASE).
4. `@ship` runs `commit-work` skill for the release commit message; user commits manually.

## /orchestra commit

No team. Direct invocation of the `commit-work` skill.

1. Run `git diff --staged --stat`. If empty: stop, tell the user nothing is staged.
2. Read the staged diff and produce a Conventional Commits message: `<type>(<scope>): <subject>` per the skill body.
3. Hand the message to the user; the user runs `git commit` themselves (no auto-commit).

## /orchestra metrics [--limit N]

Console summary of recent orchestra runs from this project's `<cwd>/.claude/.orchestra/metrics/runs/`. Default `N=10`. Reads only the per-run summary JSONs (privacy-safe — no user-prompt content); prints a table with feature_id, intent, confidence, pattern, gates, tokens, duration, plus a footer with total/pass-rate/median-tokens.

```bash
python3 ${CLAUDE_PLUGIN_ROOT}/scripts/metrics-summary.py --metrics-dir <cwd>/.claude/.orchestra/metrics ${LIMIT_FLAG}
```

## /orchestra resume [<feature-id>]

Recovers an interrupted feature run by walking `pipeline/*/` and respawning the next non-`done` task in its DAG. Idempotent — re-spawning an owner whose prior turn partially completed is safe; the owner Reads existing artifacts before re-writing. No team spawn — reuses the smart-router spawn pattern at the resume point. `DEADLOCK-resume-<id>.md` writes from the parent context follow the same carve-out as Step 7 SUMMARY (parent-authored exception artifact at terminal state, narrowly carved from the "no parent artifact writes" rule).

1. **Enumerate candidates.** List `pipeline/*/` dirs missing the terminal artifact for their routed intent: `feature` requires a `RELEASE-vX.Y.Z.md.features` mention; `hotfix` / `template` / `refactor` require `verify/<NNN>-VERDICT.md`; `review-only` / `docs` require `verify/<NNN>-CODE-REVIEW.md`. 0 candidates → emit `[orchestra] resume no in-flight features` and exit. 1 → auto-select. >1 → `AskUserQuestion` with the list. If `<feature-id>` arg was passed, validate it against the candidate list; mismatch → write `DEADLOCK-resume-<id>.md` and halt.

2. **Validate prerequisites.** Read `pipeline/<feature-id>/intent.yaml`. **Missing → fail closed**: write `DEADLOCK-resume-<feature-id>.md` (`triggered_by_stage: RESUME`, body: "intent.yaml absent; re-run /orchestra <natural language>") and halt — an unexpected missing-file state could mask a real bug. Then scan the feature dir:
   - `SUMMARY-<id>.md` present → emit `[orchestra] resume <feature-id> already terminal` and exit.
   - `DEADLOCK-<id>.md` present → emit the standard banner per `## Status output` and halt; deadlocks need manual rescope.
   - `ESCALATE(-ARCH)?-<id>.md` with `resolution: pending` → emit banner + `AskUserQuestion` ("ESCALATE pending: `<reason from frontmatter>`. Resolved externally?"). On reject → halt; on accept → proceed.

3. **Find resume point.** Read `plan/<NNN>-TASKS.md` and walk the table topologically (respect Blocked-by edges). For each task in order:
   - `Status = done` → skip.
   - Owner is T-A (`@evaluator` / `@reviewer`) → derive status from verdict frontmatter: `@evaluator`'s task is `done` ⟺ `verify/<NNN>-TEST.md.verdict ∈ {PASS, FAIL}`; `@reviewer`'s task is `done` ⟺ `verify/<NNN>-CODE-REVIEW.md.verdict ∈ {APPROVED, REQUEST_CHANGES}`. Derived `done` → skip. Verdict `pending` → this is the resume point.
   - Owner is T-B (`@product` / `@lead` / `@test` / `@ship`) → derive from artifact existence with `confirmed: true` for the row's exit criterion. Match → skip; otherwise this is the resume point.
   - Otherwise (T-C implementer with `Status ∈ {pending, in_progress}`) → this is the resume point.

4. **REQUEST_CHANGES gate.** If the resume point follows a `verify/<NNN>-CODE-REVIEW.md.verdict = REQUEST_CHANGES`, do NOT auto-respawn the implementer. Emit banner + `AskUserQuestion` ("Last review verdict: REQUEST_CHANGES (`<N findings>`). Respawn @`<owner>` for revision, or halt to address findings manually?"). On accept → respawn at Step 5. On reject → halt with no further writes.

5. **Spawn.** Issue an `Agent({ subagent_type, prompt })` call per the Step 1 shape. The prompt MUST include: routed intent from `intent.yaml`, the feature_id, prior artifact pointers per the routing taxonomy, the intent-whitelist clause from Step 5 of the smart router, AND a resume directive: "Your task is `T-<id>` in `plan/<NNN>-TASKS.md`. Prior `Updated by` / `Updated at` columns may indicate partial work — Read existing artifacts before re-writing. Idempotent re-write is acceptable."

6. Continue per Step 5 of the smart router from the resume point through Step 7 (terminal-state detection → SUMMARY write → `TeamDelete()` → closing status line). Resume does not bypass the terminal-state machinery; it just enters mid-flight.

Status lines per `## Status output`: `[orchestra] resume scanning pipeline/` → `[orchestra] resume target=<feature-id>` → `[orchestra] resume next-task=T-<id> owner=@<role>`, then the standard spawn/read lines for each subsequent agent.

## /orchestra shutdown

In-session only. `TeamDelete()` operates on the current session's implicit team context — cross-session targeting is structurally impossible per the Claude Code primitive contract.

1. **Verify active orchestra team in this session.** If the current session did not invoke `/orchestra <intent>` and is not bound to an orchestra team, print `[orchestra] no active orchestra team in this session — shutdown is a no-op` and exit 0. No SUMMARY write.
2. **Resolve `feature_id`** from the dispatcher's own conversation state (the in-flight `/orchestra <intent>` run that started in this session). Fallback if context was compacted: read the latest `intent.yaml` `artifact.written` event for the current `run_id` from `<cwd>/.claude/.orchestra/metrics/events.jsonl` and lift `feature_id`.
3. Parent `Write(<feature-dir>/SUMMARY-<feature-id>.md, ...)` with `terminal_state: aborted` per the Step 7 frontmatter shape.
4. Parent `TeamDelete()`.
5. Emit confirmation per `## Status output`: `[orchestra] shutdown aborted feature=<feature-id>`.

The `<feature-id>` argument form is rejected — the current session has at most one active team. If `/orchestra shutdown <feature-id>` is invoked and the argument matches the in-session feature_id, treat it as a no-arg call; if it doesn't match, error with `[orchestra] argument feature-id mismatch with active session`.

## /orchestra help

Print usage:

```
/orchestra <natural language>   Smart router. TeamCreate → @product + @lead classify → specialists work in waves.
/orchestra sprint [--size N]    Pull N issues from .claude/.orchestra/backlog/issues/ and run as a batch (default N=3).
/orchestra release              Verify gates → write RELEASE / RUNBOOK / ANNOUNCEMENT artifacts and bump VERSION.
/orchestra commit               Conventional Commits message from `git diff --staged`. No team.
/orchestra metrics [--limit N]  Console summary of last N runs from .claude/.orchestra/metrics/runs/.
/orchestra resume [<feature-id>] Walk pipeline/* dirs, find non-terminal feature, respawn next non-done task in the DAG.
/orchestra shutdown             In-session: write SUMMARY (terminal_state=aborted) and TeamDelete() the current run's team.
/orchestra help                 This message.
```

Flags:
- `--confidence {high,medium,low}` — override `@lead`'s confidence classification (logged).
- `--autonomy <tag>` — override the autonomy level for this run; tag ∈ {`EXECUTION_ONLY`, `JOINT_PROCESSING`, `OPTION_SYNTHESIS`, `DRAFT_AND_GATE`, `FULL_AUTONOMY`}. Without the flag, `local.yaml.autonomy.level` wins; without that, default is `DRAFT_AND_GATE`. See the autonomy section in `agents/lead.md` for the diagnostic + axis decomposition.

Deferred (v1.1+): `/save`, `/load`, `/orchestra-disagree`, `/orchestra legacy`.
