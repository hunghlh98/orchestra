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

**Step 1 — Create the team and join members.** Every `/orchestra` run starts with `TeamCreate` (container) followed by `Agent` calls (members joined on demand).

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
    metrics-collector hook fires automatically; DO NOT manually emit.
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
         both agent ids. metrics-collector hook fires automatically.
    vii. 3 rejection rounds → DEADLOCK-bootstrap.md, halt (PRD §9.6.1).
```

**Conformance check:** Whether HIGH/MEDIUM/LOW path was taken, the ONLY way `local.bootstrapped` lands in `events.jsonl` is via the metrics-collector hook firing on PreToolUse:Write of `local.yaml`. The dispatcher, the bootstrap script, and any spawned agents do NOT write to events.jsonl directly. If you find yourself wanting to append a metric event manually — stop. The hook owns it.

**Step 3 — Spawn `@lead` to classify feature intent** per PRD §9.5 routing taxonomy (`docs` / `template` / `hotfix` / `feature` / `review-only` / `refactor`). @lead writes its classification to `<cwd>/.claude/.orchestra/pipeline/<feature-id>/intent.yaml` with `intent`, `confidence`, `pattern`. Parent reads on idle.

**Step 4 — Confidence override (optional).** If `--confidence` flag in `$ARGUMENTS`, override @lead's feature-confidence classification before downstream agents read it.

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

**Step 6 — Each artifact lands in `<project>/.claude/.orchestra/pipeline/<feature-id>/`.** Agents author their artifact frontmatter per PRD §10.5 (sections, references). The parent does NOT copy/edit those artifacts — each agent owns its outputs.

### Runtime hooks (these fire automatically — DO NOT replicate manually)

The orchestra plugin registers 5 hooks in `hooks/hooks.json`. Claude Code invokes them on the corresponding lifecycle events without any model action. Do not attempt to log events manually, hash frontmatter manually, or replicate any hook's work in your output.

| Hook | Event | What fires |
|---|---|---|
| `metrics-collector` | UserPromptSubmit | Logs `prompt.submitted` with `matched_orchestra: true` to `<cwd>/.claude/.orchestra/metrics/events.jsonl`. Fires the moment the user submits the `/orchestra` prompt — before Step 1 of your action list. |
| `hash-stamper` | PreToolUse:Write\|Edit\|MultiEdit | Stamps `sections:` and resolves `references[].hash-at-write: TBD` in artifact frontmatter when writing under `<project>/.claude/.orchestra/**/*.md`. Note: hooks attach to the parent context's tool calls; subagent writes may bypass this hook, which is why agents author `sections:` and `references:` blocks explicitly per PRD §10.5. |
| `pre-write-check` | PreToolUse:Write\|Edit\|MultiEdit | Blocks writes containing detectable secrets (8 patterns: AWS keys, GitHub PATs, JWTs, etc.). Exits 2 (blocking) on hit. |
| `val-calibration` | PreToolUse:Task\|Agent | Injects `<calibration-anchor>` block into subagent-spawn prompts where `subagent_type === "evaluator"`. The matcher is `Task\|Agent` so it fires on both legacy (`Task`) and canonical (`Agent`) tool names. |
| `post-bash-lint` | PostToolUse:Bash | Surfaces source-modifying Bash commands (`npm install`, `sed -i`, etc.) to stderr. Observer; never blocks. |
| `metrics-collector` | PreToolUse:Task\|Agent / PreToolUse:TeamCreate / PreToolUse:Skill / PreToolUse:Write\|Edit\|MultiEdit / PreToolUse:mcp__orchestra-* / SubagentStop / Stop | Logs `task.subagent.invoked` (with `agent_name` + `team_name` + `prompt_summary` enrichment), `team.created` (team boundary), `skill.invoked` (skill name + args summary — captures the decision-laden moments of a feature run), `local.bootstrapped` (on local.yaml writes), `artifact.written` (any pipeline write — feature_id + artifact_type + file_name; for `intent.yaml` writes, also extracts `intent` / `confidence` / `pattern` into the event for insight-tracker semantics), `mcp.tool.called`, `subagent.stopped`, `session.stopped`. **Goal**: events.jsonl alone reconstructs the full smoke trace; no need to read Claude Code's session jsonl to debug a run. |

If the model finds itself wanting to write to `events.jsonl` directly, or compute sha256 hashes for artifact frontmatter manually — stop. The hooks own those concerns. Your job is the action steps above.

### AskUserQuestion budget

Each spawned agent applies the §8.11 question budget per its own body. Three rejection rounds in any review stage trip the circuit breaker (PRD §9.6) → `DEADLOCK-<id>.md`, halt, escalate.

## /orchestra sprint [--size N]

1. Read `<project>/.claude/.orchestra/backlog/issues/`. Default `N=3`; respect `--size N` if provided.
2. For each of the top-N issues, run the smart router as if the user had typed the issue title + body verbatim.
3. Sequence them; one feature per pipeline id; never parallel-write the same artifact (PRD §8 single-writer assumption).

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

## /orchestra help

Print usage:

```
/orchestra <natural language>   Smart router. TeamCreate → @product + @lead classify → specialists work in waves.
/orchestra sprint [--size N]    Pull N issues from .claude/.orchestra/backlog/issues/ and run as a batch (default N=3).
/orchestra release              Verify gates → write RELEASE / RUNBOOK / ANNOUNCEMENT artifacts and bump VERSION.
/orchestra commit               Conventional Commits message from `git diff --staged`. No team.
/orchestra metrics [--limit N]  Console summary of last N runs from .claude/.orchestra/metrics/runs/.
/orchestra help                 This message.
```

Flags:
- `--confidence {high,medium,low}` — override `@lead`'s confidence classification (logged).

Deferred (v1.1+): `/save`, `/load`, `/orchestra-disagree`, `/orchestra legacy`, `/orchestra resume`.
