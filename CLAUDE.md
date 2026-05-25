# CLAUDE.md — orchestra plugin (project-local)

See @README.md for what orchestra is. This file is **plugin-authoring discipline** for this repo.

## Rules

- **Two surfaces, never mix them.** Consumer surface (`agents/`, `commands/`, `skills/`, `schemas/`, `hooks/`) MUST NOT cite developer surface (`docs/`, `manifests/`, `scripts/`) by `§`-anchor or markdown link. Inline the rule, drop the cite.
- **No version stamps in consumer surface.** Plugin version lives only in `plugin.json` + `VERSION` + `package.json`. No `v4.0`, `(v4.2)`, "X is GONE in v4.Y" inside `agents/` / `commands/` / `skills/` / `schemas/`. Fix shape: strip the stamp, keep the rule.
- **Fold up, don't sprinkle.** When a rule lives canonically (e.g., `## Invariants` block at the top of `commands/orchestra.md`), trust it. Don't add inline "DO NOT do X" reminders at every call site.
- **Tight imperative; no storytelling.** Rule statement = one imperative clause + minimal qualifier. Cut exposition tails. Justifications go in `CHANGELOG.md` / commit body.
- **Split lines for scannability.** Multi-clause rules render as long visual lines. Break into separate paragraphs, labelled `**<Name>.** <action>` paragraphs, or bullets when enumerating ≥2 constraints.
- **Upsert into existing files.** New content overlapping an existing memory or consumer-surface file by >~50% → edit the existing file, not a new one. Preserve voice.
- **Consumer CLAUDE.md is shared rules.** General Claude / agent discipline for consumer projects lives in `hooks/references/consumer-claude-md.template.md` (spliced via `mcp__orchestra-utils__claude_md`). Orchestra-pipeline-specific rules stay in `commands/orchestra.md` / `agents/*`.
- **Bump version only via script.** `node scripts/bump-version.js <major|minor|patch>` atomically updates `VERSION` + `package.json` + `.claude-plugin/plugin.json`. Never hand-edit these three.
- **Default to PATCH bumps** unless explicitly told otherwise.
- **CHANGELOG is derived from commit log.** Group commits by Conventional Commits type into Added / Fixed / Changed / Breaking. Extract; do not re-narrate.
- **Before touching >5 files or removing features.** Post a brief plan and wait for go-ahead.
- **`docs/` is dev-only.** Methodology notes, session reports, planning docs never go elsewhere — and never into the user's private second-brain vault.
- **`docs/` artifacts link only to other `docs/` artifacts.** No codebase paths, no external URLs.
- **Schemas carry shape only.** Types, enums, anchors. No version annotations, no `$comment` blocks, no duplicated brief rule tables.
- **Briefs describe target state.** Edit history belongs in the commit body. Don't narrate what got removed / renumbered / folded.
- **Business code carries no chain-artifact cites.** Consumer business code (`<consumer>/src/**`) must not embed `FR-N` / `AC-N` / `C-N` / `S-XXX-NNN` / PRD / FRS / TDD references.
- **Blank-install assumption.** orchestra applies to blank installs. No migration gates, no schema unions, no parallel old/new paths — update files in place.
- **C4 zoom continuity.** Container = zoom of one Context system. Component = zoom of one Container. Mindset, not just tooling.
- **Audit-trail conformance.** Consumer-project chain artifacts under `<consumer>/docs/**/*.md` carry a mandatory `## Changelog` body block (yaml variants use `# Changelog:`); body-grammar + row format + action enum live in `schemas/pipeline-artifact.schema.md`. Enforced by `pre-write-check.js` `changelog-append-only` gate + `mcp__orchestra-utils__{amend_locked_artifact,relock_artifact}`. Maintainer scope: any new consumer-shipped surface that authors / mutates consumer chain artifacts must conform. Does NOT apply to orchestra's own `docs/`.
- **Plugin-authoring rules live in `docs/plugin-authoring.md`** (R1-R14). The three-layer architecture (knowledge / navigation / orchestration) is the central insight: knowledge in ONE canonical skill; navigation skills publish triggers + delegate; agents orchestrate workflows without storing facts.

## Surface inventory

| Surface | Paths | Lifetime |
|---|---|---|
| Consumer (ships) | `agents/*.md`, `commands/*.md`, `skills/*/SKILL.md` + `references/` + `scripts/`, `hooks/scripts/*.js` + `hooks/lib/*.js`, `mcp-servers/*.js`, `schemas/*.{schema.json,schema.md}`, `manifest.json`, `plugin.json`, `package.json`, `README.md`, `CHANGELOG.md` | loaded on consumer machine |
| Developer (never ships) | `docs/`, `scripts/`, `manifests/*.json` | dev-only |

A consumer install has **no `docs/`, no `manifests/`, no `scripts/`**.

### Forbidden in consumer surface

