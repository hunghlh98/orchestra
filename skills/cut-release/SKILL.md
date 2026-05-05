---
name: cut-release
description: "Drafts release artifacts (RELEASE/RUNBOOK/ANNOUNCEMENT) and the release commit message after gate verification. Use when the dispatcher invokes /orchestra release. User runs git tag/push manually."
origin: orchestra
---

# cut-release

Drafts the release artifacts after verifying gates. Does NOT execute git operations — the user runs `git tag` / `git push` themselves after reviewing the drafts.

## When to use

Invoked by the dispatcher when the user types `/orchestra release`. Smoke-test the consumer install path BEFORE invoking this skill (see Pre-flight below).

## Algorithm

1. **Verify gates.** Walk all artifacts in scope for the release. Halt with the failing artifact path on any of:
   - `confirmed: false` on a section that is required by its artifact type per `schemas/pipeline-artifact.schema.md`
   - `drift-on-confirmed` (validate-drift output)
   - Failing CONTRACT criterion (verdict `FAIL` on a `critical: true` row, or aggregate `weighted_score < passing_score`)

2. **Spawn `@ship` to author release artifacts.**
   - `releases/RELEASE-vX.Y.Z.md` — version, date, summary, included PRs/features, gates cleared.
   - `runbooks/RUNBOOK-vX.Y.Z.md` — only if topology changed (new service, new dependency, new env var, migration).
   - `ANNOUNCEMENT-<id>.md` — one sentence, link to RELEASE.

3. **Draft release commit message** by invoking the `commit-work` skill. `@ship` gets the staged diff and produces the Conventional Commits message.

4. **Hand off to the user.** The user runs `git commit` / `git tag` / `git push` themselves. This skill does NOT auto-commit or auto-tag.

## Pre-flight (load-bearing)

Smoke-test the consumer install path BEFORE this skill writes any release artifact. Per the project's `feedback_smoke-before-release-docs` discipline, RELEASE/RUNBOOK/ANNOUNCEMENT artifacts authored without smoke-test parity verification are pre-doc-rot.

The 5-step chain (canonical version in `agents/ship.md` workflow Step 1):
- (a) `claude plugin validate .` — offline schema check on `marketplace.json`
- (b) `/plugin marketplace add /absolute/path/to/clone` — registers local marketplace
- (c) `/plugin install <plugin-name>@<marketplace-name>` — clones from `source.repo`, validates `plugin.json` deep schema
- (d) `/orchestra help` — command surface loads
- (e) bootstrap test on a throwaway `git init` directory — `/orchestra <intent>` creates `local.yaml` + `metrics/events.jsonl`

If any step fails: STOP. Do not invoke this skill. The 8 CI validators verify the project's self-described invariants but do NOT compare against Claude Code's actual plugin or marketplace schemas; install-time failures only surface here.

## Return contract

The skill returns to the dispatcher with `{terminal_state: "success", release_artifacts: [<paths>]}` after `@ship` finishes, or `{terminal_state: "halted", failing_artifact: <path>}` if step 1 hits an open gate.
