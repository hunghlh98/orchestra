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
*   **@product**: Owns the PRD and Business Rules (FRS).
*   **@architect**: Designs the system shape (SAD/ADR) and C4 diagrams.
*   **@lead**: Technical lead; maps specs to Component Design (TDD/OpenAPI).
*   **@backend / @frontend**: Focused implementers (Parallel execution).
*   **@test**: Spec-bound black-box testing (Zero-knowledge of implementation).
*   **@evaluator / @reviewer**: Strict-read-only verification for empirical quality.

## The Workflow Chain

The harness enforces a rigid, high-integrity pipeline:
`PRD → FRS → SAD → ADR → TDD → OpenAPI → Code + Tests → Verification`

Orchestra supports two distinct workflows:
*   **Greenfield:** Forward chain from PRD to Code.
*   **Brownfield:** Drop into an existing repo. Orchestra reverse-documents your current architecture, then runs the forward chain for new features.

## Implementation Deep Dive: Structural Rigor

### 1. Role separation: implementer vs. auditor
We enforce a structural boundary between agents that **generate** and agents that **evaluate** via tool-scoping (per-role `disallowedTools` in agent frontmatter):

| Role | Agents | Tools | Constraint |
|---|---|---|---|
| **Implementer** | `@backend`, `@frontend` | `Read`, `Write`, `Edit` | **No `Bash`**. Cannot run tests or see output. |
| **Auditor** | `@evaluator`, `@reviewer` | `Read`, `MCP:Probe` | **No `Write`**. Cannot modify source code. |


By stripping `Bash` from implementers, we force a handoff to `@test`. The `@evaluator` then grades the Test Summary Report (TSR) against OpenAPI criteria. If a `critical: true` criterion fails, `@evaluator` issues a `FAIL` verdict that implementers cannot bypass or "patch away."

### 2. Visual Proofs (PlantUML)
Diagrams are not decoration; they are visual proofs. Every chain layer has named diagram obligations (C4 L1-L4, Sequence, State, ERD) rendered via integrated PlantUML. Post-write hooks ensure that every `*.puml` has a paired `*.svg` and is embedded in the narrative prose.

### 3. Observability & Parallelism
The `metrics-collector.js` hook captures structured JSONL events (token spend, tool usage, phase). This powers `/orchestra report`, rendering Gantt charts and cost-by-role/phase pivots. Once the OpenAPI contract is locked, `@backend`, `@frontend`, and `@test` spawn in parallel to maximize throughput.

## Trade-offs & Limitations
1.  **Latency:** Structural handoffs add ~30-60s per iteration.
2.  **Rigidity:** Implementers cannot run local builds (v4.0 limitation).
3.  **Storage:** `.orchestra/` metadata requires management to avoid committing event logs.

## Conclusion
Orchestra shifts the focus from "better prompts" to "better harnesses." By enforcing tool tiers and schema-pinned documentation, we transform Claude Code into a verifiable autonomous engineering engine.

**Get Started:**
```bash
/plugin marketplace add hunghlh98/orchestra
/plugin install orchestra@orchestra-marketplace
```

---
*Orchestra v4.0 — Building the future of autonomous engineering.*
