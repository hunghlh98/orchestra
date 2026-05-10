---
name: plantuml
description: Generates PlantUML diagrams from text descriptions and converts .puml sources to PNG/SVG. Use when an orchestra agent authors a diagram (use-case, C4, sequence, ER, state, activity, etc.).
origin: SpillwaveSolutions/plantuml@MIT (cloned for orchestra v2.0.0; examples/ trimmed)
---

# plantuml

Generates and converts PlantUML diagrams. Any orchestra agent authoring a `.puml` source invokes this skill.

## When to use

- An agent authors a `.puml` source (use-case, C4, sequence, ER, state, activity, etc.) and needs `.svg` / `.png` rendered.
- A markdown file contains ` ```puml ` blocks or `![](path.puml)` links and needs pre-rendering for Confluence / Notion (which don't render PlantUML inline).
- PlantUML syntax validation is needed before commit.

If the diagram is C4-shaped (`Context` / `Container` / `Component` / `Deployment` / `Dynamic`), use the `c4-architecture` skill — it wraps PlantUML with stdlib enforcement and audience routing.

## Prerequisites

```bash
python scripts/check_setup.py
```

| Component | Purpose | Install |
|-----------|---------|---------|
| Java JRE/JDK 8+ | Runtime | https://www.oracle.com/java/technologies/downloads/ |
| `plantuml.jar` | Diagram generator | https://plantuml.com/download — place in `~/plantuml.jar` or set `PLANTUML_JAR` |
| Graphviz | Complex layouts (REQUIRED for C4 Container / Component) | https://graphviz.org/download/ |

## Approach

### Step 1 — Identify diagram type and load reference

| User intent | Diagram type | Reference |
|---|---|---|
| Interactions over time | Sequence | `references/sequence_diagrams.md` |
| System structure with classes | Class | `references/class_diagrams.md` |
| Workflows / decisions | Activity | `references/activity_diagrams.md` |
| Object states / transitions | State | `references/state_diagrams.md` |
| Database schemas | ER | `references/er_diagrams.md` |
| Project timelines | Gantt | `references/gantt_diagrams.md` |
| System architecture | Component | `references/component_diagrams.md` |
| Actors and features | Use case | `references/use_case_diagrams.md` |
| All 19 types | Navigation hub | `references/toc.md` |

Universal elements (delimiters, comments, notes, metadata): `references/common_format.md`. Modern styling: `references/styling_guide.md`.

### Step 2 — Author the .puml file using v4.0 fixed-name conventions

Orchestra v4.0 uses a **two-folder model** so the chain artifacts can reference diagrams by stable name. Project singletons (latest state of the system) live under `docs/diagrams/`; per-feature copies (with feature-touched elements highlighted) live under `docs/<feature-id>/diagrams/` and prefix every filename with `<feature-id>-`. Never invent a new name unless it falls outside this set.

**Project-level (singletons under `docs/diagrams/`):**

| File | Owner | Trigger |
|---|---|---|
| `c4-l1-context.puml` | `@architect` | SAD bootstrap (greenfield) |
| `c4-l2-container.puml` | `@architect` | SAD bootstrap |
| `c4-l3-<service>.puml` | `@lead` | every TDD; one file per primary service container |
| `c4-l4-<service>.puml` | `@lead` | every TDD under `chain_rigor: Full`; class structure for the service |
| `erd-logical.puml` | `@architect` | persistence-affecting ADR accepted |
| `sequence-inter-<flow>.puml` | `@architect` | per cross-service flow |

**Per-feature (under `docs/<feature-id>/diagrams/`, prefix `<feature-id>-`):**

| File | Owner | Trigger |
|---|---|---|
| `<feature-id>-c4-l1-context.puml` | `@lead` | every TDD; copy of project L1 with this feature's touches highlighted |
| `<feature-id>-c4-l2-container.puml` | `@lead` | every TDD; copy of project L2 with highlights |
| `<feature-id>-c4-l3-<service>.puml` | `@lead` | every TDD; copy of project L3 with highlights |
| `<feature-id>-frs-usecase.puml` | `@product` | every FRS |
| `<feature-id>-state-business.puml` | `@product` | when feature has user-facing lifecycle |
| `<feature-id>-sequence-intra-<usecase>.puml` | `@lead` | per primary use case |
| `<feature-id>-state-technical.puml` | `@lead` | when component has internal lifecycle |
| `<feature-id>-erd-physical.puml` | `@lead` | when persistence touched |

Per-feature copies of project singletons differ from their source ONLY in styling (`UpdateElementStyle()` / `UpdateRelStyle()` highlights) — never in element identity. See `c4-architecture` skill for the highlight protocol. The owning markdown embeds the rendered `.svg` via `![<alt>](diagrams/<filename>.svg)`.

### Step 3 — Render is hook-enforced (do not run conversion manually)

Writing a `.puml` file under any of the conventional paths triggers the `post-write-puml` PostToolUse hook, which invokes the plantuml CLI to produce the paired `.svg`. The hook is **mandatory enforcement**: render-on-write is an invariant, not a courtesy. If the hook is disabled (`ORCHESTRA_HOOK_POST_WRITE_PUML=off`), code-review will fail any commit containing a `.puml` without its paired `.svg`.

If the hook reports render failure (stderr line: `post-write-puml: render failed for <path> — <reason>`):

1. Read the explicit error: `java -jar ~/plantuml.jar --check-syntax <path>.puml`.
2. Look up the error in `references/troubleshooting/toc.md` (215+ errors across 12 category guides).
3. Cross-check `references/common_syntax_errors.md` for the diagram type.

Do not invoke `convert_puml.py` or `process_markdown_puml.py` manually unless the hook is intentionally disabled (e.g., during plugin development under `ORCHESTRA_HOOK_POST_WRITE_PUML=off`); the hook handles render on every write.

### Step 4 — Embed and integrate (markdown side)

After the hook produces the `.svg`, the owning markdown must contain `![<alt>](diagrams/<filename>.svg)`. The hook also scans sibling `.md` files for this reference and emits a non-blocking warning when missing — fix the warning by adding the link to the owning artifact's body. Keep both `.puml` source and `.svg` render committed.

## Conversion scripts — reference

```bash
# Standalone .puml conversion
python scripts/convert_puml.py diagram.puml                       # PNG (default)
python scripts/convert_puml.py diagram.puml --format svg
python scripts/convert_puml.py diagram.puml --format svg --output-dir images/

