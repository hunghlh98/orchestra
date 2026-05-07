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

### Step 2 — Author the .puml file

Path shape: `<owner-artifact-dir>/diagrams/<markdown-name>_<num>_<type>_<title>.puml`. Example: `architecture/diagrams/architecture_001_sequence_user_auth.puml`.

### Step 3 — Convert with retry (max 3 attempts)

```bash
python scripts/convert_puml.py <path>.puml --format svg
# Markdown extraction (handles ```puml blocks AND ![](path.puml) links):
python scripts/process_markdown_puml.py <path>.md --format svg
```

If conversion fails:

1. Run `java -jar ~/plantuml.jar --check-syntax <path>.puml` for the explicit error.
2. Look up the error in `references/troubleshooting/toc.md` (215+ errors across 12 category guides).
3. Cross-check `references/common_syntax_errors.md` for the diagram type.

Full retry / recovery process: `references/workflows/resilient-execution-guide.md`.

### Step 4 — Validate and integrate

1. Verify the rendered file exists.
2. Add the image link in the owning markdown: `![<alt>](diagrams/<file>.svg)`.
3. Keep the `.puml` source committed alongside the rendered image.

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
