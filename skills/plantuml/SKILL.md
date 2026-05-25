---
name: plantuml
description: "PlantUML diagram authoring across 19 diagram types (sequence, class, activity, state, ER, Gantt, component, use-case, mindmap, etc.) plus orchestra-specific three-scope filename conventions (system / service / per-feature) and a sequence-diagram Operations Summary discipline (Redis, Kafka, DB-tables, lock-patterns, state-machine, endpoint-index). Use when any agent writes a .puml source. C4-shaped diagrams go through c4-architecture, which wraps this skill."
allowed-tools: Read, Write, Edit, Bash, Glob, Grep, Skill
origin: SpillwaveSolutions/plantuml@MIT (cloned for orchestra; examples/ trimmed)
---

# plantuml

Generates and converts PlantUML diagrams. Any orchestra agent authoring a `.puml` source invokes this skill.

## When to use

- An agent authors a `.puml` source (use-case, C4, sequence, ER, state, activity) and needs `.svg` / `.png` rendered.
- A markdown file contains ` ```puml ` blocks or `![](path.puml)` links and needs pre-rendering for Confluence / Notion (which don't render PlantUML inline).
- PlantUML syntax validation is needed before commit.

C4-shaped diagrams (`Context` / `Container` / `Component` / `Deployment` / `Dynamic`) → use `c4-architecture` skill instead — it wraps PlantUML with stdlib enforcement and audience routing.

## Prerequisites

```bash
python scripts/check_setup.py
```

| Component | Purpose | Install |
|-----------|---------|---------|
| Java JRE/JDK 8+ | Runtime | https://www.oracle.com/java/technologies/downloads/ |
| `plantuml.jar` | Diagram generator | https://plantuml.com/download — place in `~/plantuml.jar` or set `PLANTUML_JAR` |
| Graphviz | Complex layouts (REQUIRED for C4 Container/Component) | https://graphviz.org/download/ |

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

### Step 2 — Author the .puml file using orchestra conventions

Full rules (three-scope filename model, per-feature highlight rule, filename allowlist, C3-not-class-diagram caps, two-folder rule): `references/orchestra-conventions.md`.

### Step 3 — Render is hook-enforced (do not run conversion manually)

Writing a `.puml` file under any conventional path triggers the `post-write-puml` PostToolUse hook, which invokes the plantuml CLI to produce the paired `.svg`. The hook is **mandatory enforcement**: render-on-write is an invariant. If disabled (`ORCHESTRA_HOOK_POST_WRITE_PUML=off`), code-review fails any commit containing a `.puml` without paired `.svg`.

If the hook reports render failure (`post-write-puml: render failed for <path> — <reason>`):

1. Read the explicit error: `java -jar ~/plantuml.jar --check-syntax <path>.puml`.
2. Look up the error in `references/troubleshooting/toc.md` (215+ errors across 12 category guides).
3. Cross-check `references/common_syntax_errors.md` for the diagram type.

Do not invoke `convert_puml.py` / `process_markdown_puml.py` manually unless the hook is intentionally disabled.

### Step 4 — Embed and integrate (markdown side)

After the hook produces the `.svg`, the owning markdown must contain `![<alt>](diagrams/<filename>.svg)`. The hook scans sibling `.md` files for this reference and emits a non-blocking warning when missing — fix by adding the link to the owning artifact's body. Keep both `.puml` source and `.svg` render committed.

## Sequence diagrams — authoring discipline

Sequence diagrams under orchestra ship two authoring rules: a six-table **Operations Summary** (Redis Keys · Kafka Topics · Database Tables · Lock Patterns · State machine · API endpoint Index) listing infrastructure side-effects of the flow, and **`ref` block reuse** with canonical `SD-<id>` naming for sub-flows that recur across diagrams.

Full discipline — table schemas, `★SoT` / `◇Best-effort` Marker convention, two-surface placement (sibling `-ops.md` + in-diagram `note over` tail), four enforcement rules for `ref over`, fallback to `note over` pointer, sanitized worked examples — in `references/sequence_diagrams.md > § Orchestra authoring discipline`.

## Conversion scripts — manual fallback

```bash
# Standalone .puml conversion
python scripts/convert_puml.py diagram.puml --format svg

# Markdown extraction (```puml blocks + ![](path.puml) links)
python scripts/process_markdown_puml.py article.md --format svg
python scripts/process_markdown_puml.py article.md --validate     # syntax-check only

# Direct CLI
java -jar ~/plantuml.jar diagram.puml --svg --output-dir out/
java -jar ~/plantuml.jar "**/*.puml" --svg                        # batch
```

`process_markdown_puml.py` outputs `<source>_with_images.md` + `images/`. Run before uploading to Confluence / Notion.

PNG = web publishing, smaller files, fixed resolution. SVG = documentation, scalable, supports hyperlinks.

## When to escalate

- `plantuml.jar` not found → user installs (`PLANTUML_JAR` env var or `~/plantuml.jar`).
- Graphviz missing → user installs. C4 Container/Component diagrams will fail without it.
- Persistent syntax error past 3 retries → write `ESCALATE-<id>.md` with diagram source + `--check-syntax` output.

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

`sequence_diagrams.md`, `class_diagrams.md`, `activity_diagrams.md`, `state_diagrams.md`, `er_diagrams.md`, `gantt_diagrams.md`, `component_diagrams.md`, `use_case_diagrams.md`, `deployment_diagrams.md`, `object_diagrams.md`, `timing_diagrams.md`, `mindmap_diagrams.md`, `wbs_diagrams.md`, `network_diagrams.md`, `archimate_diagrams.md`, `json_yaml_diagrams.md`, `wireframes_salt.md`, `timeline_diagrams.md`, `ditaa_diagrams.md`.
