# PRD-002 — Mid-run visibility & team shutdown

**Status:** shipped (v1.0.0; commit `a43bbb8`)
**Author:** hunghlh@vng.com.vn
**Date:** 2026-05-05
**Source:** `/sc:sc-brainstorm` session, this repo
**Supersedes:** nothing
**Closes drift against:** PRD-001.md §347 (explicit teardown), §561 (shutdown step), §627 (`SUMMARY-<timestamp>.md`)

## 1. Problem

When a user runs `/orchestra <intent>`, the parent dispatcher coordinates an 8-agent team through filesystem-coupled handoffs. Today the user has **no terminal-visible signal** for:

1. Which agent / step is currently running mid-flight.
2. Whether a `DEADLOCK-<id>.md` or `ESCALATE-<id>.md` artifact was written (the file lands silently on disk; no banner).
3. Whether the run has reached a terminal state and the team container has been released.

Compounding this, **PRD-001 §347/§561/§627 specified explicit team teardown plus a `SUMMARY-<timestamp>.md` artifact at shutdown, but neither was implemented in `commands/orchestra.md`**. The team container created by `TeamCreate` at Step 1 is never explicitly torn down.

## 2. Goals

- **G1.** Surface "which step is processing right now" in the parent's terminal output during `/orchestra <intent>` runs.
- **G2.** Surface DEADLOCK / ESCALATE artifact emission as terminal banners (not silent file writes).
- **G3.** Tear down the team container at terminal state (auto) and on user abort (manual).
- **G4.** Write a thin `SUMMARY-<id>.md` teardown receipt at every terminal state.

## 3. Non-goals

- **NOT** a new live web dashboard, CI gate, Slack notification, or any external sink. Output is to the parent's terminal only.
- **NOT** a heartbeat / stall-detection mechanism (deferred — answered "no" in brainstorm Q2).
- **NOT** a sprint-level rollup across multiple issues (deferred — out of scope of this PRD).
- **NOT** a replacement for `runs/<run-id>.json`. The SUMMARY artifact is a thin receipt, not a digest. `/orchestra metrics` continues to read `runs/*.json` unchanged.
- **NOT** an aggregation of escalations into `runs/*.json` (the live banner from G2 closes that gap; no post-hoc surface needed).

## 4. Functional requirements

### FR-1 — Status line at each transition (G1)

**The parent dispatcher prints one terminal status line at each filesystem-coupled handoff point** in `commands/orchestra.md` Step 5 spawn loop.

Required transitions (each emits one line):

- Before `Agent({ subagent_type: "<role>" })` — "spawning" line.
- After parent `Read(<artifact path>)` returns successfully — "completed" line.
- Before each `AskUserQuestion` pause (PAUSE-1..4) — "pausing for input" line.

Line shape (informative, exact wording is design-phase): role + artifact-being-produced + transition kind.

### FR-2 — Banner on DEADLOCK / ESCALATE (G2)

When the parent reads an artifact whose filename matches `DEADLOCK-*.md`, `ESCALATE-*.md`, or `ESCALATE-ARCH-*.md`, the parent prints a multi-line banner to its terminal. Banner content (informative):

- Artifact type (DEADLOCK | ESCALATE | ESCALATE-ARCH).
- Triggering agent / stage.
- Resolution status from frontmatter.
- Absolute path to the artifact for follow-up.

The banner fires **regardless of autonomy level** (DEADLOCK and ESCALATE are exception signals, not pause gates).

### FR-3 — Auto teardown at terminal state (G3)

The parent invokes `TeamDelete({ team_name })` when any of the following terminal conditions are detected after a parent `Read`:

- **Success:** `RELEASE-vX.Y.Z.md` was written by `@ship`.
- **Deadlock:** `DEADLOCK-<id>.md` exists.
- **Escalation:** `ESCALATE-<id>.md` or `ESCALATE-ARCH-<id>.md` exists with `resolution: abandoned`.

Auto teardown fires **after** FR-4 SUMMARY write, never before.

### FR-4 — Thin SUMMARY artifact (G4)

At every terminal state (success, deadlock, escalation-abandoned, manual abort via FR-5), the parent writes `<cwd>/.claude/.orchestra/pipeline/<feature-id>/SUMMARY-<feature-id>.md`.

Required frontmatter fields (thin — receipt only, NOT a digest):

```yaml
---
artifact_type: SUMMARY
feature_id: <id>
team_name: <team-name>
started_at: <ISO-8601>
ended_at: <ISO-8601>
duration_seconds: <int>
terminal_state: success | deadlock | escalated | aborted
artifact_count: <int>
---
```

Body is a 1–3 line plain-text closing note. **No** verdict copy-out, **no** escalation list, **no** drift summary — those stay in `runs/<run-id>.json` and the source artifacts. Thin = receipt.

### FR-5 — Manual `/orchestra shutdown` subcommand (G3)

A new subcommand parsed in the dispatcher's argument-parse block:

- `/orchestra shutdown` — shuts down the most recently active orchestra team in this cwd.
- `/orchestra shutdown <feature-id>` — shuts down the team for a specific feature_id (open question OQ-2).

Behavior:

1. Locate the active team_name (open question OQ-2).
2. Write `SUMMARY-<id>.md` with `terminal_state: aborted`.
3. Invoke `TeamDelete({ team_name })`.
4. Print confirmation line to terminal.

If no active team is found, print "no active orchestra team to shut down" and exit cleanly (not an error).

### FR-6 — `team.shutdown` metrics event

The `metrics-collector` hook emits a `team.shutdown` event to `events.jsonl` on `PreToolUse:TeamDelete`, mirroring the existing `team.created` event on `PreToolUse:TeamCreate`. Fields: `team_name`, `terminal_state`, `feature_id`. Privacy posture identical to `team.created`.

## 5. Non-functional requirements

- **NF-1 — No polling.** Status lines piggyback on the existing idle-notification + parent-Read flow. No new timers or heartbeats.
- **NF-2 — Privacy preserved.** Status lines and banners contain agent role names + artifact filenames + frontmatter fields only. No prompt content, no user message text. Matches `manifest.json.redact_prompts` posture.
- **NF-3 — Backward compatible.** `runs/<run-id>.json` schema unchanged. `/orchestra metrics` output unchanged. New SUMMARY artifact does not alter routing taxonomy whitelists; it is parent-authored, not agent-authored.
- **NF-4 — No new tier additions.** Tier sets (T-A / T-B / T-C) are unchanged. `TeamDelete` is invoked only by the parent (dispatcher), never by spawned agents — same scope as `TeamCreate`. `test-agents.js` tier validation continues to pass unchanged.
- **NF-5 — Terminal output only.** No file output beyond `SUMMARY-<id>.md` and the existing `events.jsonl` append.

## 6. User stories & acceptance criteria

### US-1 — Live progress visibility

> As a user running `/orchestra <intent>`, I want a one-line update at each stage transition so I know which step is currently processing.

**Acceptance:** A real `/orchestra <feature>` run produces ≥ 1 status line per agent invocation in the parent's terminal stream, observable without reading `events.jsonl` or `.orchestra/` files.

### US-2 — Exception visibility

> As a user, when an agent escalates or the run deadlocks, I want a banner in my terminal — not just a silent file on disk.

**Acceptance:** A test scenario that synthesizes a `DEADLOCK-test.md` write produces a multi-line banner in the parent terminal containing the artifact type, triggering stage, and absolute file path.

### US-3 — No leaked teams

> As a user, when my run ends, I want the team container freed automatically so I'm not leaking resources between runs.

**Acceptance:** After `RELEASE-vX.Y.Z.md` is written, `events.jsonl` contains a `team.shutdown` event for the run's team_name within the same parent turn.

### US-4 — Clean abort

> As a user, when I want to bail mid-run, I want `/orchestra shutdown` to tear down the team cleanly.

**Acceptance:** Invoking `/orchestra shutdown` mid-run writes `SUMMARY-<id>.md` with `terminal_state: aborted`, fires `TeamDelete`, and prints confirmation. Re-running `/orchestra <intent>` afterward starts a fresh team.

### US-5 — Closure receipt

> As a user, after any run ends, I want a single `SUMMARY-<id>.md` file as a "what happened here" pointer.

**Acceptance:** Every terminal state (success, deadlock, escalated, aborted) produces exactly one `SUMMARY-<feature-id>.md` under the feature's pipeline directory with the FR-4 frontmatter populated.

## 7. Open questions for design phase

- **OQ-1.** Status line / banner exact format: prefixes, indentation, color, multi-line vs single-line. Defer to `/sc:sc-design`.
- **OQ-2.** `/orchestra shutdown` team discovery: should "active team" be inferred from the most recent `team.created` event in `events.jsonl` lacking a matching `team.shutdown`, or should it require a `feature-id` argument? Trade-off: convenience vs ambiguity when multiple runs are active.
- **OQ-3.** `ESCALATE-*.md` with `resolution: pending` vs `resolution: abandoned` — does pending escalation auto-shutdown, or does it leave the team container open while the user resolves? FR-3 currently says shutdown only on `resolution: abandoned`; confirm at design time.
- **OQ-4.** `terminal_state` enum extensibility: success | deadlock | escalated | aborted today; future modes (e.g., `interrupted` from external signal) — does the schema reserve room?
- **OQ-5.** Should `team.shutdown` event include `duration_seconds` and `artifact_count` (mirror of SUMMARY frontmatter), or stay minimal (team_name + terminal_state only)?

## 8. Out of scope (deferred to future PRDs)

> **Migrated to canonical site.** See [`docs/BACKLOG.md`](BACKLOG.md). Heartbeat / stall-detection → BL-0007 (killed per PRD-004 §3.1). Sprint-level rollup → BL-0022 (deferred). External sinks → BL-0008 (killed). The `runs/*.json` SUMMARY-based-digest rejection (per Q5 "thin enough") is documented in §3 non-goals; not a backlog item.
