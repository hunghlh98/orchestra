# CLAUDE.md — Orchestra plugin (project-local)

## Two surfaces, never mix them

This repo has two surface classes. They look similar (both are markdown / JS in the same checkout) but they have **different audiences and different lifetimes**.

### Consumer surface — ships to anyone who installs the plugin
- `agents/*.md` — loaded into Claude Code's agent registry on the consumer's machine
- `commands/*.md` — loaded as slash-command bodies
- `skills/*/SKILL.md` (and `references/`, `scripts/` under each skill) — loaded when a skill is invoked
- `hooks/scripts/*.js`, `hooks/lib/*.js` — executed as hook handlers on the consumer's machine
- `schemas/*.schema.json`, `schemas/*.schema.md` — normative shape for manifests + pipeline artifacts; consumer agents reference these directly
- `manifest.json`, `plugin.json`, `package.json`
- `README.md`, `CHANGELOG.md` (visible in install but informational)

### Developer surface — exists only in this repo, never ships
- `docs/v4.0-brief.md`, `docs/v4.0-design.md` (current major-version planning)
- `docs/BACKLOG.md`, `docs/HOOKS.md`, `docs/sdlc_knowledge.md` (living dev references)
- `scripts/test-*.js`, `scripts/validate.js`, `scripts/orchestra-report.js`, `scripts/bootstrap-local.js`, `scripts/bump-version.js` (build/CI tooling)
- `manifests/install-modules.json`, `manifests/runtime-toggles.json`, `manifests/known-models.json` (CI-validated registries; not loaded by Claude Code at runtime)

A consumer who installs orchestra has **no `docs/` folder, no `manifests/` folder, no `scripts/` folder**. They have only the consumer surface.

## The rule

**Consumer surface MUST NOT cite developer-surface artifacts by section anchor.**

### Forbidden in `agents/`, `commands/`, `skills/`

- `per v4.0-brief §6`, `(v4.0-design §7.16)`, `per S-AUTONOMY-001`, or any `§X.Y` pointer into a `docs/` file.
- Anything that points the reader at `docs/<file>.md` they don't have.

### Allowed in `agents/`, `commands/`, `skills/`

- Domain nouns the plugin teaches: `PRD-NNN.md`, `FRS-NNN.md`, `TDD-NNN.md`, `TSR-NNN.md`, `SAD.md`, `ADR-NNNN-<slug>.md`, `openapi.yaml`, `asyncapi.yaml`, `run-plan.md`, `inventory.md`, `DEADLOCK-<id>.md`, `ESCALATE-<id>.md`. These are artifact-type names the consumer's pipeline produces in **their own** project.
- Cross-references between consumer artifacts: `agents/lead.md` may cite `agents/product.md` or `commands/orchestra.md` or `skills/write-contract/SKILL.md`.
- References into `schemas/`: e.g., `schemas/pipeline-artifact.schema.md` is the normative frontmatter spec for pipeline artifacts. `schemas/` is consumer surface.
- File-shaped references inside the consumer's project: `<cwd>/.claude/.orchestra/pipeline/<id>/...`, `local.yaml`.

### Why

1. **Phantom anchors.** A cite like "per PRD §8.11" reads as an authoritative pointer, but `docs/PRD-001.md` is not present in the consumer's install. The LLM may hallucinate to fill the gap, or downgrade its own confidence because it can't resolve the source.
2. **Dead tokens.** Every leaky cite costs tokens on every load and gives the consumer's session zero behavioral lift.
3. **Drift hazard.** When the dev doc renumbers a section, the consumer-surface cite silently goes stale — and consumers can't notice because they can't see the source.

### How to apply

The fix shape is **inline the rule, drop the cite**. Most leaky lines already state the rule next to the cite; the parenthetical is removable surgery.

- ❌ `Confidence-tier the dialogue per v4.0-brief §7.4: HIGH = no questions, MEDIUM = 1, LOW = 2–3.`
- ✅ `Confidence-tier the dialogue: HIGH = no questions, MEDIUM = 1, LOW = 2–3.`

- ❌ `## Routing-taxonomy guard (v4.0-brief §7.5)`
- ✅ `## Routing-taxonomy guard`

- ❌ `Spawn agents per v4.0-design §3 routing taxonomy.`
- ✅ `Spawn agents per the routing taxonomy below.` (when the table is in the same file)

If the rule isn't already inline next to the cite, copy the relevant 1–3 sentences from `docs/<file>.md` into the consumer artifact, then drop the cite.

### Authoring consumer surface from a dev-surface draft

When lifting prose from `docs/v4.0-brief.md` (or any dev-surface draft) into `agents/` / `commands/` / `skills/`, scrub every `(see §X)` and `§X.Y` pointer and inline what the §-section actually says. The dev-surface anchor cannot resolve in a consumer install — pasting one creates the same phantom-anchor failure as writing a fresh leaky cite.

## Where dev-trace cites SHOULD go

The v4.0-brief / v4.0-design anchors (and any successor major-version planning docs) are valuable — just not in shipped artifacts. Cite freely in:

- `CHANGELOG.md` entries
- Commit messages and PR descriptions
- Code review comments
- Other files in `docs/`
- Comments in build/CI tooling under `scripts/`

These all have audiences who DO have access to `docs/`.

## Hook script comments — lower priority

Code comments at the top of `hooks/scripts/*.js` and `hooks/lib/*.js` referencing dev-design sections (e.g., `// See v4.0-design §3.2`) are read by **plugin maintainers reading source**, not by Claude at runtime. They're defensible as developer-trace inside source comments, similar to RFC references in library source. Trim if pursuing zero-leak; otherwise leave.

## Update discipline — no annotation creep

When updating consumer-facing prompts (`commands/`, `agents/`, `skills/`) or any file in this repo:

- Do NOT add inline "DO NOT do X manually" reminders, "Note: ..." annotations, or rule restatements alongside the change.
- If a load-bearing rule already lives elsewhere (e.g., the `## Invariants` block at the top of `commands/orchestra.md`, the body-grammar section in `schemas/pipeline-artifact.schema.md`), trust it and do NOT re-state it inline.
- If the rule does NOT exist yet, add it ONCE in the canonical spot — not next to every place it applies.
- Each repetition of "the hook owns this" / "the model must NOT do X" is a tax on every consumer load AND leaks into model narration when explanatory style is on.

The fix shape is **fold up, don't sprinkle**. Before adding any "DO NOT" / "Note:" prose, check whether the rule already exists somewhere canonical — if yes, link to or rely on it; if no, add it once at the canonical site.

## Scope discipline

- `docs/` is dev-only. Do not write methodology notes, session reports, or planning docs anywhere else (in particular, not in the user's private second-brain vault).
- Default to PATCH version bumps unless explicitly instructed otherwise.
- Before making changes that touch >5 files, removing features, or expanding beyond the literal request, post a brief plan and wait for go-ahead.

## Smoke-test before docs

Always smoke-test the consumer install path (5-step chain) BEFORE authoring RELEASE/RUNBOOK/ANNOUNCEMENT docs. CI validators check our invariants, not Claude Code's plugin/marketplace schemas — those need a real install loop.
