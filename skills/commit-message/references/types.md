# Conventional Commits — type table + spec rules + examples

Full reference. SKILL.md cites this for type semantics, normative spec rules, and worked examples.

## Type table (SemVer mapping)

The spec mandates exactly two semantics-bearing types; the rest are conventional additions with no SemVer effect unless paired with `!` or `BREAKING CHANGE:`.

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

## Examples

**No body** (trivial fix):

```
docs: correct spelling of CHANGELOG

Co-Authored-By: Claude Code
```

**Scope-only** (no breaking change, no body):

```
feat(lang): add Polish language

Co-Authored-By: Claude Code
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
Co-Authored-By: Claude Code
```

**`!` indicator alone (no BREAKING CHANGE footer)** — description carries the break:

```
feat(api)!: drop support for Node 6

Co-Authored-By: Claude Code
```

**Both `!` and BREAKING CHANGE footer** (preferred for non-trivial breaks):

```
feat(api)!: drop /v1 orders endpoint

The v1 surface is replaced by /v2 (locked in ADR-0007-v2-cutover).
Existing v1 callers will receive 404 starting on the next deploy.

BREAKING CHANGE: /v1/orders is removed. Migrate callers to /v2/orders
per docs/<feature-id>/<feature-id>-openapi.yaml.
Refs: ADR-0007-v2-cutover
Co-Authored-By: Claude Code
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
Co-Authored-By: Claude Code
```

## Why this convention

Conventional Commits 1.0.0 makes commit history machine-readable:

- **Automated CHANGELOG generation** — group commits by type into Added / Changed / Fixed / Breaking sections without human curation.
- **Automated SemVer bump inference** — `feat` → MINOR, `fix` → PATCH, any `!` or `BREAKING CHANGE:` → MAJOR. CI computes next version from commits since previous tag.
- **Triggering build / publish flows** — release tooling reads commit-message shape to decide whether to publish, draft a release, or skip.
- **Stakeholder communication** — `<type>(<scope>): <description>` summary informative at a glance.
- **Lower contributor friction** — same convention across thousands of repos.

The orchestra `Co-Authored-By: Claude Code` trailer extension preserves attribution for AI-assisted commits — `git log --grep="Co-Authored-By: Claude Code"` enumerates every AI-touched commit without coupling to a model version.
