---
name: code-review
description: "Severity-graded code review (Critical / Major / Minor / Nit) with closed-set checklists for correctness, surgical-change discipline (Karpathy rules), performance shapes, security boundaries, and a 14-row structural-failure taxonomy that auto-flips rev_verdict to REQUEST_CHANGES bypassing auto_mode. Use when @reviewer grades a staged diff after @evaluator's S-EVAL-001 sections reach PASS."
allowed-tools: Read, Glob, Grep, Skill
disable-model-invocation: true
origin: orchestra
---

# code-review

Grades a code change with explicit severity tagging. `@reviewer` invokes after `@evaluator`'s eval halves of `docs/<feature-id>/<feature-id>-TSR.md` are filled. Read-only — surfaces issues, never fixes them.

## When to use

- `@reviewer` spawned with `docs/<feature-id>/<feature-id>-TSR.md` eval halves in PASS state (`eval_verdict: PASS`).
- Diff is staged or committed and ready for grading.
- `@evaluator` PASS came back too fast and you want a sanity pass.

Skip for design review (`@product` / `@architect`'s domain) or spec verification (`@evaluator`'s domain). This skill grades *implementation*.

## Approach

### Severity rubric

Every finding tags exactly one severity. The rubric is closed:

| Severity | Definition | Effect on verdict |
|---|---|---|
| **Critical** | Security flaw, data-loss path, broken contract, unhandled adversarial input | Auto-`REQUEST_CHANGES`. No threshold. |
| **Major** | Logic bug, missing error path, incorrect domain modeling, broken test, race condition | ≥1 → `REQUEST_CHANGES` |
| **Minor** | Idiom violation, weak naming, dead code, style drift, incomplete comments | ≥3 → `REQUEST_CHANGES`, else inline comment |
| **Nit** | Subjective preference, micro-optimization, formatting | Inline comment, never blocking |

Confidence threshold: ≥80%. Below → `rev_verdict: PENDING`. Extended examples per severity: `references/severity-rubric.md`.

### Step 1 — Walk the diff structurally

Read file-by-file. Note new / modified / deleted, per-file LOC delta (Δ > 200 in one file → flag "split this PR"), and adjacent untouched code that breaks under the new behavior (caller graph).

### Step 2 — Karpathy discipline (load-bearing)

Three rules apply to every diff regardless of language:

1. **Match existing style.** The bar is "fits the codebase", not "fits your preferences". Lint/format conventions are the project's.
2. **Surgical changes.** Every changed line should trace directly to the task. Adjacent comments, unrelated formatting, "improvements" on neighboring code — flag as Major (out-of-scope).
3. **Minimum surface.** Speculative abstractions, single-use helpers wrapped in factory patterns, configurability nobody asked for — flag as Major. The bar is "minimum that solves the problem".

Naming / function-shape / smell heuristics: delegate to `clean-code` skill. Layer fit (Dependency Rule, adapter direction, framework leakage into entities): delegate to `clean-architecture` skill. Both skills hold the canonical rubric; this skill grades against it.

### Step 3 — Run the checklist gates

**Universal gates (every file):**

- Does the change match its declared scope? (Conventional Commit type, FRS requirement, openapi criterion.)
- Are there tests (or a test plan) covering the change?
- Are there secrets, credentials, or PII in the diff? (`pre-write-check` should have caught; double-check.)
- Is dead code introduced or left behind?
- **Diagram render parity**: any `.puml` file in the diff has a paired `.svg` next to it AND the owning markdown body cites `![..](diagrams/<name>.svg)`. Missing paired `.svg` → **Major** auto-`REQUEST_CHANGES`.
- **Cross-process boundary observability**: every outbound HTTP call, every Kafka publish, every Kafka consumer method, every DB error path in the diff emits INFO on receipt + outcome. HTTP carries route + status + latency; Kafka consume carries `topic` + `partition` + `offset` on receipt and a transition-or-rejection line on outcome. Missing instrumentation → **Major** (silent success is indistinguishable from "no traffic" during bring-up).

**Per-language gates** (when a per-language `*-development` skill is loaded for `local.yaml.primary_language`): apply that skill's convention checklist. Otherwise fall back to consumer repo's existing conventions OR `references/language-checklists.md`.

### Step 4 — Apply security checklist

Independent of language. Always check:

- Input validation at trust boundaries (HTTP handlers, MCP tools, CLI args).
- Output escaping for HTML / SQL / shell contexts.
- Authentication on every privileged path; authorization at the right layer.
- Secret handling: no credentials in code, logs, error messages, or test fixtures.
- Adversarial inputs documented in the test plan? Replay, malformed JSON, oversized body, race conditions.

A miss is **Critical** — auto-`REQUEST_CHANGES`.

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
| Domain familiarity | a per-language `*-development` skill loaded |
| Spec clarity | upstream PRD / openapi `description:` criteria concrete |
| Evaluator agreement | `@evaluator`'s TSR verdict aligns with code suggestion |

Below 80% → `rev_verdict: PENDING`. Below 60% → `PENDING` plus request a dispatcher-led re-spec round.

### Step 7 — Write reviewer section of `<feature-id>-TSR.md`

Read `docs/<feature-id>/<feature-id>-TSR.md` (`S-EVAL-001` filled by `@evaluator`). Fill `S-REVIEW-001`:

