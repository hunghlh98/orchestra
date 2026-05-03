---
name: task-breakdown
description: "Decomposes intent into a task graph with story-point estimates and agent assignments. Use when @lead routes a feature."
origin: orchestra
---

# task-breakdown

Turns a confirmed intent (PRD or natural-language request) into a directed acyclic task graph: each task has an owner agent, a story-point estimate, blocking dependencies, and exit criteria. `@lead` invokes this when classifying a routed intent into the appropriate execution pattern.

## When to use

- `@lead` has received a feature, refactor, or template intent classified per the PRD §9.5 routing taxonomy.
- An existing PRD-NNN.md or FRS-NNN.md needs decomposing into TDD-bound tasks.
- A sprint pull (`/orchestra sprint --size N`) needs the next N issues converted into a task graph.
- `@product` or `@lead` is sizing a brownfield migration and needs to estimate before negotiating with the user.

## Approach

### Step 1 — Identify deliverables

Read the PRD/FRS and list every artifact that must ship. Each deliverable is a task or task cluster. Examples:
- "API endpoint exists" → 1 task (impl) + 1 task (test) + 1 task (CONTRACT).
- "Frontend button wired" → 1 task (component) + 1 task (state slice) + 1 task (visual test).
- "Migration script" → 1 task (script) + 1 task (rollback) + 1 task (dry-run verification).

### Step 2 — Assign owners

Use the v1.0.0 agent roster (PRD §9.2). One owner per task; cross-tier handoffs become explicit edges.

| Task shape | Owner |
|---|---|
| Backend code/tests | `@backend` writes; `@evaluator` runs verdict |
| Frontend code/tests | `@frontend` writes; `@evaluator` runs verdict |
| Test plan / fuzz inputs | `@test` writes; `@evaluator` runs verdict |
| PRD / FRS / SAD / CONTRACT | `@product` or `@lead` writes |
| Code review | `@reviewer` |
| Release artifacts | `@ship` |

### Step 3 — Story-point estimate

Use the SP rubric (Fibonacci-ish). Calibrate against the *vertical depth* of work, not its breadth.

| SP | Meaning | Examples |
|---|---|---|
| 1 | Trivial — single file, no new logic | Rename, add comment, simple stub |
| 2 | Small — one component, known patterns | Add field, simple endpoint, basic test |
| 3 | Medium — multiple files, light coordination | New endpoint with DB + test, refactor a module |
| 5 | Large — several components, moderate uncertainty | Migration, new feature with FE+BE, integration test |
| 8 | Big — significant uncertainty or coordination | Cross-cutting refactor, novel domain, migration with rollback |
| 13 | **Decompose this further.** | If you reach 13, break the task into smaller tasks before assigning. |

Rule: any single task ≥13 SP gets split. Sprint capacity caps at the team's velocity; overshoot triggers a re-spec round.

### Step 4 — Map dependencies

Edges are unidirectional: `A → B` means B starts after A completes. Use these patterns:

- **Spec → impl** — PRD/FRS/CONTRACT precede backend/frontend/test code.
- **Impl → verdict** — implementer-tier task → `@evaluator` task that grades it.
- **Verdict → review** — `@evaluator` PASS → `@reviewer` task.
- **Review → ship** — `@reviewer` APPROVED → `@ship` task.

Avoid implicit ordering ("backend ships before frontend by tradition"). Make every dependency explicit so the wave team (Pattern C) can parallelize correctly.

### Step 5 — Identify the critical path

The longest dependency chain by SP sum is the critical path. Total sprint duration ≥ critical path. If critical path > sprint capacity, surface this to the user *before* execution starts — better to re-scope than overrun.

### Step 6 — Write the task graph

Output to `<project>/.claude/.orchestra/pipeline/<id>/TASKS-<id>.md` with shape:

```yaml
---
id: TASKS-<id>
type: TASKS
revision: 1
sections:
  S-TASKS-001: { hash: "TBD", confirmed: true }
references:
  - type: prd
    id: "<id>"
    section: S-FEATURE-001
    hash-at-write: "TBD"
---

## Task list <a id="S-TASKS-001"></a>

| ID | Owner | SP | Blocks | Blocked by | Exit criteria |
|---|---|---|---|---|---|
| T-001 | @backend | 3 | T-002, T-003 | — | endpoint at /v1/foo returns 201; CONTRACT criterion `foo.persists` PASS |
| T-002 | @test | 2 | T-005 | T-001 | adversarial fuzz: malformed JSON returns 400 |
| ... | ... | ... | ... | ... | ... |
```

## When to escalate

- Estimate uncertainty >2 SP for any task ("could be 3 or 5") → `@lead` flags this and asks `@product` for a re-spec round (Pattern B).
- Critical path > 1.5× sprint capacity → don't decompose further, surface to user with a "trim or extend?" question per PRD §8.11.
- Task can't be assigned to a v1.0.0 agent role → flag as "needs `@architect` or `@security`" and defer (those agents are v1.1+).

## References

For depth, see:
- `references/sp-matrix.md` — extended SP rubric with anchored examples per language and per task shape.
- `references/decomposition-patterns.md` — common task-cluster patterns (CRUD endpoint, migration, refactor) ready to clone.

(References are conditional; this skill body is sufficient for v1.0.0 use without them.)

## Worked example

User says: *"Add a /v1/users/:id/transfer endpoint that records to the ledger and emits an event."*

`@lead` decomposes:

| ID | Owner | SP | Blocks | Blocked by | Exit |
|---|---|---|---|---|---|
| T-001 | @lead | 1 | T-002 | — | CONTRACT-001.md written with 4 criteria |
| T-002 | @backend | 3 | T-005 | T-001 | endpoint impl + ledger write + event emit |
| T-003 | @test | 2 | T-005 | T-001 | adversarial fuzz: replay, double-debit, malformed body |
| T-004 | @backend | 2 | T-005 | T-001 | unit tests for ledger logic |
| T-005 | @evaluator | 2 | T-006 | T-002, T-003, T-004 | TEST-001.md verdict block: all 4 criteria PASS or pending |
| T-006 | @reviewer | 2 | T-007 | T-005 | CODE-REVIEW-001.md APPROVED |
| T-007 | @ship | 1 | — | T-006 | conventional commit + RELEASE notes if applicable |

Total: 13 SP. Critical path: T-001 → T-002 → T-005 → T-006 → T-007 = 9 SP. Parallelism on T-002/T-003/T-004 saves 4 SP of wall time.
