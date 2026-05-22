# `docs/` — Orchestra-generated workspace documentation

## Purpose

`docs/` holds the orchestra-authored documentation set for this workspace. It does NOT hold source code, automated tests, or Test Strategy Reports — those belong to service repositories and the orchestra pipeline working area at `.orchestra/`.

## Provenance contract

Every file under `docs/` carries frontmatter declaring `generated_by: orchestra` and a `status:` of `draft` or `locked`. Locked artifacts are cited as-is by future reverse-pass runs (`reverse_authoring_mode: cite-as-is`). Draft artifacts may be copy-and-modified (`reverse_authoring_mode: copy-and-modify`). Files lacking this frontmatter signal pre-orchestra state and trigger full re-authoring (`reverse_authoring_mode: re-author`). This `README.md` is the load-bearing marker for that classification — `@product`, `@architect`, and `@lead` read its `generated_by: orchestra` field to decide which path applies.

## Layout

Expected layout at full chain completion. `<service_name>` resolves from `<context_path>/.orchestra/<service_name>/local.yaml`; `<feature-id>` shape is `<short-service-name>-<NNN>-<slug>` (e.g., `order-001-checkout`) per run-plan `S-FEATURES-001`.

```
docs/
  README.md                                       (this marker)
  SAD.md                                          (workspace; multi-repo + system-wide only)
  business-invariants.md                          (multi-repo + system-wide; rules binding >=2 services)
  adr/
    ADR-<NNNN>-<slug>.md                          (global; 4-digit flat numbering)
  diagrams/
    c4-context.puml                               (workspace L1; multi-repo only)
    c4-container.puml                             (workspace L2; multi-repo only)
    erd-logical.puml                              (workspace-scope ERD; multi-repo only)
    sequence-inter-<flow>.puml                    (one per Journey-gate outcome category)
  <service_name>/
    <service_name>-BR-AC.md                       (per-service singleton)
    adr/
      ADR-<service_name>-<NNN>-<slug>.md          (service-scope; 3-digit per-service numbering)
    diagrams/
      c4-component.puml                           (service singleton; L3)
      c4-code.puml                                (service singleton; L4; omit on trivial surface)
      erd-logical.puml                            (service-scope; per-service runs)
    <feature-id>/
      <feature-id>-PRD.md
      <feature-id>-FRS.md
      <feature-id>-TDD.md
      <feature-id>-openapi.yaml                   (HTTP producer)
      <feature-id>-asyncapi.yaml                  (event-driven; alternative to openapi)
      <feature-id>-clientapi.yaml                 (HTTP consumer contract on upstream)
      diagrams/
        <feature-id>-c4-context.puml              (per-feature highlighted copy of workspace L1)
        <feature-id>-c4-container.puml            (per-feature highlighted copy of workspace L2)
        <feature-id>-frs-usecase.puml             (use-case diagram with end-user persona)
        <feature-id>-state-business.puml          (business-state machine; when lifecycle)
        <feature-id>-state-technical.puml         (technical-state machine; when lifecycle)
        <feature-id>-seq-<journey>.puml           (one per Journey-gate outcome category)
        <feature-id>-erd-physical.puml            (when persistence touched)
```

## Editing policy

Do not edit `docs/` artifacts by hand. Re-run `/orchestra code-to-spec` to refresh. Manual edits to a `status: locked` artifact trip the pre-write `locked-status-reject` gate and are rejected by the dispatcher on the next run.
