---
name: code-review
description: "Reviews code with severity-graded checklists for correctness, idioms, performance, security. Use when @reviewer grades a diff."
origin: orchestra
---

# code-review

Grades a code change with explicit severity tagging. `@reviewer` invokes after `@evaluator`'s eval halves of `docs/<feature-id>/<feature-id>-TSR.md` are filled. Read-only — surfaces issues, never fixes them.

## When to use

- `@reviewer` has been spawned with `docs/<feature-id>/<feature-id>-TSR.md` eval halves in PASS state (`eval_verdict: PASS`).
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

Confidence threshold: ≥80%. Below → `rev_verdict: PENDING` (don't approve uncertainty; don't reject without grounds).

### Step 1 — Walk the diff structurally

Read file-by-file. Note new / modified / deleted, per-file LOC delta (Δ > 200 in one file → flag "split this PR"), and adjacent untouched code that breaks under the new behavior (caller graph).

### Step 2 — Karpathy discipline (load-bearing)

Three rules apply to every diff regardless of language:

1. **Match existing style.** If you'd write it differently, that's not the bar — the bar is "fits the codebase". Lint/format conventions are the project's, not yours.
2. **Surgical changes.** Every changed line should trace directly to the task. Adjacent comments, unrelated formatting, "improvements" on neighboring code — flag as Major (out-of-scope).
3. **Minimum surface.** Speculative abstractions, single-use helpers wrapped in factory patterns, configurability nobody asked for — flag as Major. The bar is "minimum that solves the problem".

### Step 3 — Run the checklist gates

**Universal gates (every file):**

- Does the change match its declared scope? (Conventional Commit type, FRS requirement, openapi criterion.)
- Are there tests (or a test plan) covering the change?
- Are there secrets, credentials, or PII in the diff? (`pre-write-check` should have caught; double-check.)
- Is dead code introduced or left behind?
- **Diagram render parity**: any `.puml` file in the diff has a paired `.svg` next to it AND the owning markdown body cites `![..](diagrams/<name>.svg)`. The `post-write-puml` hook normally enforces this on write; this gate is the failsafe when the hook is disabled. Missing paired `.svg` → **Major** auto-`REQUEST_CHANGES` (cannot review what isn't rendered).

**Per-language gates** (when a per-language `*-development` skill is loaded for `local.yaml.primary_language`): apply that skill's convention checklist to changed files. Otherwise fall back to the consumer repo's existing conventions (formatter config, lint rules, test harness).

### Step 4 — Apply security checklist

Independent of language. Always check:

- Input validation at trust boundaries (HTTP handlers, MCP tools, CLI args).
- Output escaping for HTML / SQL / shell contexts.
- Authentication on every privileged path; authorization at the right layer.
- Secret handling: no credentials in code, logs, error messages, or test fixtures.
- Adversarial inputs documented in the test plan? Replay, malformed JSON, oversized body, race conditions.

A miss here is **Critical** — auto-`REQUEST_CHANGES`.

### Step 5 — Apply performance checklist

Lightweight (no profiling). Flag obvious shapes:

- N+1 queries (loops calling DB).
- Synchronous I/O on a hot path.
- Unbounded memory growth (in-memory caches without TTL or LRU).
- Quadratic or worse complexity on user-controlled input size.

A miss is **Major** unless data-loss-adjacent (then **Critical**).

### Step 6 — Compute confidence

5 signals, each contributes +20%:

| Signal | +20% if |
|---|---|
| Diff size reviewable | < 400 LOC changed |
| Test coverage visible | tests exist for changed paths |
| Domain familiarity | a per-language `*-development` skill loaded for the primary language |
| Spec clarity | upstream PRD / openapi `description:` criteria are concrete (not "TBD" / placeholder) |
| Evaluator agreement | `@evaluator`'s TSR verdict aligns with what code suggests |

Below 80% → `rev_verdict: PENDING`. Below 60% → `PENDING` plus request `@lead` re-spec round.

### Step 7 — Write reviewer section of `<feature-id>-TSR.md`

Read `docs/<feature-id>/<feature-id>-TSR.md` (`S-EVAL-001` filled by `@evaluator`). Fill `S-REVIEW-001`:

- One-paragraph verdict (APPROVED / ALLOW_WITH_GAP / REQUEST_CHANGES / PENDING) + per-severity findings table (Critical / Major / Minor / Nit) referencing `<file>:<line>` for each finding.
- If the feature touched ADRs, append a `## ADR review` subsection inside `S-REVIEW-001`; omit when no ADRs were touched.

Set frontmatter `rev_verdict` (APPROVED|ALLOW_WITH_GAP|REQUEST_CHANGES|PENDING) + `rev_round` (current iteration). Set `sections.S-REVIEW-001.status: locked`. Preserve `S-TEST-001`, `S-EVAL-001`, `S-DIVERGENCES-001` verbatim — single-writer invariant. The final `ship:` frontmatter value is computed by `/orchestra ship` from `eval_verdict` + `rev_verdict` + `local.yaml.tsr_gate_mode` (with `<feature-id>-DRAFT-COMPLETE.md` marker presence under deferred mode).

```markdown
## Reviewer verdict <a id="S-REVIEW-001"></a>

<APPROVED|ALLOW_WITH_GAP|REQUEST_CHANGES|PENDING> at confidence 0.<NN>. <one-paragraph summary>

### Critical
- (none) | <one-line summary> at <file:line> — <rationale>

### Major
- <one-line summary> at <file:line> — <rationale>

### Minor
- ...

### Nit
- ...

### ADR review (omit subsection if no ADRs touched)
- ADR-<NNNN>-<slug>: <APPROVED|REQUEST_CHANGES> — <one-line rationale>
```

## Circuit breaker

3 consecutive `REQUEST_CHANGES` rounds → write `<feature-id>-DEADLOCK-<slug>.md`, escalate to user. The implementer is not converging; further iterations are negative-EV.

## When to escalate

- Confidence <60% → `pending` + request `@lead` re-spec.
- Diff >1000 LOC AND lacks tests → `REQUEST_CHANGES` with "split this PR" guidance.
- 3 consecutive REQUEST_CHANGES → DEADLOCK (see Circuit breaker).

## References

- `references/severity-rubric.md` — extended examples per severity level.
- `references/language-checklists.md` — language-specific extras (general; per-language `*-development` skills carry the canonical convention sets).

## Worked example

Diff: backend adds `POST /v1/transfer`, ~180 LOC across 3 files. Tests exist. Language: Java. `docs/001-foo/001-foo-openapi.yaml` is `status: locked` with concrete criteria.

1. **Structural** — 3 files, no LOC outliers, no deleted files, caller graph unchanged.
2. **Karpathy** — diff matches existing service layout; no out-of-scope edits; no speculative abstractions. Pass.
3. **Universal gates** — tests present. No secrets. No dead code.
4. **Per-language gate** — `java-development` skill loaded; `mvn checkstyle` clean. One **Minor**: `try/catch` swallows error in `LedgerService.java:42` (no logging).
5. **Security** — input validation on `amount` and `to_account`; auth check present; idempotency key honored. Pass.
6. **Performance** — single DB call per request. No loops. Pass.
7. **Confidence** — diff small (+20), tests exist (+20), java-development loaded (+20), openapi concrete (+20), evaluator agreed (+20) = **100%**.

Verdict: **APPROVED** with one Minor finding. Fill `S-REVIEW-001` in `docs/001-foo/001-foo-TSR.md`. Set `rev_verdict: APPROVED`, `rev_round: 1`. Hand to `/orchestra ship`.
