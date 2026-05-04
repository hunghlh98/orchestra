# @evaluator calibration examples

> Worked PASS/FAIL/pending judgments for boundary cases. The `val-calibration` hook reads this file on every `Task(subagent_type=evaluator)` spawn and prepends it as `<calibration-anchor>...</calibration-anchor>`. The point: anchor `@evaluator`'s judgment to consistent semantics across sessions and contexts.

---

## Verdict semantics

A criterion's verdict is one of: **PASS** / **FAIL** / **pending**.

- **PASS** — every probe in the criterion's `probes:` list passes; no critical-failure condition triggered; all adversarial fuzz inputs (if listed) handled correctly. Confidence in PASS must be ≥80% — below that, return `pending`, never `PASS`.
- **FAIL** — at least one probe fails; OR any critical-failure condition triggered; OR an adversarial fuzz input regresses the system; OR the criterion's required artifact is missing/malformed.
- **pending** — probes haven't been run yet (initial state), OR confidence is below 80% in either direction.

A criterion is graded against its CONTRACT-defined `weight:` (sum across all criteria for the feature = 100). Final feature score = sum of `weight` × (PASS=1, pending=0, FAIL=−0.5 for partial-credit, capped at 0).

---

## PASS criteria (all must hold)

- Every listed probe returned the expected status / body / DB row state.
- No `critical:` condition in the CONTRACT triggered (e.g., "5xx on any happy-path probe").
- All `adversarial:` inputs were handled per the documented contract (status, body, side effects).
- The artifact under review (verify/<NNN>-TEST.md, code, etc.) is present and well-formed per pipeline-schema.md.
- Confidence in PASS ≥80%. If `@evaluator` is uncertain — even after re-running probes — return `pending`, not `PASS`.

## FAIL criteria (any triggers FAIL)

- Any probe failed (wrong status, body redacted unexpectedly, timeout, DB row missing/extra).
- Any `critical:` condition triggered.
- An adversarial fuzz input passed through unhandled (e.g., replay attack, SQL injection, malformed JSON crashed handler).
- Required artifact missing or frontmatter invalid.
- Drift detected on a `confirmed: true` upstream section while this run was in flight (escalate to deadlock).

## pending criteria

- Probes haven't been run.
- Probes ran but returned ambiguous evidence (e.g., 200 with empty body, criterion under-specified).
- Confidence below 80% even after re-investigation.

`@evaluator` returns `pending`, never guesses. The `@reviewer` and `@lead` then decide whether to re-spec the criterion or accept the ambiguity.

---

## Boundary cases

The 8 cases below are the v1.0.0 calibration baseline. `@evaluator` must judge similar shapes the same way unless the CONTRACT explicitly overrides.

### Case 1: Probe returns 200, body empty
**Scenario:** A `GET /health` probe expects status 200 and `body.contains("ok")`. The server returns status 200 with an empty body (`Content-Length: 0`).
**Verdict:** **FAIL**
**Why:** The status check passes but the body assertion fails. PASS requires every assertion in the probe to hold. An empty body is not an "ok" body. If the CONTRACT only specified status, this would be PASS — but if `body.contains` is listed, it's load-bearing.

### Case 2: Probe times out at 4.95s with 5s cap
**Scenario:** Probe `timeout_ms: 5000`. Response arrived after 4.95s with status 200 and correct body.
**Verdict:** **PASS**
**Why:** The probe completed within budget. The 5s timeout is a hard cap, not a soft target. SLO conversations belong in CONTRACT criteria like `latency_p95 < 500ms` — different criterion, different verdict path.

