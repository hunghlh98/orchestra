---
name: commit-message
description: "Authors a git commit message per Conventional Commits 1.0.0 with a mandatory AI Co-Authored-By trailer."
origin: orchestra
---

# commit-message

Constructs a Conventional Commits 1.0.0 compliant message (https://www.conventionalcommits.org/en/v1.0.0/) and appends a mandatory AI `Co-Authored-By:` trailer. Conformance with the spec lets downstream tooling auto-generate CHANGELOGs, infer SemVer bumps, and gate release pipelines on commit-message shape.

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

## Type table (SemVer mapping)

The spec mandates exactly two semantics-bearing types; the rest are conventional additions with no SemVer effect unless paired with a `!` or `BREAKING CHANGE:` footer.

| Type | Meaning | SemVer effect |
|---|---|---|
| `feat` | New feature added | MINOR bump |
| `fix` | Bug patched | PATCH bump |
| `refactor` | Code restructure without behavior change | none |
| `perf` | Performance improvement (no behavior change) | none |
| `docs` | Documentation only | none |
| `test` | Test additions / corrections | none |
| `build` | Build system / dependency changes | none |
| `ci` | CI configuration changes | none |
| `chore` | Maintenance (housekeeping, version bumps) | none |
| `style` | Formatting only (no logic change) | none |

Any type with `!` after the type/scope OR a `BREAKING CHANGE:` footer → MAJOR bump regardless of which type was chosen.

## Specification rules (normative)

Spec MUST/MAY language preserved. Skim before composing:

1. **Type prefix REQUIRED.** Every commit MUST start with a type noun, OPTIONAL scope, OPTIONAL `!`, followed by REQUIRED `: ` (colon + space).
2. **`feat` for new feature; `fix` for bug fix.** These two are MUST. Other types MAY be used and have no SemVer effect unless paired with breaking-change indication.
3. **Scope MAY appear** as a parenthesized noun after the type: `fix(parser):`. Scope describes a section of the codebase.
4. **Description REQUIRED** immediately after `: `. Short imperative summary of the code change.
5. **Body MAY appear** one blank line after the description. Free-form, any number of newline-separated paragraphs. Body explains *why*, not *what*.
6. **Footers MAY appear** one blank line after the body. Each footer is `<Word-Token><sep><value>` where `<sep>` is either `: ` (colon-space) or ` #` (space-hash). Inspired by `git interpret-trailers`.
7. **Word-token MUST use `-` for whitespace** (e.g., `Reviewed-by`, `Acked-by`, `Co-Authored-By`). Exception: the token `BREAKING CHANGE` is allowed verbatim.
8. **Footer values MAY contain spaces and newlines.** Parsing terminates only when the next valid footer-token/separator pair is observed — a paragraph break inside a value does NOT end the footer.
9. **Breaking change indication is MANDATORY for breaking changes** — either `!` immediately before the `:` in the prefix, OR a `BREAKING CHANGE: <description>` footer. Both MAY appear together. If `!` is used alone, the description SHALL describe the break.
10. **`BREAKING CHANGE` MUST be uppercase.** Synonym `BREAKING-CHANGE` (hyphenated) is also spec-compliant.
11. **Other units are case-INsensitive** per spec — `Feat:`, `FIX:`, and `feat:` all conform. Lowercase by convention.

## AI Co-Authored-By trailer (mandatory; orchestra extension)

Because `/orchestra ship` runs `git commit` non-interactively on the user's behalf, every message authored by this skill MUST include a `Co-Authored-By:` trailer naming the active model. Format:

```
Co-Authored-By: <model-name> <noreply@anthropic.com>
```

- `<model-name>` is the active Claude model identifier (e.g., `Claude Opus 4.7 (1M context)`, `Claude Sonnet 4.6`, `Claude Haiku 4.5`). The dispatcher reads this from its runtime environment.
- When the model identifier is unavailable for any reason, fall back to `Co-Authored-By: Claude <noreply@anthropic.com>`.
- This trailer is the LAST line of the message — after any spec-mandated footers (`BREAKING CHANGE:`, `Closes:`, `Refs:`, `Reviewed-by:`).
- One blank line separates the AI trailer from preceding footers ONLY if there are other footers; otherwise the trailer sits one blank line after the body (or description).

## Algorithm

1. **Read staged diff.** `git diff --staged --stat` for the file shape; `git diff --staged` for content. If the stage is empty, do nothing — the caller halts with `[orchestra] ship: nothing staged`.
2. **Pick type.** Walk the diff; choose the dominant change kind per the type table. If a single dominant type is unclear (mixed feat + fix), prefer `feat` if any feature was added; otherwise the higher-precedence type per spec rule 2.
3. **Pick scope.** Default to the feature slug derived from `<feature-id>` paths in the diff. Fall back to the service name when the diff spans multiple features. Omit the scope (no parens) if neither applies.
4. **Compose description.** Imperative-mood summary capturing the dominant change. Soft cap ≤72 chars for `git log --oneline` readability; no trailing period.
5. **Decide breaking-change indication.** If the diff removes/renames public API, schema fields, or a CLI surface — append `!` to the prefix AND author a `BREAKING CHANGE:` footer describing the migration path. The redundancy is intentional: `!` is human-scannable in `git log`; the footer carries the migration text.
6. **Compose body (optional).** Add when the *why* doesn't fit the description: stakeholder ask, prior incident, ADR reference. Skip for trivial changes (typo fixes, version bumps).
7. **Compose footers (optional).** Add `BREAKING CHANGE:` per step 5. Add `Closes: #N` / `Refs: ADR-NNNN-<slug>` when the staged diff includes the issue / ADR ID.
8. **Append AI trailer.** Always last line. Format per the rule above.

## Examples

**No body** (trivial fix):

```
docs: correct spelling of CHANGELOG

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

**Scope-only** (no breaking change, no body):

```
feat(lang): add Polish language

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

**Feature with body + footers**:

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

**`!` indicator alone (no BREAKING CHANGE footer)** — description carries the break:

```
feat(api)!: drop support for Node 6

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

**Both `!` and BREAKING CHANGE footer** (preferred for non-trivial breaks — `!` is scannable in `git log --oneline`, footer carries migration text):

```
feat(api)!: drop /v1 orders endpoint

The v1 surface is replaced by /v2 (locked in ADR-0007-v2-cutover).
Existing v1 callers will receive 404 starting on the next deploy.

BREAKING CHANGE: /v1/orders is removed. Migrate callers to /v2/orders
per docs/<feature-id>/<feature-id>-openapi.yaml.
Refs: ADR-0007-v2-cutover
Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

**Multi-paragraph body + multiple footers** (per spec rule 8, footer values may contain newlines):

```
fix: prevent racing of requests

Introduce a request id and a reference to latest request. Dismiss
incoming responses other than from latest request.

Remove timeouts which were used to mitigate the racing issue but are
obsolete now.

Reviewed-by: Z
Refs: #123
Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

## Why this convention

Conventional Commits 1.0.0 exists to make commit history machine-readable. Conforming messages enable:

- **Automated CHANGELOG generation** — group commits by type into Added / Changed / Fixed / Breaking sections without human curation.
- **Automated SemVer bump inference** — `feat` → MINOR, `fix` → PATCH, any `!` or `BREAKING CHANGE:` → MAJOR. CI pipelines compute the next version from commits since the previous tag.
- **Triggering build / publish flows** — release tooling reads commit-message shape to decide whether to publish, draft a release, or skip.
- **Stakeholder communication** — the `<type>(<scope>): <description>` summary is informative at a glance; reviewers and PMs read `git log --oneline` and learn the shape of recent work without diving into diffs.
- **Lower contributor friction** — a structured commit history is easier to navigate for newcomers; the convention is the same across thousands of repos.

The orchestra `Co-Authored-By:` trailer extension exists for a different reason: it preserves attribution for AI-assisted commits and lets the user audit AI-driven changes via `git log --grep` on the model identifier.