- Any `§X.Y` pointer into a `docs/` file: `per v4.0-brief §6`, `(v4.0-design §7.16)`, `per S-AUTONOMY-001`.
- Version stamps on current-state rules: `# /orchestra dispatcher (v4.0)`, `the v4.2 two-field set`, `(only SAD in v4.2)`.
- Migration narration: `The v4.1 X field is GONE in v4.2`, `v4.0 dropped — emit Y directly`.

### Allowed in consumer surface

- Domain nouns the plugin teaches: `PRD-NNN.md`, `FRS-NNN.md`, `TDD-NNN.md`, `TSR-NNN.md`, `SAD.md`, `ADR-NNNN-<slug>.md`, `openapi.yaml`, `asyncapi.yaml`, `run-plan.md`, `inventory.md` — artifact-type names in the consumer's own project.
- Cross-references between consumer artifacts: `agents/architect.md` → `commands/orchestra.md`, `skills/write-contract/SKILL.md`.
- References into `schemas/`.
- File-shaped references inside the consumer's project: `<cwd>/.claude/.orchestra/pipeline/<id>/...`, `local.yaml`.
- Skill `origin:` attribution for upstream-cloned skills (e.g., `origin: SpillwaveSolutions/plantuml@MIT`).

### Where dev-trace cites SHOULD go

`CHANGELOG.md`, commit messages, PR descriptions, code review comments, files under `docs/`, comments in `scripts/`.

### Fix shape

- ❌ `Confidence-tier the dialogue per v4.0-brief §7.4: HIGH = no questions, MEDIUM = 1, LOW = 2–3.`
- ✅ `Confidence-tier the dialogue: HIGH = no questions, MEDIUM = 1, LOW = 2–3.`

When lifting prose from `docs/<dev-draft>.md` into consumer surface, scrub every `(see §X)` and inline what the section says.

## Release workflow

CHANGELOG is **derived from the commit log**, not hand-written.

**Feature-commit cycle** (per unit of work):

1. **Author** — implement (code, prose, schema).
2. **Human review** — user reviews staged diff.
3. **Commit** — `skills/commit-message` (Conventional Commits 1.0.0). `<type>(<scope>): <description>` line is the source of the eventual CHANGELOG row; `!` / `BREAKING CHANGE:` carry the SemVer effect.

**Release-prep cycle** (cutting a version):

