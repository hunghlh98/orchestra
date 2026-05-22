# S8 — `<intent>` router, greenfield

## Trigger

- `$1` is NOT one of `spec-to-code` / `code-to-spec` / empty.
- Preflight `mode: greenfield` (`src/**` empty).
- `$ARGUMENTS` = full freeform intent text.

## Trace

1. **Q1 — restate-intent.** `AskUserQuestion`. **Q1 SEEDS from `$ARGUMENTS`** — Claude's reading of the user's typed intent forms the seed answer. User confirms or amends. Q1 is NEVER re-asked.
2. **Q2 — scope.** `AskUserQuestion`. Options derived from preflight + intent: which service / new vs existing feature / scope_level / autonomy override.
3. **Q3 — constraints.** `AskUserQuestion`. Tech constraints, deadline, non-goals, parallel features in flight.
4. **Confidence floor.** Three rounds completed → downstream agents observe `intent_floor: cleared` and skip their own intent-restate `AskUserQuestion`.
5. **Route per `docs/` state.**
   - `docs/<service>/<feature-id>/` empty for the targeted service → route to S2 (greenfield, clean).
   - Some features locked → route to S3 (partial-resume) for the touched feature.
   - Many features locked + no impl yet → route to S4 (multi-feature fan-out).
6. **Tech-vs-business classifier.** Runs BEFORE feature-id mint. If `tech` (HIGH conf silent OR LOW/MEDIUM approved) → spawn `@lead` (tech mode); no PRD/FRS/TDD chain. If `business` → standard 5-gate forward chain.

## Artifacts produced

Same as the resolved sub-strategy (S2 / S3 / S4 / tech path).

## Edge cases

- **`$ARGUMENTS` is just one word** (e.g., `/orchestra refactor`): Q1 seed is ambiguous; restate-intent surfaces a tighter draft. User may need 2-3 amend cycles within Q1 alone.
- **Intent maps to existing feature.** Q2 surfaces "extend existing feature `<id>`" option. If chosen → route to S3 for that feature; do NOT mint new `<feature-id>`.
- **Intent maps to multi-feature change** (e.g., "add audit logging across checkout and refund"). Mint multiple feature-ids; route to S4.
- **Tech classifier returns LOW confidence and user disagrees with default `business`.** `AskUserQuestion(business | tech)` resolves.

## Cross-references

- `commands/orchestra.md` — Strategy dispatch row S8.
- `commands/orchestra.md` — Per-feature execution model / Intent classification (classifier inline prompt).
- `references/S2-greenfield-clean.md`, `references/S3-greenfield-partial.md`, `references/S4-greenfield-multifeature.md` — downstream traces.
