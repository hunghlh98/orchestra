# S8 — `<intent>` router, greenfield

## Trigger

- `$1` is NOT one of `spec-to-code` / `code-to-spec` / empty.
- Preflight `mode: greenfield` (`src/**` empty).
- `$ARGUMENTS` = full freeform intent text.

## Trace

**Phase 1 — Discovery (extended for router path).**

1. Preflight + bootstrap.
2. Three `AskUserQuestion` rounds BEFORE any agent spawn:
   - **Q1 — restate-intent.** SEEDS from `$ARGUMENTS`. Main agent's reading of the user's typed intent forms the seed answer. User confirms or amends. Q1 NEVER re-asked.
   - **Q2 — scope.** Options derived from preflight + intent: which service / new vs existing feature / scope_level / autonomy override.
   - **Q3 — constraints.** Tech constraints, deadline, non-goals, parallel features in flight.
3. Three rounds completed → downstream agents observe `intent_floor: cleared` in spawn prompts and skip their own intent-restate.
4. **Tech-vs-business classifier.** Runs BEFORE feature-id mint. If `tech` (HIGH confidence silent OR LOW/MEDIUM approved) → spawn implementer (`@backend` or `@frontend`) directly via a single-row plan, no PRD/FRS/TDD chain. If `business` → standard 4-phase flow.
5. **Route per `docs/` state.**
   - `docs/<service>/<feature-id>/` empty for the targeted service → S2 trace (full greenfield, single feature).
   - Some features locked → S3 trace (partial-resume) for the touched feature.
   - Many features locked + no impl yet → S4 trace (multi-feature fan-out).

**Phases 2, 3, 4** — follow the resolved sub-strategy.

## Artifacts produced

Same as the resolved sub-strategy (S2 / S3 / S4 / tech path).

## Edge cases

- **`$ARGUMENTS` is just one word** (e.g., `/orchestra refactor`): Q1 seed is ambiguous; restate-intent surfaces a tighter draft. User may need 2-3 amend cycles within Q1 alone before Q2 fires.
- **Intent maps to existing feature.** Q2 surfaces "extend existing feature `<id>`" option. If chosen → S3 trace for that feature; do NOT mint new `<feature-id>`.
- **Intent maps to multi-feature change** (e.g., "add audit logging across checkout and refund"). Mint multiple feature-ids; S4 trace.
- **Tech classifier returns LOW confidence and user disagrees with default `business`.** `AskUserQuestion(business | tech)` resolves before Phase 2a.

## Cross-references

- `commands/orchestra.md` — Parse `$1` / `$ARGUMENTS` (router routing); Phase 1 Discovery (3× `AskUserQuestion` for router path).
- `references/S2-greenfield-clean.md`, `references/S3-greenfield-partial.md`, `references/S4-greenfield-multifeature.md` — downstream traces.
