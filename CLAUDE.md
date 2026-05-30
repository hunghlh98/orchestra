# CLAUDE.md — orchestra plugin (maintainer)

See @README.md for what orchestra ships. This file is **plugin-authoring discipline** for this repo.

Canonical references:

- Plugin-authoring rule set (R1-R14): `docs/plugin-authoring.md`.
- Orchestra `/orchestra` dispatch contract (S1-S9): `docs/dispatch-strategy.md`.
- Consumer orchestra-rules template (written to `<ctx>/.orchestra/claude-md/orchestra.md` and `@`-imported from `<ctx>/CLAUDE.md` via `mcp__orchestra-utils__claude_md`): `hooks/references/consumer-claude-md.template.md`.
- Audit-trail body grammar + row format + action enum: `schemas/pipeline-artifact.schema.md#changelog-block`.

## Two surfaces

| Surface | Paths | Lifetime |
|---|---|---|
| Consumer (ships) | `agents/*.md`, `commands/*.md`, `skills/*/SKILL.md` + `references/` + `scripts/`, `hooks/scripts/*.js` + `hooks/lib/*.js`, `mcp-servers/*.js`, `schemas/*.{schema.json,schema.md}`, `manifests/*.json`, `plugin.json`, `package.json`, `README.md`, `CHANGELOG.md` | consumer machine |
| Developer (never ships) | `docs/`, `scripts/`, `manifests/` source files only | dev-only |

A consumer install has **no `docs/`, no top-level `scripts/`**.

**Forbidden in consumer surface**:

- `§X.Y` pointer into a `docs/` file (`per v4.0-brief §6`, `(v4.0-design §7.16)`).
- Version stamps on current-state rules (`# /orchestra dispatcher (v4.0)`, `the v4.2 two-field set`).
- Migration narration (`The v4.1 X field is GONE in v4.2`).

**Allowed in consumer surface**:

- Domain nouns the plugin teaches (`PRD-NNN.md`, `FRS-NNN.md`, `TDD-NNN.md`, `TSR-NNN.md`, `SAD.md`, `ADR-NNNN-<slug>.md`, `openapi.yaml`, `clientapi.yaml`, `asyncapi.yaml`, `run-plan.md`, `inventory.md`).
- Cross-references between consumer artifacts (`agents/architect.md` → `commands/orchestra.md`).
- References into `schemas/`.
- File-shaped references inside the consumer's project (`<cwd>/.orchestra/<service>/local.yaml`).
- Skill `origin:` attribution for upstream-cloned skills.

Dev-trace cites belong in: `CHANGELOG.md`, commit messages, PR descriptions, `docs/`, comments under `scripts/`.

## Authoring discipline

- **Tight imperative; no storytelling.** Rule = one imperative clause + minimal qualifier. Justifications → CHANGELOG / commit body.
- **Split lines for scannability.** Multi-clause rules → separate paragraphs or `**<Name>.** <action>` bullets.
- **Upsert into existing files** when overlap >~50%. Preserve voice.
- **Fold up, don't sprinkle.** Trust canonical rule blocks; don't restate "DO NOT do X" at every call site.
- **Briefs describe target state.** No prose narrating what got removed / renumbered / folded — that's the commit body.
- **Schemas carry shape only.** Types, enums, anchors. No version annotations, no `$comment` blocks, no duplicated brief rule tables.
- **Before touching >5 files or removing features.** Post a brief plan and wait for go-ahead.

## Plugin-pipeline rules

- **Blank-install assumption.** orchestra applies to blank installs. No migration gates, no schema unions, no parallel old/new paths — update files in place.
- **C4 zoom continuity.** Container = zoom of one Context system. Component = zoom of one Container. Mindset, not just tooling.
- **`docs/` is dev-only.** Methodology notes, session reports, planning docs never go elsewhere — and never into the user's private second-brain vault.
- **`docs/` artifacts link only to other `docs/` artifacts.** No codebase paths, no external URLs.
- **Business code carries no chain-artifact cites.** Consumer business code (`<consumer>/src/**`) must not embed `FR-N` / `AC-N` / `C-N` / `S-XXX-NNN` / PRD / FRS / TDD / ADR references. Traceability lives in commits / PRs / TSR. Enforced by `pre-write-check.js` `chain-cite-reject` gate.
- **Audit-trail conformance.** Consumer chain artifacts under `<consumer>/docs/**/*.md` carry a mandatory `## Changelog` block. Any new consumer-shipped surface that authors / mutates chain artifacts must emit the matching changelog row in the SAME write as the `status:` flip. Grammar + producer-surface obligations table: `docs/plugin-authoring.md` audit-trail section + `schemas/pipeline-artifact.schema.md#changelog-block`.

## Release workflow

CHANGELOG is **derived from the commit log**, not hand-written.

**Feature-commit cycle** (per unit of work):

1. **Author** — implement (code, prose, schema).
2. **Human review** — user reviews staged diff.
3. **Commit** — [Conventional Commits 1.0.0](https://www.conventionalcommits.org/en/v1.0.0/). `<type>(<scope>): <description>` line is the source of the eventual CHANGELOG row; `!` / `BREAKING CHANGE:` carry the SemVer effect. AI-authored commits append `Co-Authored-By: Claude Code` as the last line.

**Release-prep cycle** (cutting a version):

4. **Version + CHANGELOG** — read `git log <prev-tag>..HEAD`, group by Conventional Commits type (`feat` → Added, `fix` → Fixed, `refactor`/`perf` → Changed, `!` / `BREAKING CHANGE:` → Breaking), compute SemVer bump as `max(semver-effect)`, author the CHANGELOG entry (extract, don't re-narrate), then `node scripts/bump-version.js <semver>`.
5. **Human review** — CHANGELOG entry + three bumped files.
6. **Commit** — `chore(release): vX.Y.Z` bundling CHANGELOG + version-file changes.

Smoke is post-release-commit, user-driven. Not a pre-commit gate.

## Version bumps

- `node scripts/bump-version.js <semver>` (explicit version, e.g. `5.2.12` — keywords like `patch` are rejected) atomically updates `VERSION` + `package.json` + `.claude-plugin/plugin.json` + `.claude-plugin/marketplace.json` and re-renders the README canonical tables. Never hand-edit those four.
- Default to **PATCH** unless explicitly told otherwise.
