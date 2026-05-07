---
name: commit-work
description: "Generates Conventional Commits messages from staged diffs with type, scope, and trailer. Use for /orchestra commit and @ship work."
origin: orchestra
---

# commit-work

Reads `git diff --staged` and produces a Conventional Commits 1.0.0 message: `<type>(<scope>): <subject>` with optional body and trailers. Used by `/orchestra commit` and by `@ship` during release work.

## When to use

- User invoked `/orchestra commit` — the smart commit-message subcommand.
- `@ship` is finalizing a feature and needs a commit (or several) for the release diff. `@ship` reads gate status from `verify/<NNN>-TSR.md` frontmatter (`eval_verdict`, `rev_verdict`) before invoking.
- Any agent has just modified files and wants to land them as a single coherent commit.

Skip for amending or rebasing — those are destructive and require explicit user approval. Generate fresh commits, never history rewrites.

## Approach

### Step 1 — Read the staged diff

```bash
git diff --staged --stat   # file list + size
git diff --staged          # actual changes
```

If the diff is empty: stop. Tell the user there's nothing staged.

### Step 2 — Choose the type

Pick exactly one from Conventional Commits 1.0.0 vocabulary:

| Type | Use when |
|---|---|
| `feat` | New user-facing functionality (endpoint, flag, UI behavior). |
| `fix` | Bug fix that changes observable behavior toward correctness. |
| `refactor` | Internal change with no behavior delta (tests pass; no API changes). |
| `test` | Tests only. No source code changed. |
| `docs` | Docs only (README, CHANGELOG, design docs, comments-only). |
| `chore` | Tooling, build config, dependency bumps. No behavior delta. |
| `perf` | Behavior-preserving change with a measurable performance improvement. |
| `ci` | CI configuration only (`.github/workflows/`, `.gitlab-ci.yml`, etc.). |
| `style` | Formatting only (whitespace, semicolons). Avoid here — autoformat-managed. |
| `build` | Build system changes (Webpack, esbuild, Maven, Gradle config). |

Multi-type diffs ("feat + docs + tests for the same feature") → choose the **dominant** type; body lists the rest.

### Step 3 — Choose the scope

Sub-area touched. v1.0.0 conventions for this repo:

- `infra` — manifests, validators, CI scaffolding.
- `hooks` — anything in `hooks/`.
- `mcp` — anything in `scripts/mcp-servers/`.
- `agents` — anything in `agents/`.
- `skills` — anything in `skills/`.
- `rules` — anything in `rules/`.
- `command` — anything in `commands/`.
- `spec` — `docs/PRD-*.md`, `docs/DESIGN-*.md`, `docs/WORKFLOW-*.md`.
- `validators` — `scripts/validate*.js`, `scripts/test-*.js`.

Multi-scope diffs: pick the *load-bearing* scope. CHANGELOG bumps alongside a hook change → scope is `hooks`; CHANGELOG belongs in body or trailer.

### Step 4 — Write the subject

Format: `<type>(<scope>): <subject>`.

- Imperative mood: "add", "fix", "rename" (not "added", "fixes", "renaming").
- Lowercase. No trailing period.
- ≤72 chars total including type/scope.
- State the **why-shaped what**: not "update file" but "drop redundant null check from ledger.ts".
- Reference task IDs when applicable: `feat(skills): T-501 task-breakdown SKILL.md`.

### Step 5 — Write the body (optional)

Use when the subject can't carry the full meaning:

- **Why** the change matters (not what — diff shows what).
- **Trade-offs** considered, options not taken.
- **Follow-up** work spawned by this commit.
- **References** to PRD/DESIGN/WORKFLOW sections by id.

Wrap at 72 chars. Separate body from subject with one blank line.

### Step 6 — Add trailers (optional)

Trailers go at the bottom, separated from body by one blank line:

- `BREAKING CHANGE:` — diff breaks an existing contract. Triggers major version bump.
- `Closes #NN` — GitHub issue reference.
- `Refs: SPEC-<id> sec-<n>` — internal artifact reference.
- `Co-Authored-By: <name> <email>` — pair-programming credit.

### Step 7 — Run the commit

`git commit -m "<subject>" -m "<body>"` (one `-m` per paragraph) or HEREDOC for clean formatting. **Never** `--amend` or `--no-verify` unless the user explicitly asks. Pre-commit hooks exist for a reason.

If a hook fails: investigate, fix the underlying issue, re-stage, create a NEW commit. Do not bypass.

## Output shape

```
<type>(<scope>): <subject ≤72 chars>

<optional body, wrapped at 72>
<paragraph 2 if needed>

<trailer 1>
<trailer 2>
```

## When to escalate

- Diff spans 4+ logical changes that don't share a scope → ask user to split before generating.
- Diff includes a file that *might* contain a secret (`.env`, `credentials.json`) → refuse and warn; let `pre-write-check` adjudicate.
- Changes touch multiple PR-scoped areas (agents + rules + command in one diff) → suggest splitting into separate commits per scope.

## References

- `references/commit-types.md` — extended type vocabulary with anchored examples per type.
- `references/scoping-guide.md` — repo-specific scope-picking heuristics.

## Worked example

User runs `/orchestra commit`. `git diff --staged --stat`:

```
 src/api/users.ts          | 78 +++++++++++++++++
 src/api/users.test.ts     | 54 ++++++++++++
 docs/api/users.md         | 22 +++++
```

- Type: `feat` (new endpoint).
- Scope: `api` (load-bearing area).
- Subject: state the why-shaped what; reference the spec/issue id this resolves.

```
feat(api): T-204 add /v1/users CRUD with cursor pagination

Implements GET/POST/PUT/DELETE on /v1/users. Cursor pagination uses
opaque base64 tokens (max 100 per page). Validates payloads with zod;
emits audit log on writes. Adversarial probes cover oversized bodies,
malformed cursors, and concurrent writes against the same record.

Refs: FRS-USERS sec-3.2
Closes #142
```

`@ship` (or `/orchestra commit`) runs `git commit` with this message and verifies hooks pass.