# Markdown extraction (```puml blocks + ![](path.puml) links)
python scripts/process_markdown_puml.py article.md                # PNG
python scripts/process_markdown_puml.py article.md --format svg
python scripts/process_markdown_puml.py article.md --validate     # syntax-check only

# Direct CLI
java -jar ~/plantuml.jar diagram.puml
java -jar ~/plantuml.jar --svg --output-dir out/ diagram.puml
java -jar ~/plantuml.jar "**/*.puml" --svg                        # batch
```

`process_markdown_puml.py` outputs `<source>_with_images.md` (markdown with image links replacing inline blocks) and `images/` (rendered files). Run it before uploading to Confluence / Notion.

PNG = web publishing, smaller files, fixed resolution. SVG = documentation, scalable, supports hyperlinks.

## When to escalate

- `plantuml.jar` not found → user installs (`PLANTUML_JAR` env var or `~/plantuml.jar`).
- Graphviz missing → user installs from https://graphviz.org/download/. C4 Container/Component diagrams will fail without it.
- Persistent syntax error past 3 retries → write `ESCALATE-<id>.md` with the diagram source + the `--check-syntax` output; user resolves.

## References

### Core syntax

| Resource | Purpose |
|---|---|
| `references/toc.md` | Navigation hub — all 19 diagram types |
| `references/common_format.md` | Universal elements (delimiters, comments, notes, metadata) |
| `references/styling_guide.md` | Modern `<style>` syntax (CSS-like) |
| `references/plantuml_reference.md` | Full CLI + installation details |
| `references/unicode_symbols.md` | Semantic enrichment with emoji / Unicode |

### Troubleshooting

| Resource | Coverage |
|---|---|
| `references/troubleshooting/toc.md` | Error decision tree (entry point) |
| `references/troubleshooting/installation_setup_guide.md` | Setup problems |
| `references/troubleshooting/general_syntax_guide.md` | Syntax errors |
| `references/troubleshooting/<diagram_type>_guide.md` | Diagram-specific errors (12 guides) |

### Diagram-type files

`references/sequence_diagrams.md`, `references/class_diagrams.md`, `references/activity_diagrams.md`, `references/state_diagrams.md`, `references/er_diagrams.md`, `references/gantt_diagrams.md`, `references/component_diagrams.md`, `references/use_case_diagrams.md`, `references/deployment_diagrams.md`, `references/object_diagrams.md`, `references/timing_diagrams.md`, `references/mindmap_diagrams.md`, `references/wbs_diagrams.md`, `references/network_diagrams.md`, `references/archimate_diagrams.md`, `references/json_yaml_diagrams.md`, `references/wireframes_salt.md`, `references/timeline_diagrams.md`, `references/ditaa_diagrams.md`.

## Worked example

User intent: *"Create a sequence diagram showing OAuth login flow."*

1. **Type**: Sequence → load `references/sequence_diagrams.md`.
2. **Author** at `docs/diagrams/oauth_001_sequence_login.puml`:

   ```puml
   @startuml
   actor User
   participant App
   participant AuthServer
   User -> App: Click "Login"
   App -> AuthServer: GET /authorize
   AuthServer --> User: Show login form
   User -> AuthServer: POST credentials
   AuthServer --> App: 302 + auth_code
   App -> AuthServer: POST /token
   AuthServer --> App: access_token
   @enduml
   ```

3. **Convert**: `python scripts/convert_puml.py docs/diagrams/oauth_001_sequence_login.puml --format svg`.
4. **Integrate**: add `![OAuth login](diagrams/oauth_001_sequence_login.svg)` to `docs/auth.md`. Commit both `.puml` + `.svg`.
