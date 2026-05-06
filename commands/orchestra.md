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

Two model-emitted dispatcher channels (NOT hook output): single-line status updates at filesystem-coupled transitions, and multi-line banners on exception artifacts. No ANSI, no emoji.

| Event | Format |
|---|---|
| Before `Agent({ subagent_type: "<role>" })` | `[orchestra] spawn @<role> → <artifact-target>` |
| After parent `Read(<path>)` returns | `[orchestra] read  @<role> wrote <filename>` |
| Before `AskUserQuestion` pause | `[orchestra] pause PAUSE-<N>: <one-line question>` |
| Terminal state (Step 7) | `[orchestra] shutdown <terminal_state> feature=<feature-id> duration=<Ns>` |

Banner template — fires after parent `Read` returns an artifact whose basename matches `DEADLOCK-*.md`, `ESCALATE-*.md`, or `ESCALATE-ARCH-*.md` (at every autonomy level):

```
============================================================
[orchestra] <ARTIFACT_TYPE> detected
  triggered_by_<stage|agent>: <value-from-frontmatter>
  resolution: <value-from-frontmatter>
  path: <absolute path to artifact>
============================================================
```

The `metrics-collector` hook captures structurally-equivalent events for replay; status lines + banners are the user's live signal.

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

**Step 4b — `--think` / `--delegate` flag gate.** If `$ARGUMENTS` contains `--think` or `--delegate`, require `intent.intent ∈ {feature, refactor}`. Otherwise emit `[orchestra] warn --think|--delegate ignored on intent=<intent>` and clear the flags before Step 5. (`--delegate` implies `--think` — both flags trigger the PLAN scaffold; `--delegate` adds the user-choice gate after `@lead` fills PLAN.) The flags are no-ops on `docs`, `template`, `hotfix`, `review-only` intents because those have no `@lead` design step to surface options for.

**Step 5 — Spawn the workflow agents per the routing taxonomy.** Spawn ONLY the agents listed for the classified intent, in order. Each transition:

(a) **Pre-spawn scaffold (v2.0+).** For each artifact in the next agent's whitelist that does NOT yet exist on disk, run `Bash(node ${CLAUDE_PLUGIN_ROOT}/scripts/scaffold-artifact.js <type> <feature-id-or-flag> [<slug>] [--mode=full|brief])`. Examples: `scaffold-artifact CHARTER 001-foo foo --mode=full` for `@product` on a feature intent; `scaffold-artifact PRD 001-foo foo` next; `scaffold-artifact FRS 001-foo foo` next. The dispatcher (this context) has Bash; agents do not. Each scaffold call writes the artifact body (with locked anchors + FILL placeholders), the paired `<artifact>.lock.yaml` (with seeded sections + diagrams[]), and stub `.puml` source files for any required diagrams. Idempotent — re-running on an existing artifact exits 2 unless `--force` is passed.