### Case 3: 3 of 4 weighted criteria PASS (75/100 weighted score)
**Scenario:** Criteria: A (weight 30, PASS), B (weight 25, PASS), C (weight 20, PASS), D (weight 25, FAIL). Weighted score = 75/100.
**Verdict at the criterion level:** Each verdict stands as graded — A/B/C PASS, D FAIL. **Do not "round up" because the feature scored 75.**
**Verdict at the feature level:** The CONTRACT's `passing_score:` field (default 80 if unspecified per write-contract skill) decides whether the feature ships. 75 < 80 → feature does not ship.
**Why:** `@evaluator` grades each criterion independently. Aggregation is `@ship`'s call against `passing_score:`, not `@evaluator`'s.

### Case 4: Adversarial fuzz — replay attack passes
**Scenario:** Adversarial input "replay the same `POST /transfer` request twice with the same idempotency key". Both requests return 200 and the database shows two debit entries.
**Verdict:** **FAIL**
**Why:** Idempotency violation. Even though the probe assertion (status 200) might pass, an adversarial-input regression is a critical-failure condition. The whole point of listing it adversarially is that "passing through" = failure.

### Case 5: Redirect chain 302 → 200 with `follow_redirects: false`
**Scenario:** Probe sets `follow_redirects: false`, asserts `status == 200`. Server returns 302 → 200 chain. Probe sees 302.
**Verdict:** **FAIL**
**Why:** With redirects off, the immediate response is the verdict. 302 ≠ 200. If the CONTRACT meant "follow redirects", it would say so. Don't infer intent — grade the contract literally.

### Case 6: DB row exists but `secret` field redacted in `db_state` response
**Scenario:** `db_state` query `SELECT user_id, api_token FROM users WHERE id=1` returns a row, but `api_token` shows as `[REDACTED:bearer-auth]` (orchestra-probe redaction). Criterion asserts `row.api_token == "abc123"`.
**Verdict:** **pending** (NOT FAIL)
**Why:** The probe MCP redacts secret-shaped values before returning rows. The criterion can't be evaluated through orchestra-probe. Either: (a) the criterion is unsuitable for `db_state` evaluation and should re-spec to a side-channel check; or (b) the redaction is a false positive and the test fixture should be re-run with a non-secret-shaped token. Either way: re-spec, don't FAIL on tooling artifact.

### Case 7: Critical-failure condition flagged but probes all PASS
**Scenario:** All probes return expected results. But the CONTRACT lists `critical: "no PII in logs"` and grep reveals `email=user@example.com` in the test run's log file.
**Verdict:** **FAIL**
**Why:** Critical-failure conditions outrank probe results. They exist precisely to catch PASSes-by-accident. PII leak in logs is FAIL even if every functional probe passed.

### Case 8: `inferred:` upstream section drifts mid-test
**Scenario:** Mid-evaluation, `validate-drift.js` fires and reports a `drift-on-inferred` warning on an upstream PRD section that this CONTRACT references.
**Verdict for the criterion:** Continue the evaluation. The criterion's verdict stands on its own probes.
**Verdict for the feature:** Note the drift in the verify/<NNN>-TEST.md verdict block. `@reviewer` sees the warning and decides whether to re-confirm the upstream section or accept the inference.
**Why:** `inferred:` sections are warnings, not blockers. Drift on `confirmed:` upstream would FAIL the run; drift on `inferred:` is informational. Don't conflate the two.

---

## How to use this anchor

When you (`@evaluator`) read a criterion in a verify/<NNN>-TEST.md or interfaces/<NNN>-CONTRACT.md:

1. **Identify the verdict path.** PASS / FAIL / pending — these are the only three.
2. **Check critical-failure conditions first.** If any triggered, FAIL stops the search.
3. **Run every probe in the criterion's `probes:` list.** Probe failure → FAIL.
4. **Run every adversarial fuzz input.** Pass-through of adversarial input → FAIL.
5. **Confirm artifact existence and well-formedness.** Missing → pending; malformed → FAIL.
6. **Compute confidence.** Below 80% in either direction → pending.
7. **Write the verdict** to the verify/<NNN>-TEST.md verdict block. Include: probes run, results, observed behavior, rationale.

Default to `pending` when uncertain. Better to escalate than to ship a false PASS.
