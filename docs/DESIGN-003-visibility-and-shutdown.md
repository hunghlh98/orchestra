# DESIGN-003 — Mid-run visibility & team shutdown

**Status:** draft
**Author:** hunghlh@vng.com.vn
**Date:** 2026-05-05
**Implements:** PRD-002 (`docs/PRD-002-visibility-and-shutdown.md`)
**Closes drift against:** PRD-001.md §347 (explicit teardown), §561 (shutdown step), §627 (`SUMMARY-<timestamp>.md`)

## 1. Scope

Implement PRD-002 FR-1 through FR-6:

- **FR-1** Status lines at each filesystem-coupled handoff in `commands/orchestra.md` Step 5.
- **FR-2** DEADLOCK / ESCALATE banners printed by the parent dispatcher.
- **FR-3** Auto `TeamDelete` at terminal state.
- **FR-4** Thin `SUMMARY-<id>.md` parent-authored closure receipt.
- **FR-5** `/orchestra shutdown [<feature-id>]` subcommand.
- **FR-6** `team.shutdown` metrics event.

## 2. Architecture summary

Three planes, each a thin extension of an existing surface:

| Plane | Surface | Change shape |
|---|---|---|
| **Model behavior** | `commands/orchestra.md` (model-executed dispatcher) | Insert status-line + banner emission at existing transition points; add Step 7 (terminal-state detection + SUMMARY write + TeamDelete); add `/orchestra shutdown` subcommand parse branch. |
| **Hook telemetry** | `hooks/scripts/metrics-collector.js` + `hooks/hooks.json` | Add `PreToolUse:TeamDelete` matcher → handler emits `team.shutdown`. Extend `artifact.written` enrichment to lift `terminal_state` from `SUMMARY-*.md` proposed content (mirrors existing `intent.yaml` extraction at metrics-collector.js:186–192). |
| **Schema** | `schemas/pipeline-artifact.schema.md` | Rewrite the existing `SUMMARY-<timestamp>.md` section (lines 262–270, PRD-001 era) with the PRD-002 thin-receipt shape. Update layout tree + type→folder map for `SUMMARY-<id>.md` at feature-dir root. |

