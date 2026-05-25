---
name: commit-message
description: "Author a git commit message conforming to Conventional Commits 1.0.0 (type(scope): description + body + footer) with the mandatory `Co-Authored-By: Claude Code` trailer on AI-authored commits. Use when about to commit chain artifacts + source after TSR locks, when CHANGELOG derivation depends on machine-readable commit shape, or when a release-prep SemVer bump needs deterministic projection from commit log between two tags."
allowed-tools: Read, Write, Edit, Glob, Grep, Skill
origin: orchestra
---

# commit-message

Constructs a Conventional Commits 1.0.0 compliant message (https://www.conventionalcommits.org/en/v1.0.0/) and appends a mandatory AI `Co-Authored-By:` trailer. Conformance lets downstream tooling auto-generate CHANGELOGs, infer SemVer bumps, and gate release pipelines on commit-message shape.

## When to use

- The orchestra forward chain has locked all TSR sections (eval + review APPROVED), and the user is about to commit the chain artifacts + source by hand.
- This skill drafts the message text only — it does not stage, push, or tag.

## When NOT to use

- Commits authored under team conventions that diverge from Conventional Commits.
- Non-commit prose: CHANGELOG entries, PR descriptions, release notes.

## Canonical format

```
<type>[(<scope>)][!]: <description>

[optional body]

[optional footer(s)]
Co-Authored-By: <model-name> <noreply@anthropic.com>
```

Type table (SemVer mapping), full normative spec rules (11), and worked examples: `references/types.md`.

## AI Co-Authored-By trailer (mandatory; orchestra extension)

Every message MUST include a `Co-Authored-By:` trailer naming the active model — the AI did the spec/code/test authoring, so commit-history attribution must reflect that.

```
Co-Authored-By: <model-name> <noreply@anthropic.com>
```

- `<model-name>` is the active Claude model identifier (e.g., `Claude Opus 4.7 (1M context)`, `Claude Sonnet 4.6`, `Claude Haiku 4.5`). The dispatcher reads from runtime environment.
- When model identifier unavailable, fall back to `Co-Authored-By: Claude <noreply@anthropic.com>`.
- This trailer is the LAST line — after any spec-mandated footers (`BREAKING CHANGE:`, `Closes:`, `Refs:`, `Reviewed-by:`).
- One blank line separates the AI trailer from preceding footers ONLY if other footers exist; otherwise the trailer sits one blank line after body (or description).

## Algorithm

1. **Read staged diff.** `git diff --staged --stat` for file shape; `git diff --staged` for content. Empty stage → halt (nothing to commit).
2. **Pick type.** Walk the diff; choose the dominant change kind per the type table in `references/types.md`. Mixed feat + fix → prefer `feat`; otherwise higher-precedence type per spec rule 2.
3. **Pick scope.** Default to feature slug derived from `<feature-id>` paths in diff. Fall back to service name when diff spans multiple features. Omit (no parens) if neither applies.
4. **Compose description.** Imperative-mood summary capturing the dominant change. Soft cap ≤72 chars for `git log --oneline`; no trailing period.
5. **Decide breaking-change indication.** Diff removes/renames public API, schema fields, or CLI surface → append `!` to prefix AND author `BREAKING CHANGE:` footer with migration path. Redundancy is intentional: `!` is human-scannable in `git log`; footer carries migration text.
6. **Compose body (optional).** When *why* doesn't fit description: stakeholder ask, prior incident, ADR reference. Skip for trivial changes.
7. **Compose footers (optional).** `BREAKING CHANGE:` per step 5. `Closes: #N` / `Refs: ADR-NNNN-<slug>` when staged diff includes the issue / ADR ID.
8. **Append AI trailer.** Always last line.

## References

- `references/types.md` — full type table (SemVer mapping), 11 normative spec rules, 5 worked examples, "Why this convention" rationale.
