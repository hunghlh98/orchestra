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

1. `metrics-collector` logs `prompt.submitted` with `matched_orchestra: true`.
2. Run the `project-discovery` skill → `{ has_source, primary_language, framework, scope_hints, mode }`.
3. If `<project>/.claude/.orchestra/local.yaml` is absent: greenfield/brownfield bootstrap (PRD §9.11). `@product` + `@lead` negotiate via Pattern B (one revision round). Decision lands in `local.yaml`; `@lead` appends `local.bootstrapped` to `metrics/events.jsonl`.
4. `@lead` classifies intent per PRD §9.5 routing taxonomy (`docs` / `template` / `hotfix` / `feature` / `review-only` / `refactor`).
5. `@lead` computes confidence per PRD §8.11 (5 signals → HIGH/MEDIUM/LOW). The user may override with `--confidence high|medium|low` (logged as `confidence.user-override`).
6. Pick dialogue pattern per PRD §9.4: A linear (HIGH), B one-revision (MEDIUM), C wave team (LOW).
7. `TeamCreate` instantiates the 8-agent team for the run.
8. Agents work in waves per their role (PRD §9.5). Artifacts written to `<project>/.claude/.orchestra/pipeline/<id>/`.
9. Each artifact write triggers `hash-stamper` → frontmatter section hashes stamped (PRD §8.13).
10. `metrics-collector` logs `session.stopped` at end.

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
