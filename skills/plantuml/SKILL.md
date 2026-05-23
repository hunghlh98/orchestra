---
name: plantuml
description: Generates PlantUML diagrams from text descriptions and converts .puml sources to PNG/SVG. Use when an orchestra agent authors a diagram (use-case, C4, sequence, ER, state, activity, etc.).
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

### Step 2 — Author the .puml file using fixed-name conventions

Orchestra uses a **three-scope model** so chain artifacts reference diagrams by stable name. System-level singletons live under `docs/diagrams/`; service-level singletons live under `docs/<service_name>/diagrams/`; per-feature copies (system L1+L2 with feature-touched elements highlighted) live under `docs/<service_name>/<feature-id>/diagrams/` with `<feature-id>-` filename prefix.

| Scope | Path | Files | Owner |
|---|---|---|---|
| System singleton | `docs/diagrams/` | `c4-context.puml`, `c4-container.puml`, `erd-logical.puml`, `sequence-inter-<flow>.puml` | `@architect` |
| Service singleton | `docs/<service_name>/diagrams/` | `c4-component.puml`, `c4-code.puml` (opt-in; ≥3 classes) | `@architect` |
| Per-feature | `docs/<service_name>/<feature-id>/diagrams/` | `<feature-id>-{c4-context,c4-container,frs-usecase,state-business,sequence-intra-<usecase>,state-technical,erd-physical}.puml` | `@analyst` (frs-usecase, state-business) / `@architect` (others) |

When a new feature changes a `Component()` / `Rel()` / class line in a service-level file, leave a `' #<feature-id>` PlantUML line comment above the changed line. Provenance lives in comments; rendered diagram stays uncluttered.

Per-feature L1+L2 copies differ from system singletons ONLY in styling (`UpdateElementStyle()` / `UpdateRelStyle()` highlights) — never in element identity. NO per-feature L3/L4 copies; service-level L3+L4 carry feature provenance via `' #<feature-id>` line comments.

### Step 2a — Filename allowlist (enforced)

Forbidden by default: `AD-*` (activity), `SAGA-*`, `SD-*` (use `sequence-inter-<flow>.puml` / `<feature-id>-sequence-intra-<usecase>.puml`), `ERD-*` (use `erd-logical.puml` / `<feature-id>-erd-physical.puml`), `C2-*` / `C3-*` short-hands, ad-hoc `*-overview.puml` / `*-architecture.puml`, and **any L3/L4 file outside the service's own `diagrams/` folder**.

Supplementary diagrams outside allowlist require `--enable-supplementary-diagrams` AND a stated rationale in the relevant ADR or TDD section. Reviewer flags any other prefix as structural failure.

### Step 2b — C3 is not a class diagram

C3 (component) diagrams describe service-internal *components*, not Java classes. Caps when authoring `c4-component.puml`:

- 5–10 components per service. More than 10 → split the service into containers at L2 first.
- Label by responsibility (`OrderValidator`, `PaymentDispatcher`), not Java class name (`OrderServiceImpl`).
- No methods, no fields, no parameter lists in C3.
- Internal class structure belongs in TDD prose or in C4 L4 (when service warrants L4).
- L4 (code-level) is opt-in only: code-to-spec reverse-pass defaults OFF unless TDD justifies L4 in `S-COMPONENTS-001`.

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

Two content rules apply to every sequence diagram (`*-sd-*.puml`, `sequence-intra-*.puml`, `sequence-inter-*.puml`). The diagram source shows lifelines + messages; the rules below cover what reviewers also need.

### Operations Summary tables

Every sequence diagram ships a markdown sibling `<id>-ops.md` listing the six tables below when the flow touches the resource. The tables answer "what side-effects does this flow have on infrastructure?" so reviewers can audit cache TTLs, lock blast-radius, DB writes, and producer/consumer topology without re-reading the diagram syntax.

| Table | Columns |
|---|---|
| Redis Keys | Key pattern · Purpose · TTL |
| Kafka Topics | Topic · Producer · Consumer |
| Database Tables | Database · Table · Operation · Key Fields |
| Lock Patterns | Lock Key · Type · TTL · On Failure |
| State machine | States · Workflow |
| API endpoint Index | #ID · Caller · Callee · Method + Path · Contract File |

