This project uses **orchestra** for SDLC orchestration. The chain owns spec / architecture / test docs in `docs/`; your edits live in `src/**`.

## Rules

- **No chain-artifact cites in business code.** `src/**` must not embed `PRD §N` / `FRS §N` / `TDD §N` / `openapi §N` / `TSR §N` / `FR-N` / `AC-N` / `S-<TAG>-NNN` / `ADR-NNNN §N`. Traceability lives in commits, PRs, and TSR `S-EVAL-001` / `S-REVIEW-001`. `pre-write-check.js` Gate-D rejects violations.
- **Batch independent writes.** N independent file writes (multiple `.puml`, per-feature singletons, per-service singletons) → N parallel `Write()` calls in ONE message.
- **Batch independent spawns.** Inter-feature, intra-feature fan-out, within-agent per-unit → ONE Agent-tool-call message with N spawns.
- **Single-writer surfaces stay sequential.** SAD `S-CONTAINERS-001`, `business-invariants.md`, `inventory/adr/index.md`, `local.yaml`.
- **Don't trample chain-owned dirs.** `docs/` and `.orchestra/` are chain-written; mutate via the chain, not by hand.
- **ADRs are append-only.** Supersede; do not delete.

## Source of truth

- Behavior specs: `docs/<feature-id>/<feature-id>-PRD.md` (problem / scope), `<feature-id>-FRS.md` (FR / AC). `<feature-id>` = `<NNN>-<slug>` (e.g., `001-todo-api`).
- Architecture: `docs/SAD.md` and `docs/adr/ADR-NNNN-*.md`.
- API contracts: `docs/<feature-id>/<feature-id>-openapi.yaml` (or `<feature-id>-asyncapi.yaml`).
- Test plans + verdicts: `docs/<feature-id>/<feature-id>-TSR.md`.
- Runtime config: `.orchestra/<service_name>/local.yaml`.

## Workflow

- Entry shapes:
  - `/orchestra spec-to-code` — greenfield forward chain (PRD → FRS → SAD → ADR → TDD → openapi → code).
  - `/orchestra code-to-spec` — brownfield reverse chain (docs from existing source). Optional second token: `system` | `service:<name>`.
  - `/orchestra <intent>` — freeform router (e.g., `/orchestra add user authentication`). Reverse-then-forward on brownfield; forward-only on greenfield.
  - `/orchestra` — usage block, no chain.
- Decisions cache to `.orchestra/<service_name>/local.yaml` on first run; re-runs skip the questionnaire.
- Pipeline coordination state lives at `.orchestra/<service_name>/pipeline/<feature-id>/`.
