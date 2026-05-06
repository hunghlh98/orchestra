---
name: release-plugin
description: Plugin-developer release workflow — bump VERSION, run smoke chain, author CHANGELOG, commit, tag, push. Use when cutting a new orchestra plugin release. Not for consumer projects.
---

# /release-plugin dispatcher

Twelve-step procedure for cutting an orchestra plugin release. Mirrors what `/orchestra release` does for consumer-project releases, but operates on the plugin repo itself.

> **Audience:** orchestra plugin maintainers. If you are a CONSUMER of the plugin (using `/orchestra <intent>` to develop your own project), use `/orchestra release` for your project's release flow — this command is for releasing the plugin itself.

## Invariants

- **Never bump VERSION manually.** Use `scripts/bump-version.js` (atomic 3-file update of VERSION + package.json + .claude-plugin/plugin.json). Manual edits cause `validate.js` to fail on the `VERSION === plugin.json.version` consistency check, which kills the diagnostic loop.
- **Never author CHANGELOG before the consumer-install smoke chain runs green.** The 8 CI validators check internal invariants but do NOT compare against Claude Code's actual plugin/marketplace schemas. Install-time failures only surface in the interactive 5-step chain. Pre-smoke CHANGELOG = pre-doc-rot.
- **Never `git push` or `git tag` from inside this command.** This command DRAFTS artifacts and verifies gates; the user runs `git tag` / `git push` / marketplace publish manually.

## Twelve-step procedure

### Step 1 — Verify branch state

```bash
git status                     # clean working tree
git log --oneline -5           # commits to ship are present + reviewed
find . -name 'DEADLOCK-*.md'   # zero results expected
```

If any DEADLOCK files exist anywhere in the repo, halt — resolve before releasing.

### Step 2 — Run the validator chain

```bash
npm test
```

All 12 suites must be green: `validate.js`, `test-hooks.js`, `test-hash-stamper.js`, `test-scaffold.js`, `test-validate-extensions.js`, `test-agents.js`, `test-bash-strip.js`, `validate-drift.js`, `test-removability.js`, `test-metrics.js`, `test-bootstrap.js`, `test-probe.js`. Any FAIL halts the release.

### Step 3 — Run the streamline fixture

```bash
bash scripts/test-streamline-fixture.sh
```

Expected: `fixture smoke: PASS`. Includes orphan-type smoke gate (rejects `*-VERDICT.md`, `*-CODE-REVIEW.md`, `ANNOUNCEMENT-*.md`, `*-IMPL-*.md`, `*-CODE-DESIGN-*.md` anywhere in repo).

### Step 4 — Run the 5-step consumer install smoke chain (INTERACTIVE)

This step requires an interactive Claude Code session. It cannot be automated end-to-end. Run each substep and confirm the expected output before proceeding.

| # | Command | Expected |
|---|---|---|
| (a) | `claude plugin validate .` | offline schema check on `.claude-plugin/marketplace.json` passes |
| (b) | `/plugin marketplace add /absolute/path/to/clone` | local marketplace registers; no follow-up prompts |
| (c) | `/plugin install <name>@<marketplace-name>` | plugin clones from `source.repo`; deep `plugin.json` schema validates |
| (d) | `/orchestra help` | command surface loads; usage block prints |
| (e) | `git init` throwaway dir + `/orchestra <intent>` | bootstrap creates `local.yaml` + `metrics/events.jsonl`; first feature dir under `pipeline/` emits the v2 canon (CHARTER, PRD, FRS, etc. + lockfiles) |

If ANY step fails: STOP. Do not proceed to bump or CHANGELOG. The 12 internal validators do not catch install-time issues.

### Step 5 — Decide version bump per SemVer

Per `https://semver.org/spec/v2.0.0.html`:

- **MAJOR** — breaking changes (artifact-canon removals, frontmatter shape changes, no migration). Example: v1 → v2.
- **MINOR** — new functionality, backward-compatible. Example: adding a new agent or skill that consumers can opt into.
- **PATCH** — bug fixes only. No new surface. No behavior changes for existing consumers.

Default per project `CLAUDE.md`: PATCH bump. Override only when the change shape genuinely warrants MINOR or MAJOR.

### Step 6 — Atomic version bump

```bash
node scripts/bump-version.js <new-semver>
# Example: node scripts/bump-version.js 2.0.1
```

