---
name: commit-message
description: "Authors a git commit message per Conventional Commits 1.0.0 with a mandatory AI Co-Authored-By trailer."
origin: orchestra
---

# commit-message

Constructs a Conventional Commits 1.0.0 compliant message (https://www.conventionalcommits.org/en/v1.0.0/) and appends a mandatory AI `Co-Authored-By:` trailer.

## When to use

- `/orchestra ship` has verified gates and set TSR `ship:` frontmatter, and is about to run `git commit -m`.
- The user has staged the chain artifacts (and any related source) themselves; this skill drafts the message text only — it does not stage, push, or tag.

## When NOT to use

- Commits authored by the consumer outside `/orchestra ship`. Those follow the consumer's team conventions, not this skill.
- Non-commit prose: CHANGELOG entries, PR descriptions, release notes. Different format conventions apply there.

## Canonical format

```
<type>[(<scope>)][!]: <description>

[optional body]

[optional footer(s)]
Co-Authored-By: <model-name> <noreply@anthropic.com>
```

## Rules

- **type** — REQUIRED noun. `feat` MUST be used when adding a new feature; `fix` MUST be used for a bug fix. Conventional additions: `refactor`, `test`, `docs`, `chore`, `perf`, `ci`, `build`, `style`. Pick the dominant type for the staged diff. Case-insensitive per spec; lowercase by convention.
- **scope** — OPTIONAL noun in parens. Prefer the feature slug (`order-placement`); use the service name (`order`) when the commit spans features.
- **`!`** — OPTIONAL breaking-change indicator immediately before `:` (e.g., `feat(api)!: drop /v1`). May appear with or without a `BREAKING CHANGE:` footer; if alone, the description SHALL describe the break.
- **description** — REQUIRED summary directly after `: ` (colon + space). Imperative mood ("add", not "added"). Soft cap ≤72 chars for `git log --oneline` readability; no trailing period (style, not spec).
- **body** — OPTIONAL prose. MUST begin one blank line after the description. Free-form paragraphs; wrap ~72 for readability. Explain *why*, not *what* (the diff carries the what).
- **footers** — OPTIONAL. One blank line after the body (or after the description if there's no body). Each footer = `<Word-Token><sep><value>` where `<sep>` is `: ` (colon-space) OR ` #` (space-hash). Word-tokens use `-` for whitespace (e.g., `Reviewed-by`, `Acked-by`). Common: `Closes: #42`, `Refs: ADR-0003`, `Reviewed-by: Jane Doe`.
- **BREAKING CHANGE footer** — MUST be uppercase exactly: `BREAKING CHANGE: <description>`. The token `BREAKING-CHANGE` is a spec-defined synonym.

## AI Co-Authored-By trailer (mandatory)

Because `/orchestra ship` runs `git commit` non-interactively on the user's behalf, every message authored by this skill MUST include a `Co-Authored-By:` trailer naming the active model. Format:

```
Co-Authored-By: <model-name> <noreply@anthropic.com>
```

- `<model-name>` is the active Claude model identifier (e.g., `Claude Opus 4.7 (1M context)`, `Claude Sonnet 4.6`, `Claude Haiku 4.5`). The dispatcher reads this from its runtime environment.
- When the model identifier is unavailable for any reason, fall back to `Co-Authored-By: Claude <noreply@anthropic.com>`.
- This trailer is the LAST line of the message — after any spec-mandated footers (BREAKING CHANGE, Closes, Refs, Reviewed-by).
- One blank line separates the AI trailer from preceding footers ONLY if there are other footers; otherwise the trailer sits one blank line after the body (or description).

## Algorithm

1. **Read staged diff.** `git diff --staged --stat` for the file shape; `git diff --staged` for content. If the stage is empty, do nothing — the caller halts with `[orchestra] ship: nothing staged`.
2. **Pick type.** Walk the diff; choose the dominant change kind per the type table above. If a single dominant type is unclear (mixed feat + fix), prefer `feat` if any feature was added; otherwise the higher-precedence type in the spec table.
3. **Pick scope.** Default to the feature slug derived from `<feature-id>` paths in the diff. Fall back to the service name when the diff spans multiple features. Omit the scope (no parens) if neither applies.
4. **Compose description.** Imperative-mood summary capturing the dominant change. ≤72 chars; no trailing period.
5. **Compose body (optional).** Add when the *why* doesn't fit the description: stakeholder ask, prior incident, ADR reference. Skip for trivial changes (typo fixes, version bumps).
6. **Compose footers (optional).** Add `BREAKING CHANGE:` when applicable (alongside or instead of `!`). Add `Closes: #N` / `Refs: ADR-NNNN-<slug>` when the staged diff includes the issue / ADR ID.
7. **Append AI trailer.** Always last line. Format per the rule above.

## Worked example

Staged diff: PRD + FRS + TDD + openapi + 2 source files + tests, all for feature `001-order-placement`. Active model: Claude Opus 4.7 (1M context).

```
feat(order-placement): add place-order use case

Adds POST /orders endpoint with idempotency-key support and the full
PRD→FRS→TDD chain. Persists the order aggregate via the existing
OrderRepository port; no new ADR (idempotency-key choice was locked
in ADR-0003).

Closes: #142
Refs: ADR-0003-idempotency-key
Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

## Breaking-change example

Staged diff: removes `/v1/orders` endpoint and the v1 openapi description.

```
feat(api)!: drop /v1 orders endpoint

The v1 surface is replaced by /v2 (locked in ADR-0007-v2-cutover).
Existing v1 callers will receive 404 starting on the next deploy.

BREAKING CHANGE: /v1/orders is removed. Migrate callers to /v2/orders
per docs/<feature-id>/<feature-id>-openapi.yaml.
Refs: ADR-0007-v2-cutover
Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```
