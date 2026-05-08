---
name: project-discovery
description: "Discovers project primary language, framework, and brownfield/greenfield mode. Use when bootstrapping a session."
origin: orchestra
---

# project-discovery

Returns a structured snapshot of the working directory's shape: `{ has_source, primary_language, framework, scope_hints, mode }`. Cheap, deterministic, never destructive — runs before any agent decision.

## When to use

- `/orchestra` is invoked and there's no `.orchestra/local.yaml` yet (greenfield/brownfield bootstrap).
- `@product` or `@lead` needs to size a refactor and hasn't read the source tree yet.
- `@backend` needs to know which `*-development` skill to load via `local.yaml.primary_language`.
- Any agent is about to invoke a language-specific skill and needs to confirm the primary stack.

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

Top-2 within 20% of each other → record `primary_language: <top>` + `secondary_language: <second>`. Both per-language `*-development` skills activate when `@backend` reads `local.yaml`.

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

Greenfield → `@product` + `@lead` Pattern B negotiation. Brownfield → reverse-doc election (Check 6) before forward chain.

### Check 6 — depth (brownfield only)

When `mode == "brownfield"` AND `local.yaml.depth` is unset, elect a depth preset. This decides which reverse-doc artifacts get authored before the forward chain takes over. Depth fires once per project; subsequent runs read `local.yaml.depth` and skip election.

| Depth | Reverse-doc artifact set per major feature | Author roles | When to pick |
|---|---|---|---|
| `light` | `PRD-<NNN>.md` (summary only) | `@product` | Project is small, well-understood, or you only need a feature inventory before forward work begins |
| `medium` | `PRD-<NNN>.md` + `FRS-<NNN>.md` + `TDD-<NNN>.md` | `@product`, `@lead` | Default for typical brownfield bootstraps; gives requirements + design baseline |
| `full` | `PRD-<NNN>.md` + `FRS-<NNN>.md` + `SAD.md` + `TDD-<NNN>.md` + `openapi.yaml` | `@product`, `@architect` (SAD), `@lead` | Architecturally rich projects with multiple services or non-trivial system boundaries; matches `chain_rigor: Full` |

**Major feature** = a top-level component / domain identifiable from the source tree (`src/<domain>/`, `services/<name>/`, `controllers/<resource>/`, `cmd/<binary>/`). Heuristic, not exhaustive — consumers can re-run with `--rediscover` after manual edits to feature scope.

**Election logic.**

- Default suggestion: `medium`. Most brownfield bootstraps don't need SAD reverse-doc to start moving; if it's needed later, run `--rediscover --depth=full`.
- Auto-recommend `full` when: `framework: Spring Boot` AND `scope_hints.file_count > 5000` AND multiple `*Application.java` entry points (multi-service Spring monorepo).
- Auto-recommend `light` when: `scope_hints.file_count < 200` (small project, low-cost full read).

Always present the recommendation; consumer overrides via interactive prompt or `--depth=<preset>`.

**Provenance.** Reverse-doc artifacts MUST carry frontmatter `notes: "reverse-documented from existing source"` (informational; no validator behavior change). Forward-chain artifacts authored post-bootstrap don't carry this note.

## Output shape

Write to (or update) `<project>/.orchestra/local.yaml`:

```yaml
discovery:
  mode: brownfield
  depth: medium                  # only set when mode == brownfield (Check 6)
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

Successive `/orchestra` runs read this and skip discovery unless the user passes `--rediscover`. Re-electing depth: pass `--rediscover --depth=<preset>`.

## Hand-off

### Greenfield → CHARTER + forward chain

After discovery completes (greenfield), the dispatcher routes by `intent.yaml.intent` into the forward chain. `@product` fills CHARTER FILL spans using the discovery snapshot (mode, language, framework, scope_hints) as Feasibility-section evidence. Forward chain proceeds normally.

### Brownfield → reverse-doc bootstrap, then forward chain

After discovery completes (brownfield) AND `local.yaml.depth` was elected for the first time, the dispatcher fans out reverse-doc author paths per the Check 6 table:

- `light` → spawn `@product` once per major feature with reverse-doc PRD task.
- `medium` → spawn `@product` (PRD + FRS) and `@lead` (TDD) per major feature.
- `full` → spawn `@architect` (project-level SAD), then per-feature `@product` (PRD + FRS) and `@lead` (TDD + openapi).

Each reverse-doc artifact is written under `docs/<feature-id>/` with frontmatter `notes: "reverse-documented from existing source"`. Reverse-doc completion sets `local.yaml.bootstrap: completed`. Subsequent `/orchestra` runs detect `bootstrap: completed` and route as forward-chain greenfield-equivalent.

Reverse-doc bootstrap is a Wave-C sequence that may take several hours of compute on `full` depth — consumers should expect a "first run is slow" cost amortized over the lifetime of the project.

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
  depth: light                                  # auto-recommended (file_count < 200)
  primary_language: javascript
  framework: null
  has_source: true
  scope_hints: { has_tests: true, has_ci: true, has_docker: false, file_count: ~50 }
```

`@lead` reads this and routes language-agnostic tasks (no Java / TS specialization needed). Depth `light` triggers a single `@product` reverse-doc PRD run for the orchestra plugin itself, then bootstrap completes — subsequent runs are forward-chain.
