---
name: task-breakdown
description: "Decomposes intent into a task graph with story-point estimates and agent assignments. Use when @lead routes a feature."
origin: orchestra
---

# task-breakdown

Turns a confirmed intent (PRD or natural-language request) into a directed acyclic task graph: each task has an owner agent, a story-point estimate, blocking dependencies, and exit criteria. `@lead` invokes when classifying a routed intent into the appropriate execution pattern.

## When to use

- `@lead` has received a feature, refactor, or template intent classified per the routing taxonomy.
- An existing `docs/<feature-id>/<feature-id>-PRD.md` or `<feature-id>-FRS.md` needs decomposing into TDD-bound tasks.
- A sprint pull (`/orchestra sprint --size N`) needs the next N issues converted into a task graph.
- `@product` or `@lead` is sizing a brownfield migration and needs to estimate before negotiating with the user.

## Approach

### Step 1 — Identify deliverables

Read the PRD/FRS and list every artifact that must ship. Each deliverable is a task or task cluster:

- "API endpoint exists" → 1 task (impl) + 1 task (test) + 1 task (CONTRACT).
- "Frontend button wired" → 1 task (component) + 1 task (state slice) + 1 task (visual test).
- "Migration script" → 1 task (script) + 1 task (rollback) + 1 task (dry-run verification).

### Step 2 — Assign owners

One owner per task; cross-tier handoffs become explicit edges.

| Task shape | Owner |
|---|---|
| Backend code/tests | `@backend` writes; `@evaluator` runs verdict |
| Frontend code/tests | `@frontend` writes; `@evaluator` runs verdict |
| Test plan / fuzz inputs | `@test` writes; `@evaluator` runs verdict |
| PRD / FRS / SAD / CONTRACT | `@product` or `@lead` writes |
| Code review | `@reviewer` |

### Step 3 — Story-point estimate

SP rubric (Fibonacci-ish). Calibrate against *vertical depth* of work, not breadth.

| SP | Meaning | Examples |
|---|---|---|
| 1 | Trivial — single file, no new logic | Rename, add comment, simple stub |
| 2 | Small — one component, known patterns | Add field, simple endpoint, basic test |
| 3 | Medium — multiple files, light coordination | New endpoint with DB + test, refactor a module |
| 5 | Large — several components, moderate uncertainty | Migration, FE+BE feature, integration test |
| 8 | Big — significant uncertainty or coordination | Cross-cutting refactor, novel domain, migration with rollback |
| 13 | **Decompose this further.** | If you reach 13, split before assigning. |

Any single task ≥13 SP gets split. Sprint capacity caps at team velocity; overshoot triggers a re-spec round.

### Step 4 — Map dependencies

Edges are unidirectional: `A → B` means B starts after A completes.

- **Spec → impl** — PRD/FRS/CONTRACT precede backend/frontend/test code.
- **Impl → verdict** — implementer-tier task → `@evaluator` task that grades it.
- **Verdict → review** — `@evaluator` PASS → `@reviewer` task.
- **Review → ship** — `@reviewer` APPROVED → user invokes `/orchestra ship` (manual; not a task-graph node).

Avoid implicit ordering ("backend ships before frontend by tradition"). Make every dependency explicit so the wave team (Pattern C) can parallelize correctly.

### Step 5 — Identify the critical path

Longest dependency chain by SP sum is the critical path. Total sprint duration ≥ critical path. If critical path > sprint capacity, surface to user *before* execution starts — better to re-scope than overrun.

### Step 6 — Write the task graph

Author `<context_path>/.orchestra/<service_name>/pipeline/<feature-id>/<feature-id>-TASKS.md`. Frontmatter carries `status:` / `verdict:` / `readers:` / `sections:` per `schemas/pipeline-artifact.schema.md`. Body anchors `S-DAG-001` and `S-TASKS-001`; embed the DAG via `![]()` against `diagrams/tasks-dag.svg` (the `post-write-puml` hook renders the `.svg` from a paired `.puml` source).

Frontmatter (v2.0 slim):

```yaml
---
id: <feature-id>-TASKS
type: TASKS
created: <ISO-8601>
revision: 1
task_graph_node_count: <int>
estimated_sp: <int>
tasks_pending: <int>
tasks_in_progress: 0
tasks_done: 0
---
```

Body:

```markdown
## DAG <a id="S-DAG-001"></a>

<one-line description of work shape: waves, fan-out, critical path>

![Task DAG](diagrams/tasks-dag.svg)

## Tasks <a id="S-TASKS-001"></a>

| ID | Owner | SP | Blocks | Blocked by | Exit criteria | Status |
|---|---|---|---|---|---|---|
| T-001 | @backend | 3 | T-002, T-003 | — | endpoint at /v1/foo returns 201; CONTRACT criterion `foo.persists` PASS | pending |
| T-002 | @test | 2 | T-005 | T-001 | adversarial fuzz: malformed JSON returns 400 | pending |
| ... | ... | ... | ... | ... | ... | ... |
```

Author the DAG `.puml` source at `diagrams/tasks-dag.puml` (PlantUML activity-diagram shape: nodes for each T-NNN, edges for dependencies, swimlanes optional per owner). Invoke `/plantuml` to render to `.svg`.

Initial Status is `pending` for every row. Owning agents flip Status as work progresses per `schemas/pipeline-artifact.schema.md` TASKS-<id> rules: implementer-tier (`@backend`, `@frontend`) self-reports `pending → in_progress → done`; read-only-tier (`@evaluator`, `@reviewer`) status is derived from TSR frontmatter (`eval_verdict`, `rev_verdict`) and rows stay `pending` in TASKS.md. Lockfile entry for `S-TASKS-001` carries `confirmed: false` so the drift validator skips inevitable mutations.

## When to escalate

- Estimate uncertainty >2 SP for any task ("could be 3 or 5") → `@lead` flags this and asks `@product` for a re-spec round (Pattern B).
- Critical path > 1.5× sprint capacity → don't decompose further; surface to user with "trim or extend?" question.
- Task can't be assigned to a current agent role → flag as "needs-future-specialist" and defer.

## References

- `references/sp-matrix.md` — extended SP rubric with anchored examples per language and per task shape.
- `references/decomposition-patterns.md` — common task-cluster patterns (CRUD endpoint, migration, refactor) ready to clone.

## Worked example

User: *"Add a `/v1/users/:id/transfer` endpoint that records to the ledger and emits an event."*

| ID | Owner | SP | Blocks | Blocked by | Exit | Status |
|---|---|---|---|---|---|---|
| T-001 | @lead | 1 | T-002 | — | `docs/001-transfer/001-transfer-openapi.yaml` written with 4 criteria | pending |
| T-002 | @backend | 3 | T-005 | T-001 | endpoint impl + ledger write + event emit | pending |
| T-003 | @test | 2 | T-005 | T-001 | adversarial fuzz: replay, double-debit, malformed body | pending |
| T-004 | @backend | 2 | T-005 | T-001 | unit tests for ledger logic | pending |
| T-005 | @evaluator | 2 | T-006 | T-002, T-003, T-004 | `docs/001-transfer/001-transfer-TSR.md S-EVAL-001`: all 4 criteria PASS | pending |
| T-006 | @reviewer | 2 | — | T-005 | `docs/001-transfer/001-transfer-TSR.md S-REVIEW-001`: APPROVED | pending |

Total: 12 SP. Critical path: T-001 → T-002 → T-005 → T-006 = 8 SP. Parallelism on T-002 / T-003 / T-004 saves 4 SP wall time.
