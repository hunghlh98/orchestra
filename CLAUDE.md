# CLAUDE.md — orchestra plugin (project-local)

See @README.md for what orchestra is. This file is **plugin-authoring discipline** for this repo.

## Rules

- **Two surfaces, never mix them.** Consumer surface (`agents/`, `commands/`, `skills/`, `schemas/`, `hooks/`) MUST NOT cite developer surface (`docs/`, `manifests/`, `scripts/`) by `§`-anchor or markdown link. Inline the rule, drop the cite.
- **No version stamps in consumer surface.** Plugin version lives only in `plugin.json` + `VERSION` + `package.json`. No `v4.0`, `(v4.2)`, "X is GONE in v4.Y" inside `agents/` / `commands/` / `skills/` / `schemas/`. Fix shape: strip the stamp, keep the rule.
- **Fold up, don't sprinkle.** When a rule lives canonically (e.g., `## Invariants` block at the top of `commands/orchestra.md`), trust it. Don't add inline "DO NOT do X" reminders at every call site.
- **Tight imperative; no storytelling.** Rule statement = one imperative clause + minimal qualifier. Cut exposition tails ("never reach this branch", "an engineer outside the user's context can decode"). Justifications go in `CHANGELOG.md` / commit body.
- **Split lines for scannability.** Multi-clause rules render as long visual lines. Break into separate paragraphs, labelled `**<Name>.** <action>` paragraphs, or bullets when enumerating ≥2 constraints.
- **Upsert into existing files.** New content overlapping an existing memory or consumer-surface file by >~50% → edit the existing file, not a new one. Preserve the file's existing voice.
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

## Two surfaces, never mix them

The repo has two surface classes. They look similar (markdown / JS in the same checkout) but they have **different audiences and different lifetimes**.

### Consumer surface — ships to anyone who installs the plugin

- `agents/*.md` — loaded into Claude Code's agent registry on the consumer's machine
- `commands/*.md` — loaded as slash-command bodies
- `skills/*/SKILL.md` (and `references/`, `scripts/` under each skill) — loaded when a skill is invoked
- `hooks/scripts/*.js`, `hooks/lib/*.js` — executed as hook handlers on the consumer's machine
- `schemas/*.schema.json`, `schemas/*.schema.md` — normative shape for manifests + pipeline artifacts; consumer agents reference these directly
- `manifest.json`, `plugin.json`, `package.json`
- `README.md`, `CHANGELOG.md` (visible in install but informational)

### Developer surface — exists only in this repo, never ships

- `docs/` — current major-version planning, living dev references, methodology
- `scripts/` — build / CI / release tooling
- `manifests/install-modules.json`, `manifests/runtime-toggles.json`, `manifests/known-models.json` — CI-validated registries; not loaded by Claude Code at runtime

A consumer who installs orchestra has **no `docs/`, no `manifests/`, no `scripts/`** — only the consumer surface.

### Forbidden in `agents/`, `commands/`, `skills/`, `schemas/`

- `per v4.0-brief §6`, `(v4.0-design §7.16)`, `per S-AUTONOMY-001`, or any `§X.Y` pointer into a `docs/` file
- Anything that points the reader at `docs/<file>.md` they don't have

### Allowed

- Domain nouns the plugin teaches: `PRD-NNN.md`, `FRS-NNN.md`, `TDD-NNN.md`, `TSR-NNN.md`, `SAD.md`, `ADR-NNNN-<slug>.md`, `openapi.yaml`, `asyncapi.yaml`, `run-plan.md`, `inventory.md`. These are artifact-type names the consumer's pipeline produces in **their own** project.
- Cross-references between consumer artifacts: `agents/lead.md` may cite `agents/product.md`, `commands/orchestra.md`, or `skills/write-contract/SKILL.md`.
- References into `schemas/`.
- File-shaped references inside the consumer's project: `<cwd>/.claude/.orchestra/pipeline/<id>/...`, `local.yaml`.

### Why

1. **Phantom anchors.** A cite like "per PRD §8.11" reads as authoritative, but `docs/PRD-001.md` is not present in the consumer install. The LLM hallucinates to fill the gap, or downgrades confidence because it can't resolve the source.
2. **Dead tokens.** Every leaky cite costs tokens on every load and gives the consumer session zero behavioral lift.
3. **Drift hazard.** When the dev doc renumbers, the consumer-surface cite silently goes stale — and consumers can't notice.

