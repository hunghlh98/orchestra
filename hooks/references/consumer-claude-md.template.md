This project uses **orchestra** for SDLC orchestration. The chain owns spec / architecture / test docs in `docs/`; your edits live in `src/**`.

## Source of truth

- Behavior specs: `docs/<feature-id>/<feature-id>-PRD.md` (problem / scope), `<feature-id>-FRS.md` (FR / AC). `<feature-id>` = `<NNN>-<slug>` (e.g., `001-todo-api`).
- Architecture: `docs/SAD.md` and `docs/adr/ADR-NNNN-*.md`.
- API contracts: `docs/<feature-id>/<feature-id>-openapi.yaml` (or `<feature-id>-asyncapi.yaml`).
- Test plans + verdicts: `docs/<feature-id>/<feature-id>-TSR.md`.
- Runtime config: `.orchestra/local.yaml`.

## src/ discipline (hook-enforced)

- Do not embed `PRD §N` / `FRS §N` / `TDD §N` / `CONTRACT §N` / `TSR §N` cites in `src/**`.
- Do not embed `FR-N` / `AC-N` / `S-<TAG>-NNN` / `ADR-NNNN §N` in `src/**`.
- Traceability lives in commits, PRs, and TSR `§verdict-*` — not in business code.
- The plugin's `pre-write-check.js` Gate-D rejects writes that violate this rule.

## Workflow

- Single entry: `/orchestra <intent>` (e.g., `/orchestra add user authentication`, `/orchestra ship feat-001`).
- Decisions cache to `.orchestra/local.yaml` on first run; re-runs skip the questionnaire.
- Pipeline coordination state lives at `.orchestra/pipeline/<feature-id>/`.

## Don't trample

- `docs/` and `.orchestra/` are chain-written; mutate via the chain, not by hand.
- ADRs are append-only; supersede, do not delete.