(a') **PLAN scaffold (one-shot; only when `--think` is set, per Step 4b).** Before the FIRST `@lead` spawn for this feature, run `Bash(node ${CLAUDE_PLUGIN_ROOT}/scripts/scaffold-artifact.js PLAN <feature-id>)`. This writes `<feature-dir>/planning/<NNN>-PLAN.md` with 5 anchored FILL spans (S-PROBLEM-001 / S-OPTIONS-001 / S-TRADEOFFS-001 / S-RECOMMENDATION-001 / S-OPEN-001). The first `@lead` spawn prompt gains the directive: `--think mode: fill <feature-dir>/planning/<NNN>-PLAN.md BEFORE TDD/CONTRACT. Author ≥3 distinct options; populate Trade-offs 1:1 with Options; pick one as the Recommendation.` PLAN scaffold runs once per `--think` cycle — re-runs are no-op (existing-artifact exit code; we do NOT pass `--force`).

(a'') **`--delegate` user choice (when `--delegate` is set, after `@lead` Writes PLAN.md).** Read `<feature-dir>/planning/<NNN>-PLAN.md`. Call `AskUserQuestion` ONCE: each numbered Option from the `S-OPTIONS-001` anchor becomes a choice; the option named in `S-RECOMMENDATION-001` is highlighted as the default. Write the user's accepted choice to `<feature-dir>/planning/PLAN.choice.yaml` as `{ chosen: <Option-letter-or-number>, source: user-delegate, accepted_at: <ISO-8601> }`. The next `@lead` spawn (TDD authorship) carries `--delegate-chose: <Option-letter>` in its prompt as the binding seed. This single AskUserQuestion call is the documented carve-out from the per-tier confidence budget (see the `AskUserQuestion budget` heading below).

(b) **Spawn agent.** Pass the scaffolded artifact path(s) in the agent's prompt so the agent can Read them. Agents fill `<!-- FILL: ... -->` spans and Write the artifact back; the hash-stamper hook fires on Write and stamps hashes into the paired lockfile.

(c) Wait for idle.

(d) Read agent's output file.

(e) Decide next.

| Intent | Agents (in order) | Whitelist anchor |
|---|---|---|
| **feature** | `@product` → `@lead` → builder → `@test` → `@evaluator` → `@reviewer` → `@ship` | `schemas/routing-taxonomy.md#feature` |
| **hotfix** | `@lead` → builder → `@test` → `@evaluator` → `@ship` | `schemas/routing-taxonomy.md#hotfix` |
| **template** | `@product` (intent only) → `@lead` → builder → `@test` → `@evaluator` → `@reviewer` | `schemas/routing-taxonomy.md#template` |
| **refactor** | `@reviewer` → `@lead` (TDD update) → builder → `@test` → `@evaluator` | `schemas/routing-taxonomy.md#refactor` |
| **docs** | `@product` (intent only) → `@ship` → `@reviewer` | `schemas/routing-taxonomy.md#docs` |
| **review-only** | `@reviewer` (assess only) | `schemas/routing-taxonomy.md#review-only` |

Full per-intent artifact whitelist lives in `schemas/routing-taxonomy.md`. Agents Read the relevant anchor when the inline summary in their spawn prompt is insufficient.

**Each spawned agent MUST be given the routed intent + whitelist pointer in its prompt.** Format:

> `Routed intent: <intent>. Authorized artifacts: see schemas/routing-taxonomy.md#<intent> (1-line summary: <agents-and-key-artifacts>). Out-of-whitelist requests → write ESCALATE-<feature_id>.md at the feature-dir root and end your turn.`

**Step 5b — Pause integration during the spawn loop.** When resolved autonomy is `DRAFT_AND_GATE`, fire `AskUserQuestion` at three transitions inside Step 5 (in addition to PAUSE-1 already fired in Step 3): **→ PAUSE-2** after `@product` writes PRD + FRS, before spawning `@lead`/builder; **→ PAUSE-3** after `@lead` writes CONTRACT, before spawning the implementer/`@test`; **→ PAUSE-4** after `@reviewer` fills the rev halves of TSR, before spawning `@ship`. Question shapes per the Pause transitions table above. On reject → write `DEADLOCK-<id>.md` and halt. For `feature` intent all 4 pauses fire; lighter intents (`docs`/`hotfix`/`template`/`refactor`/`review-only`) fire only the pauses whose preceding step actually ran (e.g., `hotfix` skips PAUSE-2 because there is no `@product` PRD/FRS).

**Step 5c — ADR open subroutine (v2.0+).** When `@reviewer` writes `ESCALATE-ADR-<slug>.md` at the feature-dir root, OR `@product` flagged a PRD `S-OPEN-001` item with `ADR-WORTHY:`, the dispatcher runs `Bash(scaffold-artifact ADR --global <slug>)` (auto-numbers next NNNN) before re-spawning `@lead` with the scaffolded ADR path in its prompt. After `@lead` Writes the proposed ADR, spawn `@reviewer` for review (3-round circuit per the `agents/lead.md` ADR-open subroutine).

**Step 6 — Each artifact lands in `<project>/.claude/.orchestra/pipeline/<feature-id>/` (or singletons under `architecture/`, `releases/`, `runbooks/`, `architecture/decisions/`).** v2.0+: the dispatcher scaffolds via Step 5(a); agents fill `<!-- FILL: -->` placeholders and Write the artifact back. Provenance auto-emits to the paired `<artifact>.lock.yaml` via the hash-stamper hook (only-when-paired). The parent does NOT copy/edit agent-authored content — each agent owns its sections per `schemas/pipeline-artifact.schema.md` and the single-writer-per-section discipline in `verify/<NNN>-TSR.md`.

**Step 7 — Terminal-state detection + closure.** After every parent `Read` in Step 5, evaluate the just-read artifact's basename:

- `RELEASE-vX.Y.Z.md` → `terminal_state = "success"`
- `DEADLOCK-*.md` (incl. `DEADLOCK-ADR-*.md`) → `terminal_state = "deadlock"`
- `ESCALATE(-ARCH|-ADR)?-*.md` with frontmatter `resolution: abandoned` → `terminal_state = "escalated"`
- otherwise → continue Step 5 spawn loop

On terminal state:

1. Parent `Write(<feature-dir>/SUMMARY-<feature-id>.md, ...)` per `schemas/pipeline-artifact.schema.md` SUMMARY shape: `team_name`, `started_at` (the team.created timestamp from earlier in this run; fallback to first matching `team.created` in events.jsonl), `ended_at` (now), `duration_seconds`, `terminal_state`, `artifact_count`. Body: 1–3 line plain-text closing note. SUMMARY is parent-authored bookkeeping at terminal state — narrowly carved exception to the Coordination-protocol "no parent artifact writes" rule, because no agent is in scope after teardown begins.
2. Parent `TeamDelete()` (zero-param primitive — team is implicit from current session context; failure mode: throws on active members, but Orchestra's filesystem-coupled flow has SubagentStop drain members synchronously by the time terminal state is detected).
3. Emit closing status line per `## Status output`.

### Runtime hooks

5 hooks registered in `hooks/hooks.json`; full event taxonomy in `docs/HOOKS.md` (dev-surface). Hooks own their events per `## Invariants` above — do not replicate hook side effects.

| Hook | Events (matchers) | Side effect |
|---|---|---|
| `metrics-collector` | UserPromptSubmit / PreToolUse:Task\|Agent\|TeamCreate\|TeamDelete\|Skill\|Write\|Edit\|MultiEdit\|mcp__orchestra-* / SubagentStop / Stop | Logs lifecycle events to `<cwd>/.claude/.orchestra/metrics/events.jsonl` |
| `hash-stamper` | PreToolUse:Write\|Edit\|MultiEdit | Stamps `sections:` hashes + resolves `references[].hash-at-write: TBD` for pipeline artifacts |
| `pre-write-check` | PreToolUse:Write\|Edit\|MultiEdit | Blocks writes with detectable secrets (8 patterns); exits 2 |
| `val-calibration` | PreToolUse:Task\|Agent | Injects `<calibration-anchor>` block into `@evaluator` spawn prompts |
| `post-bash-lint` | PostToolUse:Bash | Surfaces source-modifying Bash to stderr (observer; never blocks) |

### AskUserQuestion budget

Each spawned agent applies its own confidence-tier question budget per its body. Three rejection rounds in any review stage trip the circuit breaker → `DEADLOCK-<id>.md`, halt, escalate.

**`--delegate` carve-out (v2.2.0+).** When `--delegate` is set on `/orchestra` or `/orchestra sprint` (per Step 4b), the dispatcher fires exactly one `AskUserQuestion` after `@lead` Writes PLAN.md (Step 5(a'')). This call is OUTSIDE the per-agent confidence budget — it is a user-elicited fork choice over the PLAN's `S-OPTIONS-001` anchor, not a clarification round. It does NOT count toward the 3-rejection circuit breaker. There is no other `--delegate` AskUserQuestion in the run.

## /orchestra sprint [--size N]

1. Read `<project>/.claude/.orchestra/backlog/issues/`. Default `N=3`; respect `--size N` if provided.
2. For each of the top-N issues, run the smart router as if the user had typed the issue title + body verbatim.
3. Sequence them; one feature per pipeline id; never parallel-write the same artifact (single-writer assumption).

## /orchestra release

Cuts release artifacts after gate verification. Algorithm: invoke the `cut-release` skill — it verifies gates (`confirmed: false` / drift-on-confirmed / failing CONTRACT criterion → halt), spawns `@ship` to author RELEASE / RUNBOOK / ANNOUNCEMENT, and drafts the release commit message via `commit-work`. User commits + tags manually. Smoke-test the consumer install path BEFORE this subcommand per `feedback_smoke-before-release-docs` discipline.

## /orchestra commit

No team. Direct invocation of the `commit-work` skill: produces a Conventional Commits message from `git diff --staged`. Empty staged diff → stop with "nothing is staged". User runs `git commit` themselves (no auto-commit).

## /orchestra metrics [--limit N]

Console summary of recent runs from `<cwd>/.claude/.orchestra/metrics/runs/`. Default `N=10`. Privacy-safe (per-run summary JSONs only).

```bash
python3 ${CLAUDE_PLUGIN_ROOT}/scripts/metrics-summary.py --metrics-dir <cwd>/.claude/.orchestra/metrics ${LIMIT_FLAG}
```

## /orchestra resume [<feature-id>]

Resume an interrupted feature run. Algorithm: invoke the `resume-pipeline` skill with optional `<feature-id>`. The skill walks `pipeline/*/` dirs, finds the next non-`done` task (deriving T-A status from verdict frontmatter, T-B from artifact existence, T-C from row Status), and respawns the owner with idempotent re-write semantics. Returns `{terminal_state, feature_id}` to the dispatcher; on `terminal_state == "(continued)"` the dispatcher continues per Step 5 of the smart router. Otherwise the dispatcher runs Step 7 closure (SUMMARY + TeamDelete).

Status lines per `## Status output`: `[orchestra] resume scanning pipeline/` → `[orchestra] resume target=<feature-id>` → `[orchestra] resume next-task=T-<id> owner=@<role>`, then the standard spawn/read lines for each subsequent agent.

## /orchestra shutdown

In-session manual abort. Algorithm: invoke the `shutdown-team` skill. The skill writes `SUMMARY-<feature-id>.md` with `terminal_state: aborted` and calls `TeamDelete()` (zero-param primitive — team is implicit from current session). The `<feature-id>` argument form is rejected — current session has at most one active team. The skill performs Step 7 closure inline; the dispatcher does NOT need to run it separately.

No active team in this session → skill emits `[orchestra] no active orchestra team in this session — shutdown is a no-op` and exits without a SUMMARY write.

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
