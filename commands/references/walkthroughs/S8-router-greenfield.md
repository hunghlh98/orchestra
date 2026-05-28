---
strategy: S8
entry: /orchestra <intent>
precondition: greenfield router (src/** empty)
---

# S8 — `<intent>` router, greenfield

**Trigger.** `$1` NOT one of `spec-to-code` / `code-to-spec` / empty; preflight `mode: greenfield` (`src/**` empty); `$ARGUMENTS` = freeform intent text.

**Trace.**

1. Phase 1 (extended for router) — Bootstrap. Three `AskUserQuestion` rounds BEFORE any agent spawn:
   - Q1 — restate-intent. SEEDS from `$ARGUMENTS`. NEVER re-asked.
   - Q2 — scope. Options derived from preflight + intent: which service / new vs existing feature / scope_level / autonomy override.
   - Q3 — constraints. Tech, deadline, non-goals, parallel features.
2. Three rounds completed → downstream agents observe `intent_floor: cleared` in spawn prompts; skip own intent-restate.
3. Tech-vs-business classifier (before feature-id mint). `tech` (HIGH silent OR LOW/MEDIUM approved) → spawn implementer (`@backend` or `@frontend`) directly via single-row plan, no PRD/FRS/TDD. `business` → standard 4-phase.
4. Route per `docs/` state: empty for target service → S2; some features locked → S3; many features locked + no impl → S4.

Phases 2-4 follow the resolved sub-strategy.

**Artifacts produced.** Same as resolved sub-strategy (S2 / S3 / S4 / tech path).

**Edge cases.**

- `$ARGUMENTS` is one word (e.g., `/orchestra refactor`): Q1 seed ambiguous; restate-intent surfaces tighter draft. 2-3 amend cycles within Q1 alone before Q2.
- Intent maps to existing feature: Q2 surfaces "extend existing feature `<id>`" option. If chosen → S3 for that feature; do NOT mint new `<feature-id>`.
- Intent maps to multi-feature change ("add audit logging across checkout and refund"): mint multiple feature-ids; S4.
- Tech classifier returns LOW conf and user disagrees with default `business`: `AskUserQuestion(business | tech)` resolves before Phase 2a.
