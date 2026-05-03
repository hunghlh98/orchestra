---
name: commit-work
description: "Generates Conventional Commits messages from staged diffs with type, scope, and trailer. Use for /orchestra commit and @ship work."
origin: orchestra
---

# commit-work

Reads `git diff --staged` and produces a Conventional Commits 1.0.0 message: `<type>(<scope>): <subject>` with optional body and trailers. Used directly by `/orchestra commit` (no team) and by `@ship` during release work.

## When to use

- User invoked `/orchestra commit` — the smart commit-message subcommand.
- `@ship` is finalizing a feature and needs a commit (or several) for the release diff.
- Any agent has just modified files and wants to land them as a single coherent commit.

You do **not** invoke this skill for amending or rebasing — those are destructive and require explicit user approval per the global CLAUDE.md "executing actions with care" guidance. Generate fresh commits, not history rewrites.

## Approach

### Step 1 — Read the staged diff

Run `git diff --staged --stat` to get the file list and size. Then `git diff --staged` (without --stat) to read the actual changes. Keep both in working memory.

If the diff is empty: stop. Do not create empty commits. Tell the user there's nothing staged.

### Step 2 — Choose the type

Conventional Commits 1.0.0 vocabulary. Pick exactly one:

| Type | Use when |
|---|---|
| `feat` | New user-facing functionality (an endpoint, a flag, a UI behavior). |
| `fix` | A bug fix that changes observable behavior toward correctness. |
| `refactor` | Internal code change with no behavior delta. (Tests still pass; no API changes.) |
| `test` | Adds or updates tests only. No source code changed. |
| `docs` | Docs only. README, CHANGELOG, design docs, code comments-only changes. |
| `chore` | Tooling, build config, dependency bumps. No behavior delta. |
| `perf` | Behavior-preserving change with a measurable performance improvement. |
| `ci` | CI configuration only (`.github/workflows/`, `.gitlab-ci.yml`, etc.). |
| `style` | Formatting only (whitespace, semicolons). Avoid in this codebase — style is autoformat-managed. |
| `build` | Build system changes (Webpack, esbuild, Maven, Gradle config). |

If the diff spans multiple types ("feat + docs + tests for the same feature") — choose the **dominant** type. Multi-type commits are still single-type-tagged; the body lists the rest.

### Step 3 — Choose the scope

Scope is the sub-area touched. v1.0.0 conventions for this repo:

- `infra` — manifests, validators, CI scaffolding (PR #1).
- `hooks` — anything in `hooks/`.
- `mcp` — anything in `scripts/mcp-servers/`.
- `agents` — anything in `agents/`.
- `skills` — anything in `skills/`.
- `rules` — anything in `rules/`.
- `command` — anything in `commands/`.
- `spec` — `docs/PRD-*.md`, `docs/DESIGN-*.md`, `docs/WORKFLOW-*.md`.
- `validators` — `scripts/validate*.js`, `scripts/test-*.js`.

Multi-scope diffs: pick the *load-bearing* scope. If a hook change is the point and you also bumped CHANGELOG, scope is `hooks`. The CHANGELOG belongs in the body or trailer.

### Step 4 — Write the subject

Format: `<type>(<scope>): <subject>`.

Subject rules (Conventional Commits 1.0.0 + this repo's preferences):

- Imperative mood: "add", "fix", "rename" — not "added", "fixes", "renaming".
- Lowercase. No trailing period.
- ≤72 chars total including type/scope.
- State the **why-shaped what**: not "update file" but "drop redundant null check from ledger.ts".
- Reference task IDs from the workflow doc if applicable: `feat(skills): T-501 task-breakdown SKILL.md`.

### Step 5 — Write the body (optional)

Use the body when the subject can't carry the full meaning. Patterns:

- **Why** the change matters (not what — the diff shows what).
- **Trade-offs** considered, options not taken.
- **Follow-up** work spawned by this commit.
- **References** to PRD/DESIGN/WORKFLOW sections by ID.

Wrap at 72 chars. Separate body from subject with one blank line.

### Step 6 — Add trailers (optional)

Trailers go at the bottom, separated from body by one blank line. Common trailers:

- `BREAKING CHANGE:` — if the diff breaks an existing contract. Triggers a major version bump per SemVer.
- `Closes #NN` — GitHub issue reference.
- `Refs: PRD-001 §8.7` — internal artifact reference.
- `Co-Authored-By: <name> <email>` — pair-programming credit.

### Step 7 — Run the commit

Use `git commit -m "<subject>" -m "<body>"` (one `-m` per paragraph) or via HEREDOC for clean formatting. **Never** use `--amend` or `--no-verify` unless the user explicitly asks. Pre-commit hooks exist for a reason.

If a hook fails: investigate the failure, fix the underlying issue, re-stage, create a NEW commit. Do not bypass.

## Output shape

```
<type>(<scope>): <subject ≤72 chars>

<optional body, wrapped at 72>
<paragraph 2 if needed>

<trailer 1>
<trailer 2>
```

## When to escalate

- Diff spans 4+ logical changes that don't share a scope → ask the user to split into separate commits before generating.
- Diff includes a file that *might* contain a secret (.env, credentials.json) → refuse and warn; let `pre-write-check` adjudicate.
- Changes touch multiple PR-scoped areas (e.g., agents + rules + command in one diff) → suggest splitting per the WORKFLOW doc's PR boundaries.

## References

For depth, see:
- `references/commit-types.md` — extended type vocabulary with anchored examples per type.
- `references/scoping-guide.md` — repo-specific scope picking heuristics.

(References are conditional; this body suffices for v1.0.0.)

## Worked example

User runs `/orchestra commit`. `git diff --staged --stat` shows:

```
 skills/task-breakdown/SKILL.md          | 156 ++++++++++
 skills/project-discovery/SKILL.md       | 142 +++++++++
 manifests/install-modules.json          |  16 ++
 manifests/runtime-toggles.json          |  16 ++
 CHANGELOG.md                            |  12 +
```

Analysis:
- Type: `feat` (new skills are user-facing functionality the agents can invoke).
- Scope: `skills` (load-bearing area).
- Subject: should reference the task IDs from WORKFLOW-002-leaves §2.1.

Output:

```
feat(skills): T-501..T-502 — task-breakdown + project-discovery SKILL.md

Ships first 2 of 8 v1.0.0 skills per WORKFLOW-002-leaves §2.1 PR #5.
Both skills follow the SKILL.md skeleton from DESIGN-002 §3.1; bodies
under 400 lines; descriptions under 200 chars with trigger keywords.

Manifests bumped to track the new modules + their env-var toggles.
test-removability now reports 9 modules / 9 toggles (was 7/7).

Refs: WORKFLOW-002-leaves §2.1, DESIGN-002 §3.5
```

`@ship` (or `/orchestra commit`) runs `git commit` with this message and verifies hooks pass.
