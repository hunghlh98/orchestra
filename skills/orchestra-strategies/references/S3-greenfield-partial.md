# S3 — greenfield, partial locks / partial impl

## Trigger

- `$1 = "spec-to-code"`.
- Preflight `mode: greenfield` (or `brownfield` if `docs/` provenance present but `src/**` partial).
- At least one `docs/<service_name>/<feature-id>/<feature-id>-*.md` carries `status: locked`.
- One of:
  - Locked layers are NOT contiguous (e.g., PRD + TDD locked, FRS not), OR
  - All upstream artifacts locked but `services/<service_name>/src/**` only partially populated, OR
  - TSR rows partially filled (`S-TEST-001` plan locked, `S-EVAL-001` empty).

## Trace

**Phase 1 — Discovery.**

1. Preflight + bootstrap. Read existing `.orchestra/<service_name>/features.yaml` + `local.yaml`. Feature-id already minted in prior run.
2. Walk `docs/<service_name>/<feature-id>/` for current lock state:
   - PRD locked? FRS locked? TDD + contracts locked? per-service singletons present? impl present? TSR `S-TEST-001` rows?
3. Build resume-state map: `{ artifact_slot: present-locked | present-draft | absent }`.

**Phase 2a — Author.**

4. Main agent `EnterPlanMode`.
5. Plan body's `## Agent assignments` lifts ONLY the absent / draft slots. Locked artifacts are inputs, not targets — they appear as references in `## Features`, not assignments. Lock state drives a per-slot classification: `cite-as-is` (locked + plugin-format), `copy-and-modify` (locked + format-drift), `re-author` (absent or draft + structural divergence).
6. `## Risks + decisions` surfaces: partial-resume nature + which slots resume + ratify-spec path availability for any locked artifact that may need downstream amendment.
7. `ExitPlanMode`.

═══ Turn boundary ═══

**Phase 2b — Lock + Phase 3 — Swarm.**

8. On approve, Write `.orchestra/plans/<session-id>/run-plan.md` locked.
9. `TaskCreate × N` where N = count of non-locked assignment rows ONLY. Locked artifacts get no `TaskCreate`.
10. `Agent × N` spawn cohort — one per non-locked slot owner.
11. Subagents read locked upstream artifacts as inputs, author assigned slot(s), `TaskUpdate(completed)` on close.
12. `TaskList` verify Phase 3 completion.

**Phase 4 — Convergence.**

13. If implementation slots were authored in Phase 3, run `@test-runner` → `@evaluator` ‖ `@reviewer` → TSR. Otherwise (e.g., only spec slots resumed), Phase 4 trivially completes.

## Artifacts produced

Same shape as S2; only the absent / draft files are written. Locked files untouched.

## Edge cases

- **Locked artifact with stale content.** Reviewer flags during Phase 4. Use `mcp__orchestra-utils__amend_locked_artifact` + `relock_artifact` (ratify-spec path). Never bypass via direct `Write` — `pre-write-check` `locked-status-reject` gate rejects.
- **Multiple features in `features.yaml`, partial locks across features.** Each feature gets its own row in `## Features` with its own non-locked-slot assignments. Phase 3 spawns the union across features in ONE cohort.
- **Source-side divergence from locked spec (`fix-source` path).** Write corrections to `src/**` directly; locked artifact untouched (no `## Changelog` row).
- **`features.yaml` entry exists but `docs/<service_name>/<feature-id>/` empty.** Treat as fresh feature; Phase 2a plan includes the full spec stack as `re-author` assignments.
- **Plan-mode rejection on partial-resume.** Phase 2c revision loop. Reject comment usually names a missed slot or stale lock; targeted `Read` fills the gap.

## Cross-references

- `commands/orchestra.md` — Phase 1 Discovery (resume-state walk); Phase 2 Plan (partial-resume slot enumeration); Ratify-spec on locked artifacts.
- `schemas/pipeline-artifact.schema.md` — status / lock semantics / changelog grammar.
