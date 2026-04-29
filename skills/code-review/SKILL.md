---
name: code-review
description: "Reviews code with severity-graded checklists for correctness, idioms, performance, security. Use when @reviewer grades a diff. Keywords: review, idioms, performance, security checklist, severity."
origin: orchestra
---

# code-review

Grades a code change with explicit severity tagging and an `APPROVED` / `REQUEST_CHANGES` / `pending` verdict. Read-only — `@reviewer` will *not* fix issues found, only report them. Confidence threshold: ≥80%; below that, return `pending`.

## When to use

- `@reviewer` has been spawned with a TEST-NNN.md verdict block in PASS state.
- The diff is staged or committed and ready for grading.
- A `@evaluator` PASS came back too fast and you want a sanity pass.

Do not invoke this skill for design review (that's `@product` + `@lead`'s domain) or for spec verification (that's `@evaluator`'s domain). This skill grades *implementation*.

## Approach

### Severity rubric

Every finding tags exactly one severity. The rubric is closed:

| Severity | Definition | Effect on verdict |
|---|---|---|
| **Critical** | Security flaw, data loss path, broken contract, unhandled adversarial input | Auto-`REQUEST_CHANGES`. No threshold. |
| **Major** | Logic bug, missing error path, incorrect domain modeling, broken test, race condition | ≥1 → `REQUEST_CHANGES` |
| **Minor** | Idiom violation, weak naming, dead code, style drift, incomplete comments | ≥3 → `REQUEST_CHANGES`, else inline comment |
| **Nit** | Subjective preference, micro-optimization, formatting | Inline comment, never blocking |

### Step 1 — Walk the diff structurally

Read the change file-by-file. Note:
- New files vs modified files vs deleted files.
- Per-file LOC delta (Δ > 200 in one file → flag for "split this PR").
- Adjacent untouched code that breaks under the new behavior (caller graph).

### Step 2 — Run the checklist gates

For every changed file, apply the per-language gate from `rules/<lang>/`. Skip silently if the file doesn't match any rule path.

**Universal gates (every file):**
- Does the change match its declared scope? (Conventional Commit type, PRD task ID.)
- Are there tests (or a test plan) covering the change?
- Are there secrets, credentials, or PII in the diff? (`pre-write-check` should have caught this; double-check.)
- Is dead code introduced or left behind?

**Per-language gates (where applicable):**
- TypeScript: `rules/typescript/{coding-style, patterns, security, testing}.md`
- Java: `rules/java/{coding-style, patterns, security, testing}.md`
- Other languages: `rules/<lang>/coding-style.md` (P2 stub — fall back to language conventions).

### Step 3 — Apply security checklist

Independent of language. Always check:
- Input validation at trust boundaries (HTTP handlers, MCP tools, CLI args).
- Output escaping for HTML/SQL/shell contexts.
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

A miss here is **Major** unless data-loss-adjacent (then Critical).

### Step 5 — Compute confidence

5 signals (each contributes equally):

| Signal | +20% if |
|---|---|
| Diff size is reviewable | < 400 LOC changed |
| Test coverage visible | tests exist for the changed paths |
| Domain familiarity | language is one of the P0 ruleset languages (Java, TS) |
| Spec clarity | upstream PRD/CONTRACT is `confirmed: true`, not `inferred` |
| Evaluator agreement | `@evaluator`'s TEST-NNN.md verdict aligns with what the code suggests |

Below 80% → `pending`. Below 60% → `pending` and request a `@lead` re-spec round.

### Step 6 — Write CODE-REVIEW-NNN.md

Path: `<project>/.claude/.orchestra/pipeline/<id>/CODE-REVIEW-<id>.md`. Shape per `docs/pipeline-schema.md`:

```yaml
---
id: CODE-REVIEW-<id>
type: CODE-REVIEW
revision: 1
verdict: APPROVED|REQUEST_CHANGES|pending
confidence: 0.<NN>
sections:
  S-FINDINGS-001: { hash: "TBD", confirmed: true }
references:
  - type: test
    id: "<id>"
    section: S-VERDICT-001
    hash-at-write: "TBD"
---

## Findings <a id="S-FINDINGS-001"></a>

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

Per PRD §9.6: 3 consecutive `REQUEST_CHANGES` rounds → write `DEADLOCK-<id>.md`, escalate to user. The implementer is not converging; further iterations are negative-EV.

## References

For depth, see:
- `references/severity-rubric.md` — extended examples per severity level with anchored cases.
- `references/language-checklists.md` — language-specific extras beyond `rules/<lang>/`.

(References are conditional; this body is sufficient for v1.0.0.)

## Worked example

Diff: backend adds `POST /v1/transfer` endpoint, ~180 LOC across 3 files. Tests exist. Language: TypeScript. CONTRACT-001.md is `confirmed: true`.

Walk:

1. **Structural** — 3 files, no LOC outliers. No deleted files. Caller graph unchanged.
2. **Universal gates** — tests present. No secrets. No dead code.
3. **TS rules** — checked against `rules/typescript/{coding-style, patterns, security, testing}.md`. One **Minor**: `try/catch` swallows error in `ledger.ts:42` (no logging).
4. **Security** — input validation on `amount` and `to_account` at handler. Auth check present. Idempotency key honored. ✓
5. **Performance** — single DB call per request. No loops. ✓
6. **Confidence** — diff small (+20), tests exist (+20), TS is P0 ruleset (+20), CONTRACT confirmed (+20), evaluator agreed (+20) = **100%**.

Verdict: **APPROVED** with one Minor finding inline. Write CODE-REVIEW-001.md and let `@ship` proceed.
