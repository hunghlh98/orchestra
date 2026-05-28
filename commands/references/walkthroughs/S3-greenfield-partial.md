---
strategy: S3
entry: /orchestra spec-to-code
precondition: greenfield, partial locks / partial impl
---

# S3 — greenfield, partial locks / partial impl

**Trigger.** `$1 = "spec-to-code"`; preflight `mode: greenfield` (or `brownfield` if `docs/` provenance present); ≥1 `docs/<service_name>/<feature-id>/<feature-id>-*.md` carries `status: locked`. Locked layers non-contiguous OR impl partial OR TSR rows partial.

**Trace.**

1. Phase 1 — Bootstrap. Read `features.yaml` + `local.yaml`. Walk `docs/<service_name>/<feature-id>/` for lock state. Build resume-state map `{slot: present-locked | present-draft | absent}`.
2. Phase 2a — `EnterPlanMode`. `## Agent assignments` lifts ONLY absent / draft slots. Locked artifacts in `## Features` as references, not assignments. Per-slot classification: `cite-as-is` (locked + plugin-format), `copy-and-modify` (locked + format-drift), `re-author` (absent or draft + structural divergence). `## Risks + decisions` surfaces partial-resume nature + ratify-spec availability. `ExitPlanMode`.
3. Phase 2b + 3 — Write `run-plan.md` locked; `TaskCreate × N` where N = non-locked rows ONLY; `Agent × N` cohort. Subagents read locked upstream artifacts as inputs.
4. Phase 4 — If impl slots authored, run `@test-runner` → `@evaluator ‖ @reviewer` → TSR. Otherwise trivially completes.

**Artifacts produced.** Same shape as S2; only absent / draft files written. Locked files untouched.

**Edge cases.**

- Locked artifact with stale content: reviewer flags Phase 4. Use `mcp__orchestra-utils__amend_locked_artifact` + `relock_artifact` (ratify-spec). Never bypass via direct `Write` — `pre-write-check` `locked-status-reject` rejects.
- Multiple features with partial locks across: each gets its own `## Features` row + non-locked-slot assignments. Phase 3 spawns union in ONE cohort.
- Source-side divergence from locked spec (`fix-source`): Write corrections to `src/**`; locked artifact untouched.
- `features.yaml` entry exists, `docs/<service_name>/<feature-id>/` empty: treat as fresh feature; full spec stack as `re-author`.
- Plan rejection on partial-resume: Phase 2c targets missed slot or stale lock.