Updates VERSION + package.json + .claude-plugin/plugin.json in one shot. Surgical regex on the JSON `"version"` field preserves all other formatting + key order. Verifies semver shape (rejects `1.0` or `not-a-version`).

**Verify alignment immediately after:**

```bash
cat VERSION
grep '"version"' package.json .claude-plugin/plugin.json
```

All three values must match the new semver. (If they don't, something went wrong with the script — investigate before proceeding.)

### Step 7 — Author CHANGELOG entry

In `CHANGELOG.md`:

1. Cut a new section: `## [<new-semver>] — <YYYY-MM-DD>` immediately below the current `## [Unreleased]` heading (and above the prior `## [<old-semver>]` section).
2. Move all content currently under `## [Unreleased]` into the new `## [<new-semver>]` section.
3. Reset `## [Unreleased]` to a fresh placeholder (`(no entries yet — placeholder for post-<new-semver> work)` or similar).
4. Format the new entry per Keep a Changelog: `### BREAKING` / `### Added` / `### Changed` / `### Removed` bullet groups. Reference PR commits, files touched, behavior delta.

For MAJOR releases, include a topology summary at the top of the entry (what surface area changed, what's no longer supported, migration story if any).

### Step 8 — Re-run the validator chain

```bash
npm test
```

Confirms the CHANGELOG `## [<new-semver>]` section satisfies `validate.js`'s consistency check (CHANGELOG must contain `## [<VERSION>]` OR `## [Unreleased]`).

### Step 9 — Commit

Two-commit shape recommended:

```bash
git add VERSION package.json .claude-plugin/plugin.json
git commit -m "chore(v<new-semver>): bump VERSION to <new-semver> via scripts/bump-version.js"

git add CHANGELOG.md
git commit -m "docs(v<new-semver>): CHANGELOG ## [<new-semver>] entry"
```

This separates the mechanical bump (auditable, reversible) from the human-authored release notes.

### Step 10 — Tag (manual, user-driven)

```bash
git tag v<new-semver>
```

The plugin uses `v<semver>` tag prefix. Confirm with `git tag --list` after.

### Step 11 — Push (manual, user-driven)

```bash
git push origin master
git push origin v<new-semver>
```

Or push tags atomically: `git push --follow-tags origin master`.

### Step 12 — Marketplace publish (manual, user-driven)

If the plugin is registered in a public marketplace, the publish step depends on the marketplace's specific procedure. For a GitHub-hosted marketplace, the published tag is sufficient — `claude plugin install <name>@<marketplace>` clones the latest tag.

## Cross-references

- `scripts/bump-version.js` — atomic 3-file version updater (Step 6).
- `scripts/test-streamline-fixture.sh` — orphan-type smoke gate (Step 3).
- `commands/orchestra.md` `/orchestra release` subcommand — analogous flow but for CONSUMER project releases (delegates to the `cut-release` skill, which spawns `@ship` to author RELEASE/RUNBOOK + CHANGELOG entries inside the consumer's `<cwd>/.claude/.orchestra/`).
- `skills/cut-release/SKILL.md` — `@ship`-orchestrated release artifact authoring (consumer-project flow).

## Failure handling

| Symptom | Action |
|---|---|
| `npm test` fails at Step 2 | Halt. Investigate test failure; re-run after fix. |
| Streamline fixture fails at Step 3 with orphan-type hit | A v1 orphan filename exists somewhere in the repo. Delete it (it should not be tracked); re-run. |
| Smoke chain step (a) fails | Marketplace JSON schema problem in `.claude-plugin/marketplace.json`. Fix per the validator's error message. |
| Smoke chain step (c) fails | Deep plugin.json schema problem. Likely a manifest field mismatch between version-bump and plugin definition. Halt; do not proceed. |
| `bump-version.js` reports `invalid semver` | Bad input. Use `MAJOR.MINOR.PATCH` shape (optionally `-prerelease` or `+build`). |
| `bump-version.js` reports `parse failed (.../plugin.json)` | The plugin.json has a syntax error. Fix the JSON, then re-run. |
| `npm test` fails at Step 8 with `VERSION ≠ plugin.json.version` | bump-version.js partial-write recovery needed. Inspect all three files; re-run `bump-version.js <correct-semver>`. |
