# Smoke-test 5-step Chain (canonical pre-release check)

> Reference loaded by `@ship` as Step 1 of its workflow when invoked via the `cut-release` skill (dispatcher dispatches `/orchestra release`). The 8 CI validators verify the project's self-described invariants (skill body cap, agent tier-tools, etc.) but do NOT compare against Claude Code's actual plugin or marketplace schemas; install-time failures only surface here.

Run BEFORE authoring any release artifact. If ANY step fails: **STOP. Do not proceed to RELEASE / RUNBOOK / ANNOUNCEMENT authorship.**

## The 5 steps

1. **`claude plugin validate .`** — offline schema check on `.claude-plugin/marketplace.json`.
2. **`/plugin marketplace add /absolute/path/to/clone`** — registers local marketplace, validates marketplace.json shape at runtime.
3. **`/plugin install <plugin-name>@<marketplace-name>`** — clones from `source.repo`, validates `plugin.json` deep schema. This is the only place `plugin.json`'s full schema is enforced.
4. **`/orchestra help`** — command surface loads. Verifies the dispatcher and registered subcommands are intact.
5. **Bootstrap test on a throwaway `git init` directory** — `/orchestra <intent>` creates `local.yaml` + `metrics/events.jsonl`. Verifies the bootstrap flow is functional end-to-end.

## Failure mode history

Lessons learned from v1.0.0 prep:

- Missing `marketplace.json` was caught only at step (a), post-doc-authorship.
- `plugin.json` schema drift was caught only at step (c), post-doc-authorship.

Both failure modes invalidated authored RELEASE / RUNBOOK / ANNOUNCEMENT artifacts because they were written before the smoke chain ran. **Lesson:** the smoke chain is not optional and not deferrable — it gates artifact authorship, not just publication.

## Why CI validators are insufficient

The project's CI matrix (`scripts/test-agents.js`, `scripts/validate.js`, `scripts/test-streamline-fixture.sh`) checks invariants the project authored about itself:

- agent tier-tools alignment (test-agents.js)
- artifact frontmatter conformance (validate.js)
- consumer-surface citation hygiene + word counts (test-streamline-fixture.sh)

These do NOT call Claude Code's plugin loader, marketplace registry, or schema validators. The 5-step chain above is the canonical mechanism for invoking those external validators — running them in their actual context, not against project-internal mocks.

## When this is invoked

`@ship` Reads this file as Step 1 of its workflow when the dispatcher invokes `/orchestra release` (which routes through the `cut-release` skill). The reference is also load-bearing for the project-level `feedback_smoke-before-release-docs` discipline (memory-stored): smoke-test BEFORE writing release docs, not after.