- One-paragraph verdict (APPROVED / REQUEST_CHANGES / PENDING) + per-severity findings table referencing `<file>:<line>` for each finding.
- Feature touched ADRs → append `## ADR review` subsection inside `S-REVIEW-001`; omit when no ADRs touched.

Set frontmatter `rev_verdict` + `rev_round` (current iteration). Set `sections.S-REVIEW-001.status: locked`. Preserve `S-TEST-001`, `S-EVAL-001`, `S-DIVERGENCES-001` verbatim — single-writer invariant. After all TSR sections lock, user commits by hand.

```markdown
## Reviewer verdict <a id="S-REVIEW-001"></a>

<APPROVED|REQUEST_CHANGES|PENDING> at confidence 0.<NN>. <one-paragraph summary>

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

## Structural failures

These checks auto-flip `rev_verdict: REQUEST_CHANGES` regardless of severity tally and bypass `auto_mode: true`. They are the closed set of pipeline-level invariants `@reviewer` enforces in addition to the per-language severity rubric.

- **Allowed-set violation** — artifact written outside the owning agent's allowed-set.
- **Diagram-allowlist violation** — `.puml` with forbidden prefix or wrong scope-folder per `skills/c4-architecture`.
- **Scope-content mismatch on workspace SAD** — `multi-repo` AND `S-CONTAINERS-001` enumerates <2 Container rows (services in topology rendered as `System_Ext` count as mismatch).
- **Contract presence** — HTTP endpoints with no `<feature-id>-openapi.yaml`; messaging handlers with no `<feature-id>-asyncapi.yaml`; outbound HTTP callsite with no `<feature-id>-clientapi.yaml` operation.
- **Use-case diagram missing end-user actor** — per-service `docs/<service>/diagrams/usecase.puml` MUST declare ≥1 `actor` matching a PRD `S-STAKEHOLDERS-001` end-user persona for any feature contributing an `append-usecases` row in the locked plan. Operators / back-office / internal-services / BFFs are NOT end users.
- **Writing-style escalation** — ≥3 hedges OR ≥2 preambles per artifact (per `agents/architect.md > ## Writing style` and equivalents on other authoring agents).
- **Unresolved-question in locked PRD / FRS** — body containing `## Open Question`, `S-OPEN-Q-*`, `TBD`, `pending`, `to be determined`, `???`, or `?`-suffixed declarative claim.
- **Untraced AC** — FRS `S-AC-001` row with empty `Traces` or `Traces` not matching `BR-AC/BR-NNN` / `BR-AC/AC-NNN` / `BR-AC/INV-NNN` / `business-invariants.md/INV-NNN`. Also: `S-BR-001` row with empty `Owner` (push to `S-INVARIANTS-001`).
- **Untraced term** — chain artifact (PRD / FRS / BR-AC) introducing a domain noun present in workspace `docs/glossary.md > S-GLOSSARY-001` without the matching `glossary.md/S-GLOSSARY-001/<Term>` cite. AC / BR / INV rows carry the cite in the `Traces` cell; PRD / FRS prose carry it inline. Per `schemas/glossary.schema.md > Citation discipline`.
- **Feature attribution in BR-AC body** — row referencing `<feature-id>` (`#order-001-checkout`, `added by feature N`). Push to feature TDD / FRS / openapi.
- **Tech leakage in PRD / FRS** — locked body containing implementation-only tokens per the PRD surface-discipline denylist.
- **Unworthy ADR** — `status: proposed` failing any of the three worthiness gates per `skills/c4-architecture > Step 9 — ADR-worthiness gates`. Reverse-pass DIV rows arriving as ADR proposals are always unworthy.
- **Entity-schema parity** — ghost column (entity declares, DB lacks) or orphan column (DB has, entity lacks) inconsistent with `S-DATA-001` ownership.
- **Missing cross-process observability** — outbound HTTP / Kafka publish / Kafka consumer without INFO log on receipt + outcome.
- **src/ purity** — chain-artifact anchor cite (PRD / FRS / TDD / openapi / TSR / FR-N / AC-N / S-XXX-NNN / ADR-NNNN) in `src/**` (`chain-cite-reject` gate misfired or disabled — investigate).

## Circuit breaker

3 consecutive `REQUEST_CHANGES` rounds → write `<feature-id>-DEADLOCK-<slug>.md`, escalate to user. Implementer is not converging; further iterations are negative-EV.

## When to escalate

- Confidence <60% → `pending` + request a dispatcher-led re-spec.
- Diff >1000 LOC AND lacks tests → `REQUEST_CHANGES` with "split this PR" guidance.
- 3 consecutive REQUEST_CHANGES → DEADLOCK.

## References

- `references/severity-rubric.md` — extended examples per severity level + edge cases.
- `references/language-checklists.md` — generic per-language checks (Java/TS/Python/Go/Rust/SQL); canonical convention sets live in the per-language `*-development` skills.
- `skills/clean-code/SKILL.md` — meaningful names, F.I.R.S.T. tests, 22 code-smell heuristics. Canonical rubric for Step 2 surgical-change discipline and Step 3 per-language idiom gates.
- `skills/clean-architecture/SKILL.md` — Dependency-Rule layering, adapter direction, framework leakage. Canonical rubric for "structural failure: layer mismatch" findings.
