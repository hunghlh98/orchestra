---
name: shutdown-team
description: "In-session manual abort of the active /orchestra team. Writes SUMMARY-<id>.md with terminal_state: aborted, then TeamDelete(). Use when the dispatcher invokes /orchestra shutdown."
origin: orchestra
---

# shutdown-team

In-session only. `TeamDelete()` operates on the current session's implicit team context — cross-session targeting is structurally impossible per the Claude Code primitive contract.

## When to use

Invoked by the dispatcher when the user types `/orchestra shutdown`. Signals "I want to stop this in-flight run cleanly without waiting for terminal state."

## Algorithm

1. **Verify active orchestra team in this session.** If the current session did not invoke `/orchestra <intent>` and is not bound to an orchestra team, print `[orchestra] no active orchestra team in this session — shutdown is a no-op` and exit 0. No SUMMARY write.

2. **Resolve `feature_id`** from the dispatcher's own conversation state (the in-flight `/orchestra <intent>` run that started in this session). Fallback if context was compacted: read the latest `intent.yaml` `artifact.written` event for the current `run_id` from `<cwd>/.claude/.orchestra/metrics/events.jsonl` and lift `feature_id`.

3. Parent `Write(<feature-dir>/SUMMARY-<feature-id>.md, ...)` with `terminal_state: aborted` per the Step 7 frontmatter shape in `commands/orchestra.md`. SUMMARY is parent-authored bookkeeping at terminal state — narrowly carved exception to the Coordination-protocol "no parent artifact writes" rule, because no agent is in scope after teardown begins.

4. Parent `TeamDelete()`. Zero-param primitive — team is implicit from current session context. Failure mode: throws on active members, but the filesystem-coupled flow has SubagentStop drain members synchronously by the time the user invokes `/orchestra shutdown`.

5. Emit confirmation per `commands/orchestra.md ## Status output`: `[orchestra] shutdown aborted feature=<feature-id>`.

## Argument handling

The `<feature-id>` argument form is rejected — the current session has at most one active team. If `/orchestra shutdown <feature-id>` is invoked and the argument matches the in-session feature_id, treat it as a no-arg call; if it doesn't match, error with `[orchestra] argument feature-id mismatch with active session`.

## Return contract

The skill returns to the dispatcher with `{terminal_state: "aborted", feature_id}` after step 5 emits, or `{terminal_state: "no-op"}` after step 1's no-team early exit. The dispatcher does NOT need to run Step 7 closure separately — this skill performs the SUMMARY write + TeamDelete inline.