### How to apply

The fix shape is **inline the rule, drop the cite**.

- ❌ `Confidence-tier the dialogue per v4.0-brief §7.4: HIGH = no questions, MEDIUM = 1, LOW = 2–3.`
- ✅ `Confidence-tier the dialogue: HIGH = no questions, MEDIUM = 1, LOW = 2–3.`

If the rule isn't already inline next to the cite, copy the relevant 1–3 sentences from `docs/<file>.md` into the consumer artifact, then drop the cite.

### Authoring consumer surface from a dev-surface draft

When lifting prose from `docs/v4.0-brief.md` (or any dev-surface draft) into `agents/` / `commands/` / `skills/`, scrub every `(see §X)` and `§X.Y` pointer and inline what the section actually says. Pasting an anchor that cannot resolve in a consumer install creates the same phantom-anchor failure as writing a fresh leaky cite.

## Where dev-trace cites SHOULD go

The brief / design anchors are valuable — just not in shipped artifacts. Cite freely in:

- `CHANGELOG.md` entries
- Commit messages and PR descriptions
- Code review comments
- Other files in `docs/`
- Comments in build / CI tooling under `scripts/`

These all have audiences who DO have access to `docs/`.

## Update discipline — no annotation creep

When updating consumer-facing prompts or any file in this repo:

- Do NOT add inline "DO NOT do X manually" reminders, "Note: …" annotations, or rule restatements alongside the change.
- If a load-bearing rule already lives elsewhere (e.g., the `## Invariants` block at the top of `commands/orchestra.md`, the body-grammar section in `schemas/pipeline-artifact.schema.md`), trust it and do NOT re-state it inline.
- If the rule does NOT exist yet, add it ONCE in the canonical spot — not next to every place it applies.

Each repetition of "the hook owns this" / "the model must NOT do X" is a tax on every consumer load AND leaks into model narration when explanatory style is on. The fix shape is **fold up, don't sprinkle**.

## No version stamps or migration narration in consumer surface

Plugin version is canonical in `.claude-plugin/plugin.json` (kept in sync with `VERSION` and `package.json` by `scripts/bump-version.js`). Consumer-shipped prose MUST NOT carry version stamps or migration narration alongside rules — those are dead tokens at best and stale-at-write at worst.

### Forbidden

- **Version stamps on current-state rules.** `# /orchestra dispatcher (v4.0)`, `the v4.2 two-field set`, `(only SAD in v4.2)`, `In v4.0 the contract IS…`, `Frontmatter (v2.0 slim):`. The rule reads identically without the stamp.
- **Migration narration.** `The v4.1 sad_scope field is GONE in v4.2`, `that machinery is gone in v4.0`, `v4.0 dropped — emit openapi.yaml directly`, `pre-v4.1 carryover fields`. This describes what *used to be* — consumers don't have the prior state to compare against.
- **Self-referential revision history in prose.** `v4.0 revision: 3 (was 2 in v2.0; v3 was a rev-only bump)`. The schema's `revision:` frontmatter field already carries this.

### Allowed

- Skill `origin:` attribution metadata (e.g., `origin: SpillwaveSolutions/plantuml@MIT (cloned for orchestra v2.0.0; examples/ trimmed)`) — provenance for an upstream-cloned skill, not orchestra-version stamping.
- Worked code examples that happen to use semver (e.g., `order-domain v2.1.0` illustrating release-granularity in `skills/clean-architecture/SKILL.md`) — hypothetical user-domain versions.
- `CHANGELOG.md`, commit messages, files under `docs/`, comments in `scripts/`.

### Why

1. **Single source of truth.** The bump script atomically updates `VERSION` + `package.json` + `plugin.json`. Stamps in prose drift the moment that script runs.
2. **Migration narration is dev-trace.** "X is GONE in v4.2" is edit history; it belongs in `CHANGELOG.md` + commit log + `docs/`.
3. **Phantom version anchors.** A stamp like `(v4.2)` reads as authoritative — but consumers can't cross-check it against what they installed.

### How to apply

The fix shape is **strip the stamp, keep the rule**:

