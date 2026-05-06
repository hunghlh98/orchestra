---
name: karpathy-guidelines
description: "Behavioral guidelines reducing common LLM coding mistakes — surface assumptions, minimum surface, surgical edits, verifiable goals. Apply during artifact authoring and code editing."
origin: forrestchang/andrej-karpathy-skills (adapted; ideas attributed to Andrej Karpathy)
---

# karpathy-guidelines

Behavioral guidelines that reduce common LLM coding mistakes. Adapted from Andrej Karpathy's observations on LLM coding pitfalls, compiled by `forrestchang/andrej-karpathy-skills`. Rephrased here in orchestra's tier vocabulary so each agent knows when (and how) to apply them.

**Tradeoff:** these guidelines bias toward caution over speed. Trivial mechanical edits (typo fixes, lockfile bumps, format-only changes) skip them.

## When to use

Invoke at the start of any work that produces artifact text or source diffs:

- `@product` / `@lead` — before filling a scaffolded CHARTER / PRD / FRS / TDD / CONTRACT / TASKS span.
- `@backend` / `@frontend` — before editing any source file claimed by a `plan/<NNN>-TASKS.md` row.
- `@test` — before authoring `verify/<NNN>-TEST.md` or test source.

Skip for `@evaluator`, `@reviewer`, `@ship`. Their tier-A/B invariants (calibration anchor, severity rubric in `code-review`, gate-driven release flow) supersede these rules and would conflict if invoked. See *Tier-by-tier applicability* below for the rationale.

## The four rules

### 1. Think before authoring

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before writing the first character of an artifact span or source line:

- State assumptions explicitly. If the upstream artifact (PRD anchor, CONTRACT criterion, TDD section) is silent on a question your work depends on, name the gap.
- If multiple interpretations exist, present them — don't pick silently. For `@product` / `@lead`, this maps to confidence-tiered AskUserQuestion (HIGH = 0, MEDIUM = 1, LOW = 2–3, hard cap 3). For implementer agents, it maps to writing `ESCALATE-<id>.md` rather than guessing.
- If a simpler approach exists than what the upstream prescribes, say so before implementing the prescribed one. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Either ask (within the dialogue cap) or escalate.

### 2. Minimum surface

**Smallest artifact / diff that satisfies the criterion. Nothing speculative.**

- No artifact sections beyond what the scaffold provides; the validator's `structural-diff` mode will reject extras.
- No CONTRACT criteria you cannot probe via `orchestra-probe` MCP. Unprobable behavior → `manual_evaluation: true` for `@reviewer` to grade, never an unrunnable probe.
- No abstractions for single-use code. No "flexibility" or "configurability" not requested by FRS / TDD.
- No error handling for impossible scenarios. Trust the contract.
- If you wrote 200 lines and 50 would do, rewrite it.

The senior-engineer test: would a peer call this overcomplicated? If yes, simplify before handing off.

### 3. Surgical edits

**Touch only what the assigned task says. Clean up only what your changes broke.**

When editing existing source under a `@backend` / `@frontend` / `@test` task:

- Don't "improve" adjacent code, comments, or formatting. Don't refactor the unbroken.
- Match existing project conventions (formatter, imports, package layout). Even if you'd write it differently, conform.
- Pre-existing dead code stays unless the task explicitly removes it. If you notice unrelated dead code, mention it in the commit body — don't silently delete.
- Imports / variables / helpers that **your** change made unused: remove them. Pre-existing unused imports: leave.

The trace test: every changed line should map to a task row, a CONTRACT criterion, or a `critical: true` finding. Lines that don't trace are out-of-scope and belong in a follow-up task.

When editing artifact spans (`@product` / `@lead` / `@test`):

- Preserve every `<a id="S-...">` anchor verbatim. The hash-stamper resolves them; structural-diff rejects deviation.
- Replace `<!-- FILL: ... -->` placeholders with content. Don't add new H2 headers beyond the scaffold.

### 4. Verifiable goals

**Define the success criterion before the work. Loop until verified.**

Transform soft asks into machine-gradable shapes:

- "Add validation" → CONTRACT criterion with adversarial-input probe; `@evaluator` grades PASS / FAIL / pending.
- "Fix the bug" → failing test that reproduces it (in `verify/<NNN>-TEST.md` coverage matrix), then make it green.
- "Refactor X" → coverage-matrix rows that pass before AND after; aggregate score must not regress.

For multi-step tasks, write the verification points up front. `@lead`'s `plan/<NNN>-TASKS.md` is exactly this surface — exit criterion per row, owner per row, dependency edges.

Strong success criteria let the implementer agent loop independently and let `@evaluator` grade decisively. Weak criteria ("make it work", "improve the UX") stall the pipeline at PAUSE-1 because nobody knows when to stop.

## Tier-by-tier applicability

Different agents need different sections. Apply per the table; the rules you skip are covered by your tier-specific invariants elsewhere.

| Agent | Tier | Apply | Skip | Why skip |
|---|---|---|---|---|
| `@product` | T-B | 1, 4 | 2, 3 | No source diffs (artifacts only); `2/3` are diff-shaped rules. |
| `@lead` | T-B | 1, 2, 4 | 3 | Same — no diffs. CONTRACT-criterion authoring is exactly *minimum surface*; ADR triggers ARE the *tradeoffs* in rule 1. |
| `@backend` | T-C | 1, 2, 3, 4 | — | Full set; rules were written for implementers. |
| `@frontend` | T-C | 1, 2, 3, 4 | — | Full set. The 4-state rule (loading / empty / error / success) is itself goal-driven; reinforcement is welcome. |
| `@test` | T-C | 2, 3, 4 | 1 | `@test` doesn't dialogue — gaps go to `ESCALATE-<id>.md`, not AskUserQuestion. |
| `@evaluator` | T-A | — | all | Calibration anchor's `≥80% confidence → pending` semantic supersedes "ask if uncertain". `@evaluator` never edits, so the diff rules don't apply. |
| `@reviewer` | T-A | — | all | `code-review` skill's severity rubric is the canonical site for review wisdom. "Never patch the diff" tier rule conflicts with rule 3's "remove orphans your changes created" (the diff is empty by design). |
| `@ship` | T-B | — | all | Gate-driven release flow already encodes verifiable goals; `commit-work`'s "one coherent commit per logical feature" already encodes minimum surface. |

If you're an agent listed under *Skip*, do **not** invoke this skill — the layered rule set will produce conflict noise. Stick to your tier discipline.

## Conflict resolution

Where these guidelines collide with an orchestra-specific rule, the orchestra rule wins:

- Rule 1 says "ask if uncertain". `@evaluator` and `@reviewer` say "below 80% confidence → `pending`, never ask". The threshold rule wins; downgrade to `pending`.
- Rule 2 says "no error handling for impossible scenarios". CONTRACT `critical: true` security criteria override; defensive validation at trust boundaries is mandatory regardless.
- Rule 3 says "match existing style". `rules/<lang>/coding-style.md` overrides if it disagrees; the path-activated rule is closer to project ground truth.

## Attribution

- Andrej Karpathy's original observations: <https://x.com/karpathy/status/2015883857489522876>
- forrestchang's compilation: <https://github.com/forrestchang/andrej-karpathy-skills>

Adapted for orchestra v2.1.0. The upstream repository carries no LICENSE file at the time of import; this skill's text is rewritten in orchestra's voice and tier vocabulary, not copied verbatim. If forrestchang or Karpathy publishes a license clarification later, frontmatter will be updated.