Placement: `docs/<service_name>/<feature-id>/<feature-id>-sd-<seq>.puml` ships next to `<feature-id>-sd-<seq>-ops.md`. Empty tables omitted; an absent table means "this flow does not touch that surface" — explicit not-applicable, not silent omission. When a table applies but is empty (e.g., feature touches Kafka but only as a consumer, no producer row), keep the header and write `_(none)_` in the body so readers know it was considered.

Worked example for a "transfer" sequence diagram:

```markdown
# transfer-001-sd-checkout — Operations Summary

## Redis Keys
| Key pattern | Purpose | TTL |
|---|---|---|
| `transfer:lock:{idempotency_key}` | Per-key idempotency guard | 60s |
| `transfer:rate:{user_id}` | Per-user rate limit token bucket | 1h sliding |

## Kafka Topics
| Topic | Producer | Consumer |
|---|---|---|
| `transfer.completed.v1` | transfer-service | ledger-projector, notification-service |

## Database Tables
| Database | Table | Operation | Key Fields |
|---|---|---|---|
| ledger | transactions | INSERT | id, idempotency_key, amount, status |
| ledger | balance_snapshots | UPDATE | user_id, balance, updated_at |

## Lock Patterns
| Lock Key | Type | TTL | On Failure |
|---|---|---|---|
| `transfer:lock:{idempotency_key}` | Redis SET NX EX | 60s | 409 Conflict; client retries with same key |

## State machine
| States | Workflow |
|---|---|
| pending → authorized → captured → settled | Webhook on each transition; rollback path: any → reversed |

## API endpoint Index
| #ID | Caller | Callee | Method + Path | Contract File |
|---|---|---|---|---|
| 1 | client | transfer-service | POST /v1/transfers | transfer-001-openapi.yaml |
| 2 | transfer-service | ledger-service | POST /internal/v1/postings | transfer-001-clientapi.yaml |
| 3 | transfer-service | notification-service | (async) transfer.completed.v1 | transfer-001-asyncapi.yaml |
```

### `ref` block reuse for shared sub-flows

When a sub-flow recurs across two or more sequence diagrams, source-of-truth lives in ONE diagram with a canonical name `SD-<id>: <Diagram Name>`. Other diagrams cite it via PlantUML's `ref over <participants>` block carrying a short title + step-range body. Removes copy-paste duplication and keeps cited steps single-edit.

Reference syntax (embed in the citing diagram between the `@startuml` participants block and the calling step):

```
ref over SUB, CSH, ORD, PE, PGW, PSP, EB, FUL, GA
  **SD-W17: Subscription Registration (Sub-Flows 2–3)**
  [5] Subscription → Cashier.ConfirmPayment(isTransSubscription=true)
  [6] Cashier → Order.CreateOrder → Inventory.createAppTransID
  [7] Cashier → PE.CreatePaymentIntent → PG → PSP quick_pay
  [8] PSP IPN → PG → PE → PaymentSuccess → Order PAID → OrderPaid
  [9] Fulfillment delivers → DeliverySuccess
  [10] Subscription consumes delivery_result
end ref
```

Rules:

- Participants listed in `ref over` MUST appear in the citing diagram's `participant` / `actor` declarations (PlantUML stdlib requires lifeline binding for `ref over`).
- Title line uses `**SD-<id>: <Diagram Name> (<sub-flow range>)**` — bold, sub-flow range in parentheses when only part of the referenced diagram applies.
- Body steps reuse the SAME `[N]` step numbering as the canonical diagram. Do NOT renumber.
- The canonical diagram MUST include a top-of-file `' SD-<id>` comment so `grep -rn 'SD-W17' docs/` resolves to one origin file.

When `ref over` is impractical (citing diagram has more than ~6 participants, or the cited steps would clutter the body), use a `note over <participants>` pointer instead: `note over SUB, CSH: see SD-W17 for sub-flows [5]-[10]`.

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
