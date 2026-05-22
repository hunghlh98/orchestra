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

1. **Trust locked frontmatter as-is.** Do NOT re-author any `status: locked` artifact via standard chain. Use `ratify-spec` path only on verification-phase divergence (see ratify-spec section in `commands/orchestra.md`).
2. **Locate resume point.** Walk `docs/<service_name>/<feature-id>/` in chain order:
   - PRD locked? → continue. PRD draft/absent? → spawn `@product`.
   - FRS locked? → continue. FRS draft/absent? → spawn `@analyst`.
   - TDD + contracts locked? → continue. TDD draft/absent? → spawn `@architect`.
   - run-plan locked? → continue. run-plan draft/absent? → spawn `@lead`.
   - Fan-out artifacts present? Inspect `services/<service_name>/src/`:
     - Source + tests present + `S-TEST-001` locked? → continue to converge.
     - Source partial / tests absent → spawn fan-out (missing implementers only).
   - `S-EVAL-001` + `S-REVIEW-001` locked? → done.
3. **Resume from first unlocked layer.** Spawn its owning agent. Then re-enter gate state machine from that point.

## Artifacts produced

Same shape as S2; only the missing files are written. Locked files untouched.

## Edge cases

- **Locked artifact with stale content.** Reviewer flags during verification phase. Use `mcp__orchestra-utils__amend_locked_artifact` + `relock_artifact` (ratify-spec path). Never bypass via direct write — `pre-write-check` `locked-status-reject` gate rejects.
- **Multiple features in `features.yaml`, partial locks across features.** Iterate per `<feature-id>` independently; each follows its own resume-from-unlocked-layer pattern.
- **Source-side divergence from locked spec (Path = `fix-source`).** Write corrections to `src/**`; locked artifact untouched (no `## Changelog` row).
- **`features.yaml` entry exists but `docs/<service_name>/<feature-id>/` empty.** Treat as S2 entry-point for that feature (PRD spawn).

## Cross-references

- `commands/orchestra.md` — Chain state recovery (filesystem-state-to-next-action mapping).
- `commands/orchestra.md` — ratify-spec on locked artifacts (divergence-resolution paths).
- `schemas/pipeline-artifact.schema.md` — status / lock semantics / changelog grammar.
