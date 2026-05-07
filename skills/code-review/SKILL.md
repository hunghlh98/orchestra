---
name: code-review
description: "Reviews code with severity-graded checklists for correctness, idioms, performance, security. Use when @reviewer grades a diff."
origin: orchestra
---

# code-review

Grades a code change with explicit severity tagging. `@reviewer` invokes after `@evaluator`'s eval halves of `verify/<NNN>-TSR.md` are filled. Read-only — surfaces issues, never fixes them.

## When to use

- `@reviewer` has been spawned with `verify/<NNN>-TSR.md` eval halves in PASS state (`eval_verdict: PASS`).
- The diff is staged or committed and ready for grading.
- A `@evaluator` PASS came back too fast and you want a sanity pass.

Skip for design review (`@product` / `@lead`'s domain) or spec verification (`@evaluator`'s domain). This skill grades *implementation*.

## Approach

### Severity rubric

Every finding tags exactly one severity. The rubric is closed:

| Severity | Definition | Effect on verdict |
|---|---|---|
| **Critical** | Security flaw, data-loss path, broken contract, unhandled adversarial input | Auto-`REQUEST_CHANGES`. No threshold. |
| **Major** | Logic bug, missing error path, incorrect domain modeling, broken test, race condition | ≥1 → `REQUEST_CHANGES` |
| **Minor** | Idiom violation, weak naming, dead code, style drift, incomplete comments | ≥3 → `REQUEST_CHANGES`, else inline comment |
| **Nit** | Subjective preference, micro-optimization, formatting | Inline comment, never blocking |

Confidence threshold: ≥80%. Below → `rev_verdict: pending` (don't approve uncertainty; don't reject without grounds).

### Step 1 — Walk the diff structurally

Read file-by-file. Note new / modified / deleted, per-file LOC delta (Δ > 200 in one file → flag "split this PR"), and adjacent untouched code that breaks under the new behavior (caller graph).

### Step 2 — Run the checklist gates

For every changed file, apply the per-language gate from `rules/<lang>/`. Skip silently if no rule path matches.

**Universal gates (every file):**

- Does the change match its declared scope? (Conventional Commit type, PRD task ID.)
- Are there tests (or a test plan) covering the change?
- Are there secrets, credentials, or PII in the diff? (`pre-write-check` should have caught; double-check.)
- Is dead code introduced or left behind?

**Per-language gates (where applicable):**

- TypeScript: `rules/typescript/{coding-style,patterns,security,testing}.md`
- Java: `rules/java/{coding-style,patterns,security,testing}.md`
- Other languages: `rules/<lang>/coding-style.md` (P2 stub — fall back to language conventions).

### Step 3 — Apply security checklist

Independent of language. Always check:

- Input validation at trust boundaries (HTTP handlers, MCP tools, CLI args).
- Output escaping for HTML / SQL / shell contexts.
- Authentication on every privileged path; authorization at the right layer.
- Secret handling: no credentials in code, logs, error messages, or test fixtures.
- Adversarial inputs documented in the test plan? Replay, malformed JSON, oversized body, race conditions.

A miss here is **Critical** — auto-`REQUEST_CHANGES`.

### Step 4 — Apply performance checklist

Lightweight in v1.0.0 (no profiling). Flag obvious shapes:

- N+1 queries (loops calling DB).
- Synchronous I/O on a hot path.
- Unbounded memory growth (in-memory caches without TTL or LRU).
- Quadratic or worse complexity on user-controlled input size.

A miss is **Major** unless data-loss-adjacent (then **Critical**).

### Step 5 — Compute confidence

5 signals, each contributes +20%:

| Signal | +20% if |
|---|---|
| Diff size reviewable | < 400 LOC changed |
| Test coverage visible | tests exist for changed paths |
| Domain familiarity | language is P0 ruleset (Java, TS) |
| Spec clarity | upstream PRD / CONTRACT is `confirmed: true`, not `inferred` |
| Evaluator agreement | `@evaluator`'s TSR verdict aligns with what code suggests |

Below 80% → `rev_verdict: pending`. Below 60% → `pending` plus request `@lead` re-spec round.

### Step 6 — Write reviewer halves of verify/<NNN>-TSR.md

Read the scaffolded `verify/<NNN>-TSR.md` (eval halves filled by `@evaluator`). Fill:

- `S-REV-VERDICT-001` — verdict (APPROVED / REQUEST_CHANGES / pending) + one-paragraph summary.
- `S-REV-FINDINGS-001` — per-severity findings table (Critical / Major / Minor / Nit) referencing `<file>:<line>` for each finding.

Set frontmatter `rev_verdict` (APPROVED|REQUEST_CHANGES|pending) + `rev_round` (current iteration). Preserve `S-EVAL-*` and `S-SHIP-001` verbatim — Tier-A single-writer invariant.

```markdown
## Reviewer verdict <a id="S-REV-VERDICT-001"></a>

<APPROVED|REQUEST_CHANGES|pending> at confidence 0.<NN>. <one-paragraph summary>

## Reviewer findings <a id="S-REV-FINDINGS-001"></a>

### Critical
- (none) | <one-line summary> at <file:line> — <rationale>

### Major
- <one-line summary> at <file:line> — <rationale>

### Minor
- ...

### Nit
- ...
```

## Circuit breaker

3 consecutive `REQUEST_CHANGES` rounds → write `DEADLOCK-<id>.md`, escalate to user. The implementer is not converging; further iterations are negative-EV.

## When to escalate

- Confidence <60% → `pending` + request `@lead` re-spec.
- Diff >1000 LOC AND lacks tests → `REQUEST_CHANGES` with "split this PR" guidance.
- 3 consecutive REQUEST_CHANGES → DEADLOCK (see Circuit breaker).

## References

- `references/severity-rubric.md` — extended examples per severity level.
- `references/language-checklists.md` — language-specific extras beyond `rules/<lang>/`.

## Worked example

Diff: backend adds `POST /v1/transfer`, ~180 LOC across 3 files. Tests exist. Language: TypeScript. `interfaces/001-CONTRACT.md` is `confirmed: true`.

1. **Structural** — 3 files, no LOC outliers, no deleted files, caller graph unchanged.
2. **Universal gates** — tests present. No secrets. No dead code.
3. **TS rules** — applied `rules/typescript/{coding-style,patterns,security,testing}.md`. One **Minor**: `try/catch` swallows error in `ledger.ts:42` (no logging).
4. **Security** — input validation on `amount` and `to_account`; auth check present; idempotency key honored. ✓
5. **Performance** — single DB call per request. No loops. ✓
6. **Confidence** — diff small (+20), tests exist (+20), TS is P0 (+20), CONTRACT confirmed (+20), evaluator agreed (+20) = **100%**.

Verdict: **APPROVED** with one Minor finding inline. Fill `S-REV-VERDICT-001` + `S-REV-FINDINGS-001` in `verify/001-TSR.md`. Set `rev_verdict: APPROVED`, `rev_round: 1`. Hand to `@ship`.
