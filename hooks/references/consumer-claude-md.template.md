This project uses **orchestra** for SDLC orchestration. The chain owns spec / architecture / test docs in `docs/`; your edits live in `src/**`.

## Rules

- **No chain-artifact cites in business code.** `src/**` must not embed `PRD §N` / `FRS §N` / `TDD §N` / `openapi §N` / `TSR §N` / `FR-N` / `AC-N` / `S-<TAG>-NNN` / `ADR-NNNN §N`. Traceability lives in commits, PRs, and TSR `S-EVAL-001` / `S-REVIEW-001`. `pre-write-check.js` Gate-D rejects violations.
- **Append-only feature graph.** New behavior = new `<feature-id>` with `depends_on:` edges in `.orchestra/<service_name>/features.yaml`. Never edit existing locked PRDs in place. Successor features carry `supersedes: [<old-id>]`; predecessor `status:` stays user-controlled (no auto-flip). Manifest writes only via `mcp__orchestra-utils__upsert_features_yaml` — never hand-edited. Graph is intra-service; cross-service relationships are not modelled.
- **Batch independent writes.** N independent file writes (multiple `.puml`, per-feature singletons, per-service singletons) → N parallel `Write()` calls in ONE message.
- **Batch independent spawns.** Inter-feature, intra-feature fan-out, within-agent per-unit → ONE Agent-tool-call message with N spawns.
- **Single-writer surfaces stay sequential.** SAD `S-CONTAINERS-001`, `business-invariants.md`, `inventory/adr/index.md`, `local.yaml`, `features.yaml`.
- **Don't trample chain-owned dirs.** `docs/` and `.orchestra/` are chain-written; mutate via the chain, not by hand.
- **ADRs are append-only.** Supersede; do not delete.

## Source of truth

- Behavior specs: `docs/<feature-id>/<feature-id>-PRD.md` (problem / scope), `<feature-id>-FRS.md` (FR / AC). `<feature-id>` = `<NNN>-<slug>` (e.g., `001-todo-api`).
- Architecture: `docs/SAD.md` and `docs/adr/ADR-NNNN-*.md`.
- API contracts: `docs/<feature-id>/<feature-id>-openapi.yaml` (or `<feature-id>-asyncapi.yaml`).
- Test plans + verdicts: `docs/<feature-id>/<feature-id>-TSR.md`.
- Runtime config: `.orchestra/<service_name>/local.yaml`.
- Feature manifest: `.orchestra/<service_name>/features.yaml` (intra-service DAG of `<feature-id>` nodes with `depends_on:` / `supersedes:` edges).

## Workflow

- Entry shapes:
  - `/orchestra spec-to-code` — greenfield forward chain (PRD → FRS → SAD → ADR → TDD → openapi → code).
  - `/orchestra code-to-spec` — brownfield reverse chain (docs from existing source). Optional second token: `system` | `service:<name>`.
  - `/orchestra <intent>` — freeform router (e.g., `/orchestra add user authentication`). Reverse-then-forward on brownfield; forward-only on greenfield. Dispatcher classifies tech vs business; tech-path skips spec authoring.
  - `/orchestra` — usage block, no chain.
- Decisions cache to `.orchestra/<service_name>/local.yaml` on first run; re-runs skip the questionnaire.
- Pipeline coordination state lives at `.orchestra/<service_name>/pipeline/<feature-id>/`.
