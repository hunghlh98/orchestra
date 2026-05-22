# CLAUDE.md — orchestra plugin (project-local)

See @README.md for what orchestra is. This file is **plugin-authoring discipline** for this repo.

## Rules

- **Two surfaces, never mix them.** Consumer surface (`agents/`, `commands/`, `skills/`, `schemas/`, `hooks/`) MUST NOT cite developer surface (`docs/`, `manifests/`, `scripts/`) by `§`-anchor or markdown link. Inline the rule, drop the cite.
- **No version stamps in consumer surface.** Plugin version lives only in `plugin.json` + `VERSION` + `package.json`. No `v4.0`, `(v4.2)`, "X is GONE in v4.Y" inside `agents/` / `commands/` / `skills/` / `schemas/`. Fix shape: strip the stamp, keep the rule.
- **Fold up, don't sprinkle.** When a rule lives canonically (e.g., `## Invariants` block at the top of `commands/orchestra.md`), trust it. Don't add inline "DO NOT do X" reminders at every call site.
- **Tight imperative; no storytelling.** Rule statement = one imperative clause + minimal qualifier. Cut exposition tails ("never reach this branch", "an engineer outside the user's context can decode"). Justifications go in `CHANGELOG.md` / commit body.
- **Split lines for scannability.** Multi-clause rules render as long visual lines. Break into separate paragraphs, labelled `**<Name>.** <action>` paragraphs, or bullets when enumerating ≥2 constraints.
- **Upsert into existing files.** New content overlapping an existing memory or consumer-surface file by >~50% → edit the existing file, not a new one. Preserve the file's existing voice.
- **Consumer CLAUDE.md is shared rules.** General Claude / agent discipline for consumer projects lives in `hooks/references/consumer-claude-md.template.md` (spliced into consumer's CLAUDE.md via `mcp__orchestra-utils__claude_md`). Orchestra-pipeline-specific rules (`S-FEATURES-001` routing, openapi-locked gate, per-service BR-AC) stay in `commands/orchestra.md` / `agents/*`.
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
- **Audit-trail conformance (maintainer contract).** Consumer-project chain artifacts under `<consumer>/docs/**/*.md` carry a mandatory `## Changelog` body block (yaml variants use `# Changelog:`); canonical body-grammar + row format + action enum live in `schemas/pipeline-artifact.schema.md`. Enforced by `pre-write-check.js` `changelog-append-only` gate + `mcp__orchestra-utils__{amend_locked_artifact,relock_artifact}`. **Scope of this CLAUDE.md rule**: when adding or modifying any consumer-shipped surface that authors / mutates consumer chain artifacts (`agents/*.md`, `commands/*.md`, `hooks/scripts/*.js`, `mcp-servers/*.js`), ensure it conforms — agent prompts emit the `created` row on first write; MCP tools that flip `status:` emit the matching `unlocked` / `re-locked` row in the same write; hook layer rejects mutating writes. **Does NOT apply to orchestra's own `docs/`** (dev-surface methodology / planning).
- **Plugin-authoring rules live in `docs/plugin-authoring.md`.** When adding, modifying, or refactoring any plugin component (`agents/`, `commands/`, `skills/`, `hooks/`, `output-styles/`, `schemas/`, `manifests/`, `rules/`, `CLAUDE.md`, tests), follow the declarative numbered rules R1-R14 there. The three-layer architecture (knowledge / navigation / orchestration) is the central insight: knowledge lives in ONE canonical skill; navigation skills publish triggers + delegate; agents orchestrate workflows without storing facts. Pairs with **Two surfaces, never mix them** — `docs/plugin-authoring.md` is dev-surface, the rules it codifies apply across both surfaces.

## Two surfaces, never mix them

The repo has two surface classes. They look similar (markdown / JS in the same checkout) but they have **different audiences and different lifetimes**.

### Consumer surface — ships to anyone who installs the plugin

- `agents/*.md` — loaded into Claude Code's agent registry on the consumer's machine
- `commands/*.md` — loaded as slash-command bodies
- `skills/*/SKILL.md` (and `references/`, `scripts/` under each skill) — loaded when a skill is invoked
- `hooks/scripts/*.js`, `hooks/lib/*.js` — executed as hook handlers on the consumer's machine
- `mcp-servers/*.js` — MCP servers launched by Claude Code on the consumer's machine (referenced by `.claude-plugin/.mcp.json`)
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

## Audit-trail conformance (maintainer contract)

**Scope of this section**: maintainer obligation when authoring or modifying consumer-shipped surfaces (`agents/`, `commands/`, `hooks/`, `mcp-servers/`) that produce or mutate consumer-project chain artifacts. Body-grammar canonical home: `schemas/pipeline-artifact.schema.md` — when the schema's `## Changelog` block-grammar exists, this maintainer rule cites it. Until then (PR 1 lands the schema body-grammar), the rule is "ensure your consumer-surface edit conforms to the contract once the schema lands; do not introduce silent locked-artifact mutations".

### Why this is a dev-surface contract, not a consumer-CLAUDE.md rule

- Consumer CLAUDE.md splice (`hooks/references/consumer-claude-md.template.md`) already tells the consumer "Don't trample chain-owned dirs. `docs/` is chain-written" — the chain agents enforce on the consumer's behalf, so the consumer's Claude session doesn't need the row format.
- Schemas (consumer surface) carry the format authoritatively for chain agents that author artifacts.
- Hooks (consumer surface) enforce the `changelog-append-only` gate at write-time.
- MCP tools (consumer surface) emit matching rows on lock/unlock transitions.
- The only audience for the maintainer-side rule is THIS repo's authors — when they add a new agent or modify an MCP tool, the contract reminds them to keep conformance.

### Producer table (which surface emits which row)

| Surface | When | Action |
|---|---|---|
| `agents/*.md` author-write | Forward chain / reverse-pass initial artifact creation | Emit `created` row |
| `agents/*.md` section update on draft artifact | Section author updates a `status: draft` artifact | Emit `revised` row |
| `mcp-servers/orchestra-utils.js > amend_locked_artifact` | Dispatcher unlocks for ratify-spec amendment | Emit `unlocked` row + flip `status: locked → revision_requested` in one write |
| `agents/architect.md` (etc.) on `task: ratify-spec-amend` | Architect re-authors the unlocked artifact | Emit `ratify-spec-amend` row |
| `mcp-servers/orchestra-utils.js > relock_artifact` | Dispatcher re-locks after amendment | Emit `re-locked` row + flip `status: revision_requested → locked` in one write |
| Dispatcher on fix-source closure | Source-side fix closes a divergence | Emit `fix-source` row |
| Dispatcher on full regenerate (rare; user-driven) | User-requested full artifact rebuild | Emit `regenerated` row |
| `hooks/scripts/pre-write-check.js` `changelog-append-only` gate | Any `Write` / `Edit` to a chain artifact | Reject mutations / removals of existing rows |

### Why

1. **Git-context-independence.** The consumer's artifact carries provenance + amendment history in the body itself — survives standalone reads.
2. **No silent unlocks.** Verification-phase ratify-spec on locked artifacts leaves a trace a reviewer audits without `git log`.
3. **changelog-append-only enforcement.** Hook layer guarantees the audit trail is trustworthy — agents cannot retroactively rewrite.

### How to apply when authoring a new component

- New agent that authors `docs/**/*.md`: its Deliverables section requires "First body section is `## Changelog` with row `- <ISO-8601> | created by @<self> | <intent>`".
- New MCP tool that mutates a locked artifact: tool writes the matching changelog row in the SAME write as the `status:` flip — never separate writes.
- New hook touching chain artifacts: respect the `changelog-append-only` gate contract; do not write into the `## Changelog` block unless implementing a new producer surface above.

## Plugin authoring

For any change to plugin component structure (adding/removing an agent, skill, command, hook, output-style, schema, rule, or test), apply the declarative rule set in `docs/plugin-authoring.md` (R1-R14).

### Quick map

- **R1** — manifest (`.claude-plugin/plugin.json`)
- **R2** — agents (`agents/*.md`)
- **R3** — skills (`skills/<name>/SKILL.md` + `references/` + `scripts/` + `assets/`)
- **R4** — commands (`commands/*.md`)
- **R5** — hooks (`hooks/hooks.json` + `hooks/<name>/` runtime tree)
- **R6** — output styles (`output-styles/*.md`)
- **R7** — rules (`rules/<topic>.md`, always-on)
- **R8** — CLAUDE.md (maintainer memory; does not ship)
- **R9-R14** — cross-cutting concerns (three-layer knowledge / navigation / orchestration architecture, commit / changelog discipline, version-bump script, etc.)

### The three-layer architecture (central insight)

- **Knowledge layer** = ONE canonical skill holds authoritative content. In orchestra this is split across the methodology skills (`business-analysis`, `clean-architecture`, `clean-code`, `c4-architecture`, `qa-test-planner`, `java-development`).
- **Navigation layer** = every other skill publishes trigger keywords + decision trees + delegates to the knowledge layer; stores no facts.
- **Orchestration layer** = agents run workflows and produce reports; do not store facts; invoke skills via their `skills:` frontmatter.

Without this layering, every doc change requires touching N skills, audits drift, consumers see contradictions. With it, you update one place.

### How this pairs with `## Two surfaces, never mix them`

The two-surfaces rule is about audience (consumer vs developer); the plugin-authoring rules are about component-class structure. Both apply simultaneously — when adding a new skill (R3), the skill body still must not cite `§X.Y` into `docs/plugin-authoring.md` (two-surfaces rule), because the skill is consumer surface and `docs/` is dev-only.

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
