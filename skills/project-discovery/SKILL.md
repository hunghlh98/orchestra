---
name: project-discovery
description: "Discovers project primary language, framework, and brownfield/greenfield mode. Use when bootstrapping a session."
origin: orchestra
---

# project-discovery

Returns a structured snapshot of the working directory's shape: `{ has_source, primary_language, framework, scope_hints, mode }`. Cheap, deterministic, never destructive — runs before any agent decision.

## When to use

- `/orchestra` is invoked and there's no `.claude/.orchestra/local.yaml` yet (greenfield/brownfield bootstrap).
- `@product` or `@lead` needs to size a refactor and hasn't read the source tree yet.
- `@reviewer` needs to know which language ruleset (`rules/<lang>/`) to load.
- Any agent is about to invoke a language-specific skill (e.g., `java-source-intel`) and needs to confirm Java is the primary stack.

## Algorithm

Run checks in order. Stop at first decisive signal per category — don't over-discover. Whole pass should take <2 seconds via `Glob` + `Read`.

### Check 1 — has_source

```
has_source = (any of: src/, lib/, app/, packages/, services/, cmd/, pkg/, internal/) exists
          OR (any *.{ext} for ext in known languages exists at any depth ≤3)
```

If `has_source == false` → mode is **greenfield**. Stop. `@product` proposes a baseline structure.

### Check 2 — primary_language

Walk by file-extension count. Highest count wins. Tie-breakers go to the language whose canonical config file is present.

| Language | Canonical extensions | Canonical config files |
|---|---|---|
| TypeScript | `.ts`, `.tsx` | `tsconfig.json`, `package.json` with `typescript` dep |
| JavaScript | `.js`, `.mjs`, `.cjs` | `package.json` without `typescript` dep |
| Java | `.java` | `pom.xml`, `build.gradle`, `build.gradle.kts` |
| Kotlin | `.kt`, `.kts` | `build.gradle.kts`, `*.kt` files |
| Python | `.py` | `pyproject.toml`, `setup.py`, `requirements.txt` |
| Go | `.go` | `go.mod` |
| Ruby | `.rb` | `Gemfile`, `*.gemspec` |
| Rust | `.rs` | `Cargo.toml` |

Top-2 within 20% of each other → record `primary_language: <top>` + `secondary_language: <second>`. Both rulesets activate per `paths:` glob in `rules/`.

### Check 3 — framework

Match on dependency manifest first (deterministic), then on directory shape (heuristic).

| Framework | Manifest signal | Directory signal |
|---|---|---|
| React | `package.json` lists `react` | `src/components/`, `src/hooks/` |
| Vue | `package.json` lists `vue` | `src/components/*.vue` |
| Next.js | `package.json` lists `next` | `pages/` or `app/` at root |
| Express | `package.json` lists `express` | `routes/`, `app.js` with `express()` |
| Spring Boot | `pom.xml` has `spring-boot-starter` | `src/main/java/.../*Application.java` |
| Django | `requirements.txt` has `Django` | `manage.py`, `settings.py` |
| Flask | `requirements.txt` has `Flask` | `app.py` with `Flask(__name__)` |
| Rails | `Gemfile` has `rails` | `app/controllers/`, `config/routes.rb` |
| FastAPI | `requirements.txt` has `fastapi` | `main.py` with `FastAPI()` |

Multiple matches → record all. Router uses the highest-confidence match.

### Check 4 — scope_hints

Quick brownfield-quality signal. None block; they shape UX.

- **scope_hints.has_tests** — `*.test.*`, `*_test.*`, `test_*.py`, `*Test.java` count > 0.
- **scope_hints.has_ci** — `.github/workflows/`, `.gitlab-ci.yml`, `Jenkinsfile`, `.circleci/` exists.
- **scope_hints.has_docker** — `Dockerfile`, `docker-compose.yml` exists.
- **scope_hints.git_age_days** — days since first commit (`git log --reverse --format=%cd | head -1`).
- **scope_hints.file_count** — total tracked files; >5000 = "large".

### Check 5 — mode

```
mode = "greenfield" if has_source == false
     | "brownfield" if has_source == true
```

Greenfield → `@product` + `@lead` Pattern B negotiation. Brownfield → section inference (`inferred: true` flag on synthesized sections).

## Output shape

Write to (or update) `<project>/.claude/.orchestra/local.yaml`:

```yaml
discovery:
  mode: brownfield
  primary_language: typescript
  secondary_language: null
  framework: react
  has_source: true
  scope_hints:
    has_tests: true
    has_ci: true
    has_docker: false
    git_age_days: 412
    file_count: 1837
```

Successive `/orchestra` runs read this and skip discovery unless the user passes `--rediscover`.

## Hand-off to CHARTER (v2.0)

After discovery completes, the dispatcher scaffolds `pipeline/<feature_id>/charter/<NNN>-CHARTER.md`. Mode dispatch:

- `intent.yaml.intent` is `feature` or `hotfix` → `--mode=full` (problem / scope / feasibility / decision).
- `intent.yaml.intent` is `template` / `docs` / `review-only` → `--mode=brief` (intent + decision; replaces v1's `INTENT-<id>.md`).

`@product` fills FILL spans using the discovery snapshot above (mode, language, framework, scope_hints) as Feasibility-section evidence.

## When to escalate

- Top-2 languages within 5% AND configs disagree → ask user (1 question, MEDIUM confidence).
- Multiple frameworks at parity → ask user.
- `has_source: true` but no recognized language → mode = brownfield, `primary_language: unknown`. Flag for `@product` to negotiate manual classification.

## Worked example

Run on `/Users/x/playwithclaude/orchestra` itself:

1. `has_source` — `scripts/`, `hooks/`, `manifests/` exist + `*.js` files. → `true`.
2. `primary_language` — `.js` ≈ 15, `.json` ≈ 10, `.md` ≈ 8. Tie-break: `package.json` with `"type": "module"`. → JavaScript (Node ESM). No `tsconfig.json`.
3. `framework` — `package.json` has no React / Vue / Express deps. No framework — pure Node tooling.
4. `scope_hints` — `.github/workflows/` → `has_ci: true`. No Dockerfile. Tests exist (`scripts/test-*.js`). git_age ≈ 1 day.
5. `mode` — brownfield.

```yaml
discovery:
  mode: brownfield
  primary_language: javascript
  framework: null
  has_source: true
  scope_hints: { has_tests: true, has_ci: true, has_docker: false, file_count: ~50 }
```

`@lead` reads this and routes language-agnostic tasks (no Java / TS specialization needed).
