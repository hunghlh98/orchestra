---
name: cut-release
description: "Drafts release artifacts (RELEASE/RUNBOOK/ANNOUNCEMENT) and the release commit message after gate verification. Use when the dispatcher invokes /orchestra release. User runs git tag/push manually."
origin: orchestra
---

# cut-release

Drafts release artifacts after verifying gates. Does NOT execute git operations — the user runs `git tag` / `git push` themselves after reviewing drafts.

## When to use

Invoked by the dispatcher when the user types `/orchestra release`. Smoke-test the consumer install path BEFORE invoking (see Pre-flight below).

## Algorithm

1. **Verify gates.** Walk all artifacts in scope. Halt with the failing artifact path on any of:
   - `confirmed: false` (in artifact's lockfile `sections:`) on a section required by its type per `schemas/pipeline-artifact.schema.md`.
   - `drift-on-confirmed` (validate-drift output).
   - Failing CONTRACT criterion: `verify/<NNN>-TSR.md` frontmatter `eval_verdict: FAIL`, OR `eval_score < CONTRACT.passing_score`, OR any `critical: true` row in `S-EVAL-TABLE-001` shows FAIL.
   - Reviewer block: TSR frontmatter `rev_verdict: REQUEST_CHANGES`.
   - Open `DEADLOCK-*.md` or `DEADLOCK-ADR-*.md` anywhere under `pipeline/`.

2. **Spawn `@ship` to author release artifacts.**
   - `releases/RELEASE-vX.Y.Z.md` — version, date, summary, included PRs/features, gates cleared, **plus `S-ANNOUNCEMENT-001`** (one-paragraph public-facing announcement; v2.0 folded the standalone ANNOUNCEMENT artifact into RELEASE).
   - `runbooks/RUNBOOK-vX.Y.Z.md` — only if topology changed (new service, new dependency, new env var, migration).
   - `verify/<NNN>-TSR.md` `S-SHIP-001` — ALLOW / HOLD decision plus rationale, set after gate verification.

3. **Draft release commit message** by invoking the `commit-work` skill. `@ship` gets the staged diff and produces the Conventional Commits message.

4. **Hand off to the user.** The user runs `git commit` / `git tag` / `git push` themselves. This skill does NOT auto-commit or auto-tag.

## Pre-flight (load-bearing)

Smoke-test the consumer install path BEFORE this skill writes any release artifact. RELEASE / RUNBOOK / ANNOUNCEMENT artifacts authored without smoke-test parity are pre-doc-rot.

The 5-step chain (canonical version in `agents/ship.md` workflow Step 1):

- (a) `claude plugin validate .` — offline schema check on `marketplace.json`.
- (b) `/plugin marketplace add /absolute/path/to/clone` — registers local marketplace.
- (c) `/plugin install <plugin-name>@<marketplace-name>` — clones from `source.repo`, validates `plugin.json` deep schema.
- (d) `/orchestra help` — command surface loads.
- (e) bootstrap test on a throwaway `git init` directory — `/orchestra <intent>` creates `local.yaml` + `metrics/events.jsonl`.

If any step fails: STOP. Do not invoke this skill. The CI validators verify project-internal invariants but do NOT compare against Claude Code's actual plugin or marketplace schemas; install-time failures only surface here.

## Return contract

Returns to the dispatcher with:

- `{terminal_state: "success", release_artifacts: [<paths>]}` after `@ship` finishes.
- `{terminal_state: "halted", failing_artifact: <path>}` if step 1 hits an open gate.