4. **Version + CHANGELOG** — read `git log <prev-tag>..HEAD`, group by Conventional Commits type (`feat` → Added, `fix` → Fixed, `refactor`/`perf` → Changed, `!` / `BREAKING CHANGE:` → Breaking), compute SemVer bump as `max(semver-effect)` per the `skills/commit-message` type table, author the CHANGELOG entry (extract, don't re-narrate), then `node scripts/bump-version.js <semver>`.
5. **Human review** — CHANGELOG entry + three bumped files.
6. **Commit** — `chore(release): vX.Y.Z` bundling CHANGELOG + version-file changes.

Smoke is post-release-commit, user-driven. Not a pre-commit gate.

## Audit-trail conformance (maintainer contract)

Maintainer obligation when authoring or modifying consumer-shipped surfaces that produce or mutate consumer-project chain artifacts. Body-grammar canonical home: `schemas/pipeline-artifact.schema.md#changelog-block`.

| Surface | When | Action |
|---|---|---|
| `agents/*.md` author-write | Forward chain / reverse-pass initial artifact creation | Emit `created` row |
| `agents/*.md` section update on draft artifact | Section author updates a `status: draft` artifact | Emit `revised` row |
| `mcp-servers/orchestra-utils.js > amend_locked_artifact` | Dispatcher unlocks for ratify-spec amendment | Emit `unlocked` row + flip `status: locked → revision_requested` in one write |
| `agents/architect.md` on `task: ratify-spec-amend` | Architect re-authors the unlocked artifact | Emit `ratify-spec-amend` row |
| `mcp-servers/orchestra-utils.js > relock_artifact` | Dispatcher re-locks after amendment | Emit `re-locked` row + flip `status: revision_requested → locked` in one write |
| Dispatcher on fix-source closure | Source-side fix closes a divergence | Emit `fix-source` row |
| Dispatcher on full regenerate (rare; user-driven) | User-requested full artifact rebuild | Emit `regenerated` row |
| `hooks/scripts/pre-write-check.js` `changelog-append-only` gate | Any `Write` / `Edit` to a chain artifact | Reject mutations / removals of existing rows |

**Applying when authoring a new component**:

- New agent that authors `docs/**/*.md`: Deliverables section requires `## Changelog` as first body section with row `- <ISO-8601> | created by @<self> | <intent>`.
- New MCP tool that mutates a locked artifact: write the matching changelog row in the SAME write as the `status:` flip — never separate writes.
- New hook touching chain artifacts: respect the `changelog-append-only` gate; do not write into `## Changelog` unless implementing a new producer surface above.

## Plugin authoring

For any change to plugin component structure, apply the declarative rule set in `docs/plugin-authoring.md` (R1-R14).

### Quick map

- **R1** — manifest (`.claude-plugin/plugin.json`)
- **R2** — agents (`agents/*.md`)
- **R3** — skills (`skills/<name>/SKILL.md` + `references/` + `scripts/` + `assets/`)
- **R4** — commands (`commands/*.md`)
- **R5** — hooks (`hooks/hooks.json` + `hooks/<name>/` runtime tree)
- **R6** — output styles (`output-styles/*.md`)
- **R7** — rules (`rules/<topic>.md`, always-on)
- **R8** — CLAUDE.md (maintainer memory; does not ship)
- **R9-R14** — cross-cutting (three-layer architecture, commit / changelog discipline, version-bump script).

### Three-layer architecture

- **Knowledge layer** — ONE canonical skill per topic. orchestra: `business-analysis`, `clean-architecture`, `clean-code`, `c4-architecture`, `qa-test-planner`, `java-development`.
- **Navigation layer** — every other skill publishes trigger keywords + decision trees + delegates to knowledge; stores no facts.
- **Orchestration layer** — agents run workflows; do not store facts; invoke skills via `skills:` frontmatter.

Pairs with **Two surfaces**: a new skill (R3) still must not cite `§X.Y` into `docs/plugin-authoring.md` — `docs/` is dev-only.

<!-- orchestra:start -->
This project uses **orchestra** for SDLC orchestration. The chain owns spec / architecture / test docs in `docs/`; your edits live in `src/**`.

## Rules

- **No chain-artifact cites in business code.** `src/**` must not embed `PRD §N` / `FRS §N` / `TDD §N` / `openapi §N` / `TSR §N` / `FR-N` / `AC-N` / `S-<TAG>-NNN` / `ADR-NNNN §N`. Traceability lives in commits, PRs, and TSR `S-EVAL-001` / `S-REVIEW-001`. `pre-write-check.js` `chain-cite-reject` gate rejects violations.
- **Append-only feature graph.** New behavior = new `<feature-id>` with `depends_on:` edges in `.orchestra/<service_name>/features.yaml`. Never edit existing locked PRDs in place. Successor features carry `supersedes: [<old-id>]`; predecessor `status:` stays user-controlled (no auto-flip). Manifest writes only via `mcp__orchestra-utils__upsert_features_yaml` — never hand-edited. Graph is intra-service; cross-service relationships are not modelled.
- **Batch independent writes.** N independent file writes (multiple `.puml`, per-feature singletons, per-service singletons) → N parallel `Write()` calls in ONE message.
- **Batch independent spawns.** Inter-feature, intra-feature fan-out, within-agent per-unit → ONE Agent-tool-call message with N spawns.
- **Single-writer surfaces stay sequential.** SAD `S-CONTAINERS-001`, `business-invariants.md`, `inventory/adr/index.md`, `local.yaml`, `features.yaml`.
- **Don't trample chain-owned dirs.** `docs/` and `.orchestra/` are chain-written; mutate via the chain, not by hand.
- **ADRs are append-only.** Supersede; do not delete.

## Source of truth

- Behavior specs: `docs/<service_name>/<feature-id>/<feature-id>-PRD.md` (problem / scope), `<feature-id>-FRS.md` (FR / AC). `<feature-id>` = `<short-service-name>-<NNN>-<slug>` (e.g., `order-001-checkout`).
- Architecture: `docs/SAD.md` and `docs/adr/ADR-NNNN-*.md`.
- API contracts: `docs/<service_name>/<feature-id>/<feature-id>-openapi.yaml` (or `<feature-id>-asyncapi.yaml`).
- Test plans + verdicts: `docs/<service_name>/<feature-id>/<feature-id>-TSR.md`.
- Runtime config: `.orchestra/<service_name>/local.yaml`.
- Feature manifest: `.orchestra/<service_name>/features.yaml` (intra-service DAG of `<feature-id>` nodes with `depends_on:` / `supersedes:` edges).

## Workflow

- Entry shapes:
  - `/orchestra spec-to-code` — greenfield forward chain (PRD → FRS → SAD → ADR → TDD → openapi → code).
  - `/orchestra code-to-spec` — brownfield reverse chain (docs from existing source). Optional second token: `system` | `service:<name>`.
  - `/orchestra <intent>` — freeform router (e.g., `/orchestra add user authentication`). Reverse-then-forward on brownfield; forward-only on greenfield. Dispatcher classifies tech vs business; tech-path skips spec authoring.
  - `/orchestra` — usage block, no chain.
- Decisions cache to `.orchestra/<service_name>/local.yaml` on first run; re-runs skip the questionnaire.
- Pipeline coordination state lives at `.orchestra/<service_name>/pipeline/<feature-id>/`.
<!-- orchestra:end -->