No new tier additions. No new agents. No new files outside the three planes above (plus tests + CHANGELOG + the existing DESIGN doc you're reading).

## 3. Component design

### 3.1 Parent dispatcher (`commands/orchestra.md`)

**3.1.1 Status-line emission (FR-1)**

The dispatcher already names every transition explicitly in Step 5: `Agent({...})` spawn → idle wait → parent `Read(<path>)` → next `Agent`. Insert one model-emitted text line at each transition.

Format (single line, no ANSI, no emoji):

```
[orchestra] spawn @<role> → <artifact-target>
[orchestra] read  @<role> wrote <filename>
[orchestra] pause PAUSE-<N>: <question shape one-liner>
```

The text is emitted by the model as ordinary terminal output, NOT by a hook — status lines are a behavior of the dispatcher prompt, not an event sink. Per project CLAUDE.md "fold up don't sprinkle," the status-line contract is added once in a new `## Status output` section near the top of `commands/orchestra.md`, and Step 5 instructions reference it implicitly (no per-step restatement).

**3.1.2 Banner emission (FR-2)**

After every parent `Read(<path>)` in Step 5, the dispatcher inspects the filename. On match against `DEADLOCK-*.md`, `ESCALATE-*.md`, or `ESCALATE-ARCH-*.md`, the model emits a multi-line banner:

```
============================================================
[orchestra] <ARTIFACT_TYPE> detected
  triggered_by_<stage|agent>: <value-from-frontmatter>
  resolution: <value-from-frontmatter>
  path: <absolute path to artifact>
============================================================
```

Banner fires at all autonomy levels (these are exception signals, not pause gates).

**3.1.3 Step 7 — terminal-state detection + closure (FR-3, FR-4)**

A new step appended after Step 5/6. After every parent `Read`, evaluate:

```
if filename ~= /^RELEASE-v\d+\.\d+\.\d+\.md$/                      → terminal_state = "success"
elif filename ~= /^DEADLOCK-.*\.md$/                                → terminal_state = "deadlock"
elif filename ~= /^ESCALATE(-ARCH)?-.*\.md$/
       and frontmatter.resolution == "abandoned"                    → terminal_state = "escalated"
else                                                                → continue
```

On terminal state:

1. Parent `Write(<feature-dir>/SUMMARY-<id>.md, ...)` with FR-4 frontmatter populated.
2. Parent `TeamDelete()` (zero-param primitive — team is implicit from current session context).
3. Emit closing status line: `[orchestra] shutdown <terminal_state> feature=<feature-id> duration=<Ns>`.

**Note on parent-authored SUMMARY.** The dispatcher discipline at `commands/orchestra.md:42` ("Do NOT write artifacts from the parent context") is preserved by carving out SUMMARY as **bookkeeping, not a pipeline artifact** — same category as `runs/<run-id>.json` (hook-authored). Add one sentence to the existing Coordination Protocol block: "Exception: SUMMARY is parent-authored at terminal state because no agent is in scope after teardown begins."

**3.1.4 `/orchestra shutdown` subcommand (FR-5) — in-session only**

This tightens PRD-002 FR-5 from "most recent active in this cwd" to "current session only" because `TeamDelete()` is a zero-parameter primitive that operates on the implicit current-session team context. Cross-session targeting is structurally impossible per the Claude Code primitive contract.

Add to the argument-parse block at line 17:

```
- shutdown → run /orchestra shutdown flow
```

Flow:

1. **Verify the current session has an active orchestra team.** If the current session did not invoke `/orchestra <intent>` and is not bound to an orchestra team, print `[orchestra] no active orchestra team in this session — shutdown is a no-op` and exit 0. No SUMMARY write.
2. **Resolve feature_id from session context.** The dispatcher recovers `feature_id` from its own conversation state (the in-flight `/orchestra <intent>` run that started in this session). Fallback if context was compacted: read the latest `intent.yaml` `artifact.written` event for the current `run_id` from `events.jsonl` and lift `feature_id`.
3. Parent `Write(<feature-dir>/SUMMARY-<feature-id>.md, ...)` with `terminal_state: aborted`.
4. Parent `TeamDelete()`.
5. Print confirmation: `[orchestra] shutdown aborted feature=<feature-id>`.

The `<feature-id>` argument form is **rejected** in v1 — the current session has at most one active team, so there is nothing to disambiguate. If a user types `/orchestra shutdown <feature-id>` and the argument matches the in-session feature_id, treat it as a no-arg call; if it doesn't match, error with `[orchestra] argument feature-id mismatch with active session`.

**3.1.5 Help text update.** Append to `/orchestra help` (line 183) and the README usage block:
```
/orchestra shutdown [<feature-id>]   Tear down active team; write SUMMARY; mark terminal_state=aborted.
```

### 3.2 Metrics hook (`hooks/scripts/metrics-collector.js`)

**3.2.1 New handler — `team.shutdown` (FR-6)**

Insert after the `team.created` branch (line 137):

```js
if (hookEvent === "PreToolUse" && toolName === "TeamDelete") {
  return {
    ts, event: "team.shutdown", run_id,
  };
}
```

Minimal payload — `run_id` only. `TeamDelete` carries no `tool_input` (zero-param primitive verified via ToolSearch 2026-05-05), so there is nothing to lift at hook fire. `team_name` and `terminal_state` are recoverable from the immediately-preceding `artifact.written { artifact_type: "SUMMARY", team_name, terminal_state, ... }` event (joined by `run_id`).

**3.2.2 Extension — SUMMARY enrichment in `artifact.written`**

In the existing pipeline-artifact branch (line 186), add a sibling extractor for `SUMMARY-*.md` files. Mirror of the `intent.yaml` extraction pattern:

```js
if (/^SUMMARY-.+\.md$/.test(fileName)) {
  const fields = extractSummaryFields(input?.tool_input);
  if (fields.team_name) event.team_name = fields.team_name;
  if (fields.terminal_state) event.terminal_state = fields.terminal_state;
  if (fields.duration_seconds) event.duration_seconds = fields.duration_seconds;
}
```

Add `extractSummaryFields()` next to `extractIntentFields()`:

```js
function extractSummaryFields(toolInput) {
  if (!toolInput) return {};
  const candidates = [];
  if (typeof toolInput.content === "string") candidates.push(toolInput.content);
  if (typeof toolInput.new_string === "string") candidates.push(toolInput.new_string);
  if (Array.isArray(toolInput.edits)) {
    for (const e of toolInput.edits) {
      if (typeof e?.new_string === "string") candidates.push(e.new_string);
    }
  }
  const text = candidates.join("\n");
  return {
    team_name: matchField(text, /^team_name:\s*"?([A-Za-z0-9_-]+?)"?\s*$/m),
    terminal_state: matchField(text, /^terminal_state:\s*"?([a-z]+)"?/m),
    duration_seconds: matchField(text, /^duration_seconds:\s*(\d+)/m),
  };
}
```

**3.2.3 `inferArtifactType()` — no change**

The existing regex `/^([A-Z][A-Z0-9-]*?)-\d/` already captures `SUMMARY` from `SUMMARY-001-foo.md`. Verify with a unit test (see §6) but no source change needed.

### 3.3 Hooks config (`hooks/hooks.json`)

Add a new matcher block after the `TeamCreate` block (line 25):

```json
{
  "matcher": "TeamDelete",
  "hooks": [
    { "type": "command", "command": "node ${CLAUDE_PLUGIN_ROOT}/hooks/scripts/metrics-collector.js" }
  ]
}
```

### 3.4 Schema (`schemas/pipeline-artifact.schema.md`)

**3.4.1 Replace the existing `SUMMARY-<timestamp>.md` section** (lines 262–270) with the PRD-002 thin shape. Filename anchor changes from `SUMMARY-<timestamp>.md` to `SUMMARY-<id>.md` (root-level exception-file convention, mirroring `ESCALATE-<id>.md` / `DEADLOCK-<id>.md`):

```markdown
### SUMMARY-<id>.md

Parent-authored closure receipt written at every terminal state. Lives at
feature-dir root alongside `ESCALATE-<id>.md` and `DEADLOCK-<id>.md`.
Thin by design — does NOT duplicate `runs/<run-id>.json` digest content.

```yaml
team_name: orchestra-<feature-id>
started_at: <ISO-8601>
ended_at: <ISO-8601>
duration_seconds: <int>
terminal_state: success | deadlock | escalated | aborted
artifact_count: <int>
```
```

**3.4.2 Add to filename + folder layout tree** (line 33–34, alongside ESCALATE/DEADLOCK):

```
├── SUMMARY-<id>.md                  # closure receipt at terminal state
```

**3.4.3 Add to type→folder map** (line 69, the ESCALATE/DEADLOCK row):

```
| `ESCALATE`, `DEADLOCK`, `SUMMARY` | feature-dir root | `ESCALATE-001.md`, `SUMMARY-001.md` |
```

## 4. Data model

### 4.1 SUMMARY-<id>.md frontmatter (final)

```yaml
---
team_name: orchestra-<feature-id>
started_at: <ISO-8601>           # from team.created event
ended_at: <ISO-8601>             # set at write time
duration_seconds: <int>          # ended_at − started_at
terminal_state: success | deadlock | escalated | aborted
artifact_count: <int>            # count of *.md / *.yaml under <feature-dir>/ at write time
---

<1–3 line plain-text closing note. No verdicts, no escalation list, no drift summary.>
```

**No `sections:` / `references:` block.** SUMMARY is parent-authored bookkeeping, not a referenced artifact in the C4-style traceability graph. The body-grammar invariant (every H2 has `<a id="S-...">`) does not apply because SUMMARY has no H2 sections. Document this carve-out in the schema entry above so `validate.js` does not treat the absence as a violation.

### 4.2 `team.shutdown` event (final)

```json
{
  "ts": "<ISO-8601>",
  "event": "team.shutdown",
  "run_id": "<session-id>"
}
```

`team_name` intentionally absent from this event — `TeamDelete` is a zero-parameter primitive. Consumers join `run_id` against the immediately-preceding `artifact.written:SUMMARY` event to recover `team_name` + `terminal_state` + `duration_seconds`.

### 4.3 Enriched `artifact.written` for SUMMARY

```json
{
  "ts": "<ISO-8601>",
  "event": "artifact.written",
  "run_id": "<session-id>",
  "feature_id": "<id>",
  "artifact_type": "SUMMARY",
  "file_name": "SUMMARY-<id>.md",
  "tool": "Write",
  "team_name": "orchestra-<feature-id>",
  "terminal_state": "success | deadlock | escalated | aborted",
  "duration_seconds": <int>
}
```

## 5. Sequence: terminal-state detection + teardown

```
parent: Agent({ subagent_type: "ship", prompt: "...write RELEASE..." })
  → Claude Code idle notification on @ship turn end
parent: Read(.../releases/RELEASE-v1.2.0.md)
parent: detect terminal_state = "success"
parent: emit "[orchestra] read  @ship wrote RELEASE-v1.2.0.md"
parent: Write(.../pipeline/<feature-id>/SUMMARY-<id>.md)
  → hook fires: PreToolUse:Write
    → hash-stamper: stamps frontmatter (no-op for thin SUMMARY — no sections)
    → metrics-collector: emits artifact.written { artifact_type: SUMMARY, terminal_state: success, ... }
parent: TeamDelete()                                      # zero-param; implicit session team
  → hook fires: PreToolUse:TeamDelete
    → metrics-collector: emits team.shutdown { run_id }
parent: emit "[orchestra] shutdown success team=orchestra-<feature-id> duration=<Ns>"
parent: turn ends → Stop hook fires → runs/<run-id>.json written (existing flow)
```

## 6. Test plan

| File | Add | Why |
|---|---|---|
| `scripts/test-metrics.js` | (a) PreToolUse:TeamDelete → `team.shutdown` event; (b) artifact.written for `SUMMARY-001-foo.md` enriched with `terminal_state`; (c) `inferArtifactType("SUMMARY-001.md") === "SUMMARY"` regression. | Covers FR-6 + §3.2.2 enrichment + §3.2.3 inference. |
| `scripts/test-hooks.js` | Add `TeamDelete` to the known-tool-name list in the matcher validator. | Otherwise §3.3's new matcher fails the validator. |
| `scripts/test-agents.js` | No change — tier sets are unchanged. | Sanity. |
| `scripts/validate.js` (or schema validator) | Carve-out so `SUMMARY-*.md` is NOT subjected to the body-grammar `<a id>` invariant. | §4.1 explicitly opts out of the sections-anchor contract. |

A manual smoke (5-step install loop) is REQUIRED before authoring RELEASE/RUNBOOK/ANNOUNCEMENT for this feature — CI validators check our invariants, not Claude Code's plugin schemas.

## 7. Open-question resolutions

| OQ | Decision | Rationale |
|---|---|---|
| **OQ-1** Status line / banner format | Single-line `[orchestra] <verb> @<role> → <target>` for status; multi-line ASCII-rule banner for exceptions. No ANSI, no emoji. | Portable across terminals; greppable in scrollback; matches global CLAUDE.md "no emojis unless asked." |
| **OQ-2** `/orchestra shutdown` team discovery | **In-session only.** `TeamDelete()` operates on the implicit current-session team context — no targeting argument is needed or possible. `<feature-id>` arg is rejected (or treated as a no-op when it matches the in-session team). Out-of-session call is a no-op with explanatory message. | TeamDelete signature is zero-param per Claude Code primitive contract (verified 2026-05-05); cross-session targeting is structurally impossible. |
| **OQ-3** ESCALATE pending vs abandoned | Auto-shutdown only on `resolution: abandoned`. Pending leaves team alive (recoverable via SAD update + retry per existing flow). | ESCALATE-ARCH is recoverable in principle; aborting prematurely loses the SAD-update path. Abandoned is the explicit "this run is dead" signal. |
| **OQ-4** `terminal_state` enum | v1: `success \| deadlock \| escalated \| aborted`. Schema bumps `revision:` for additions. No reserved future values. | YAGNI — extending the enum later is a schema-revision bump, not a breaking change. |
| **OQ-5** `team.shutdown` event richness | Minimal: `team_name + run_id`. Terminal_state is in the immediately-preceding SUMMARY `artifact.written` event. | Events are log-shaped, not wide. Consumers that need terminal_state join on `team_name` (well-defined since SUMMARY write strictly precedes TeamDelete in §5 sequence). |

## 8. Risks & migration

| # | Risk | Mitigation |
|---|---|---|
| **R1** | Existing schema's `SUMMARY-<timestamp>.md` shape (with `run_id / agents_used / tokens`) is referenced by validators or downstream tooling. | Grep confirms no current consumer reads SUMMARY (it was never authored). Replacement is cost-free; `revision: 1 → 2` in schema header captures the change. |
| **R2** | Parent-authored SUMMARY violates the discipline at `commands/orchestra.md:42`. | Carve-out is explicit and narrow (one bookkeeping artifact at terminal state, when no agent is in scope). Document at the discipline site, not at every SUMMARY mention. |
| **R3** | `/orchestra shutdown` invoked in a session with no active orchestra team (cold start, post-shutdown re-invocation). | No-op with `[orchestra] no active orchestra team in this session` message; exit 0; no SUMMARY write. Documented in `/orchestra help`. |
| **R4** | Banner false-positive on filenames that contain `DEADLOCK` / `ESCALATE` substrings but aren't exception artifacts. | Anchored regexes (`/^DEADLOCK-.*\.md$/`) on `basename(path)`, not the full path. |
| **R5** | Status lines spam scrollback for long runs. | One line per transition (≤ 2 dozen per run for `feature` intent); banner is the only multi-line output. Acceptable for terminal-only consumer. |
| **R6** | TeamDelete primitive's exact input schema. | **Verified pre-implementation (2026-05-05) via ToolSearch:** signature is `TeamDelete()` with zero parameters; team auto-resolved from current session. Documented failure mode: throws if active members exist. Orchestra's filesystem-coupled flow ends agent turns synchronously by SubagentStop, so members are reaped by the time terminal-state is detected. Verify in §10 smoke. |

## 9. File-touch budget — IMPLEMENTATION GATE

Per project CLAUDE.md "Scope discipline" (>5 files → post brief plan + wait for go-ahead).

**Note (2026-05-05 patch):** This budget reflects post-pre-flight design corrections — the original §3.1.4 events.jsonl-scan logic was eliminated when TeamDelete's zero-parameter signature was verified, slimming file 1's edit scope by ~30 lines.

| # | File | Change scope |
|---|---|---|
| 1 | `commands/orchestra.md` | New `## Status output` section; Step 5 inline status emission cue; new Step 7 (terminal detection + SUMMARY + `TeamDelete()`); new `/orchestra shutdown` subcommand block (in-session only, no events.jsonl scan logic); help-text + flags update. **Largest risk surface.** |
| 2 | `hooks/scripts/metrics-collector.js` | New minimal `TeamDelete` branch (no `tool_input` fields to lift); new `extractSummaryFields()` extracting `team_name` + `terminal_state` + `duration_seconds`; one branch in `artifact.written` for SUMMARY enrichment. |
| 3 | `hooks/hooks.json` | One new `PreToolUse:TeamDelete` matcher block. |
| 4 | `schemas/pipeline-artifact.schema.md` | Rewrite SUMMARY section; update layout tree; update type→folder map; bump `revision:` 1 → 2. |
| 5 | `scripts/test-metrics.js` | 3 new test cases (team.shutdown, SUMMARY enrichment, inference regression). |
| 6 | `scripts/test-hooks.js` | Add `TeamDelete` to known-tools list. |
| 7 | `CHANGELOG.md` | One entry under unreleased; PATCH bump per project default. |
| 8 | `scripts/validate.js` (if applicable) | Carve-out for SUMMARY body-grammar opt-out. Verify at impl time whether validator currently checks SUMMARY. |
| 9 | `README.md` | Append `/orchestra shutdown` to the usage block. |

**9 files, exceeds the 5-file threshold.** `/sc:sc-implement` MUST post this plan and wait for explicit user go-ahead before writing edits.

## 10. Post-implementation checklist

1. Smoke-test the consumer install path on a fresh `/tmp/test-orchestra-install`: install plugin, run `/orchestra <feature>`, verify status lines appear, simulate DEADLOCK / ESCALATE / RELEASE paths, run `/orchestra shutdown` cleanly. **Verify `TeamDelete()` does NOT throw** when called after agents have ended their turns (filesystem-coupled flow assumption — synchronous SubagentStop should drain active members before terminal detection). **Required before authoring RELEASE/RUNBOOK/ANNOUNCEMENT** per memory rule.
2. Verify `events.jsonl` contains the expected event sequence (`team.created → artifact.written:SUMMARY → team.shutdown`).
3. Verify `validate.js` does not flag SUMMARY for body-grammar violation.
4. Verify `test-hooks.js` matcher validation passes with the new `TeamDelete` matcher.
5. Verify a re-run of `/orchestra <intent>` after teardown spawns a fresh team (no leaked container).

## 11. Out of scope for this design

Carried over verbatim from PRD-002 §8:

- Heartbeat / stall detection (G2 from brainstorm).
- Sprint-level rollup across multiple issues.
- External sinks (Slack / CI / web dashboard).
- SUMMARY-as-digest replacement for `runs/*.json`.
