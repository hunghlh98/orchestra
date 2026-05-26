# Orchestra: The SDLC Engine for Claude Code

AI agents don't fail because they lack intelligence. They fail because they lack boundaries. 

When you give an LLM a terminal and a vague "implement feature X" prompt, you aren't building a pipeline; you're playing a high-stakes game of chance. **Orchestra** transforms Claude Code from a chat interface into a multi-agent SDLC pipeline. It gives a single developer a full engineering team's rigor without the overhead.

**The Thesis:** *"The model IS the agent. Build harnesses, not prompt chains."*

Orchestra isn't just a prompt; it’s a structural framework (harness) that enforces SDLC best practices through specialized roles, schema-pinned artifacts, and automated gates.

## The Problem: The Hallucination of Done

Traditional agent workflows suffer from three systemic failures:
*   **Context Smearing:** Implementers "fix" tests to match buggy code when given both tools.
*   **Spec Drift:** Traceability between PRD and unit tests is lost in the token stream.
*   **Observability Gaps:** Intermediate tool calls are opaque, making cost and performance optimization impossible.

## Architecture: The Multi-Agent Roster

Orchestra spawns a specialized team for every run, ensuring no single agent owns the entire stack:
*   **@product**: Owns the PRD and `features.yaml` manifest entry.
*   **@analyst**: Authors the FRS (BR/AC/pseudocode) from a locked PRD.
*   **@architect**: Designs the system shape (SAD/ADR), C4 diagrams, per-feature TDD, and `openapi.yaml` / `clientapi.yaml` contracts.
*   **@explorer**: Reverse-pass source surveyor; authors per-service Explorer Reports (read-only on `src/**`).
*   **@backend / @frontend**: Focused implementers (Parallel execution).
*   **@test-author**: Spec-bound black-box test author (no Bash, no `src/main/**` read).
*   **@test-runner**: Impl-aware test runner; reads source, adds white-box edge cases, executes the suite.
*   **@evaluator**: Strict read-only evidence grader for TSR rows.
*   **@reviewer**: Diff and ADR reviewer; writes the TSR review verdict.

## The Workflow Chain

The harness enforces a rigid, high-integrity pipeline:
`PRD → FRS → SAD → ADR → TDD → OpenAPI → Code + Tests → Verification`
Authoring handoffs: `@product` → `@analyst` → `@architect` → fan-out `(@backend ‖ @frontend ‖ @test-author)` → converge `(@test-runner → @evaluator + @reviewer)`.

Orchestra supports two distinct workflows:
*   **Greenfield:** Forward chain from PRD to Code.
*   **Brownfield:** Drop into an existing repo. Orchestra reverse-documents your current architecture, then runs the forward chain for new features.

## Implementation Deep Dive: Structural Rigor

### 1. Role separation: implementer vs. auditor
We enforce a structural boundary between agents that **generate** and agents that **evaluate** via tool-scoping (per-role `disallowedTools` / allow-lists in agent frontmatter):

| Role | Agents | Tools | Constraint |
|---|---|---|---|
| **Implementer** | `@backend`, `@frontend` | `Read`, `Write`, `Edit` | **No `Bash`**. Cannot run tests or see output. |
| **Test author** | `@test-author` | `Read` (spec only), `Write` | **No `Bash`, no `src/main/**` read.** Spec-bound; sees openapi + PRD + FRS only. |
| **Test runner** | `@test-runner` | `Read`, `Write`, `Bash` | Impl-aware; reads source, adds edge cases, runs the suite, fills TSR `status` + `evidence`. |
| **Evidence grader** | `@evaluator` | `Read`, `MCP:orchestra-probe` | **Strict read-only on filesystem.** Writes only the TSR `S-EVAL-001` section via the schema gate. |
| **Reviewer** | `@reviewer` | `Read`, `Write` (TSR section only) | Writes the TSR `S-REVIEW-001` verdict and flags retroactive ADR-worthy decisions. |

By stripping `Bash` from implementers, we force a handoff to `@test-runner`. The `@evaluator` then grades the Test Summary Report (TSR) against OpenAPI criteria. If a `critical: true` criterion fails, `@evaluator` issues a `FAIL` verdict that implementers cannot bypass or "patch away."

### 2. Visual Proofs (PlantUML)
Diagrams are not decoration; they are visual proofs. Every chain layer has named diagram obligations (C4 L1-L4, Sequence, State, ERD) rendered via integrated PlantUML. Post-write hooks ensure that every `*.puml` has a paired `*.svg` and is embedded in the narrative prose.

### 3. Observability & Parallelism
The `metrics-collector.js` hook captures structured JSONL events (token spend, tool usage, phase). This powers `/orchestra report`, rendering Gantt charts and cost-by-role/phase pivots. Once the OpenAPI contract is locked, `@backend`, `@frontend`, and `@test-author` spawn in parallel to maximize throughput.

## Trade-offs & Limitations
1.  **Latency:** Structural handoffs add ~30-60s per iteration.
2.  **Rigidity:** Implementers cannot run local builds — `Bash` denied by tool allowlist. Test execution lives only on `@test-runner`.
3.  **Storage:** `.orchestra/` metadata requires management to avoid committing event logs.

## Conclusion
Orchestra shifts the focus from "better prompts" to "better harnesses." By enforcing tool tiers and schema-pinned documentation, we transform Claude Code into a verifiable autonomous engineering engine.

**Get Started:**
```bash
/plugin marketplace add hunghlh98/orchestra
/plugin install orchestra@orchestra-marketplace
```

---
*Orchestra — Building the future of autonomous engineering.*