- ❌ `# /orchestra dispatcher (v4.0)` → ✅ `# /orchestra dispatcher`
- ❌ `Canonical shape is schemas/system.schema.json. The v4.2 two-field set lives at…` → ✅ `Canonical shape is schemas/system.schema.json. The two-field set lives at…`

If a real migration is happening, document it in `CHANGELOG.md` and the commit message — never in the consumer rule the prior shape used to live under.

## Release workflow

CHANGELOG is **derived from the commit log**, not hand-written. The release flow has two cycles:

**Feature-commit cycle** (repeats per unit of work):

1. **Author** — implement the change (code, prose, schema, etc.).
2. **Human review** — user reviews the staged diff.
3. **Commit** — message per `skills/commit-message` (Conventional Commits 1.0.0). The `<type>(<scope>): <description>` line is the source of the eventual CHANGELOG row; `!` / `BREAKING CHANGE:` carry the SemVer effect.

**Release-prep cycle** (runs when cutting a version):

4. **Version + CHANGELOG** — read commits since the last release tag (`git log <prev-tag>..HEAD`), group by Conventional Commits type (`feat` → Added, `fix` → Fixed, `refactor`/`perf` → Changed, any `!` or `BREAKING CHANGE:` → Breaking), compute the SemVer bump as `max(semver-effect)` per the `skills/commit-message` type table, author the CHANGELOG entry from those groups (extract, don't re-narrate), then run `node scripts/bump-version.js <semver>`.
5. **Human review** — user reviews the generated CHANGELOG entry + the three bumped files.
6. **Commit** — `chore(release): vX.Y.Z` bundling the CHANGELOG + version-file changes.

**Smoke** is post-release-commit, user-driven. Not a pre-commit gate. CI validators check orchestra-internal invariants but not Claude Code's plugin / marketplace schemas; if manifest-shape drift slips past human review, the smoke loop catches it at user-run time.

Why commit-derived: hand-authoring duplicates work the commit log already encodes, and drifts as the diff evolves. Conventional Commits gives commit messages machine-readable shape; the CHANGELOG becomes a deterministic projection of the log between two tags. Skip the duplication.

<!-- orchestra:start -->
This project uses **orchestra** for SDLC orchestration. The chain owns spec / architecture / test docs in `docs/`; your edits live in `src/**`.

## Source of truth

- Behavior specs: `docs/<feature-id>/<feature-id>-PRD.md` (problem / scope), `<feature-id>-FRS.md` (FR / AC). `<feature-id>` = `<NNN>-<slug>` (e.g., `001-todo-api`).
- Architecture: `docs/SAD.md` and `docs/adr/ADR-NNNN-*.md`.
- API contracts: `docs/<feature-id>/<feature-id>-openapi.yaml` (or `<feature-id>-asyncapi.yaml`).
- Test plans + verdicts: `docs/<feature-id>/<feature-id>-TSR.md`.
- Runtime config: `.orchestra/<service_name>/local.yaml`.

## src/ discipline (hook-enforced)

- Do not embed `PRD §N` / `FRS §N` / `TDD §N` / `openapi §N` / `TSR §N` cites in `src/**`.
- Do not embed `FR-N` / `AC-N` / `S-<TAG>-NNN` / `ADR-NNNN §N` in `src/**`.
- Traceability lives in commits, PRs, and TSR `S-EVAL-001` / `S-REVIEW-001` — not in business code.
- The plugin's `pre-write-check.js` Gate-D rejects writes that violate this rule.

## Workflow

- Entry shapes:
  - `/orchestra spec-to-code` — greenfield forward chain (PRD → FRS → SAD → ADR → TDD → openapi → code).
  - `/orchestra code-to-spec` — brownfield reverse chain (docs from existing source). Optional second token: `system` | `service:<name>`.
  - `/orchestra <intent>` — freeform router (e.g., `/orchestra add user authentication`). Reverse-then-forward on brownfield; forward-only on greenfield.
  - `/orchestra` — usage block, no chain.
- Decisions cache to `.orchestra/<service_name>/local.yaml` on first run; re-runs skip the questionnaire.
- Pipeline coordination state lives at `.orchestra/<service_name>/pipeline/<feature-id>/`.

## Don't trample

- `docs/` and `.orchestra/` are chain-written; mutate via the chain, not by hand.
- ADRs are append-only; supersede, do not delete.
<!-- orchestra:end -->
