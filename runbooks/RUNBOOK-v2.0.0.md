---
id: RUNBOOK-v2.0.0
type: RUNBOOK
created: 2026-05-06
revision: 1
version: 2.0.0
topology_change_summary: "Major release. Pipeline artifact canon collapsed 14→12 + conditional ADRs. Provenance moved to <artifact>.lock.yaml sidecar. Mandatory PlantUML diagrams (PlantUML CLI dependency added — Java JRE 8+ + plantuml.jar). New scripts (scaffold-artifact, bump-version). Two new skills (plantuml, c4-architecture). New artifact types (CHARTER, ADR, TSR). Removed types (VERDICT, CODE-REVIEW, ANNOUNCEMENT, DOC, IMPL-NOTES, IMPL-BE, IMPL-FE, CODE-DESIGN-BE, CODE-DESIGN-FE). No automated migration."
deploy_steps_count: 4
rollback_steps_count: 2
---

# RUNBOOK v2.0.0 — Install + smoke test + expected v2 structure

orchestra v2.0.0 ships as a Claude Code plugin distributed via `claude plugin install`. This runbook covers (1) the consumer-side install path, (2) what changes in a consumer's environment after install, (3) the **expected v2.0.0 folder structure** that emerges on first `/orchestra <intent>` run, and (4) rollback if install regresses an existing project.

## Topology changes (v1.0.0 → v2.0.0)

**Before (v1.0.0):** 5 hooks, 2 MCPs, 8 agents, 8 skills, 1 command, 12 rules. Artifact canon: 14 types with inline `sections:` / `references:` frontmatter.

**After (v2.0.0):**

| Surface | What changed |
|---|---|
| Skills | 8 → 11 (3 new: `plantuml`, `c4-architecture`, plus the `cut-release` / `resume-pipeline` / `shutdown-team` carried over from v1.0.1 streamline). 9 of 11 skills updated for v2 canon. |
| Scripts | New: `scripts/scaffold-artifact.js` (template engine), `scripts/bump-version.js` (atomic 3-file version updater). Updated: `scripts/validate-drift.js` (dual-mode read), `scripts/test-streamline-fixture.sh` (orphan-type smoke gate). |
| Hooks | `hash-stamper` rewritten for only-when-paired sidecar mode. `section-hash.js` regex updated to support multi-segment IDs (`S-NON-GOALS-001`, etc.). 5 hook count unchanged. |
| Agents | 8 (unchanged count). All 6 artifact-authoring agents (`product`, `lead`, `test`, `evaluator`, `reviewer`, `ship`) updated for scaffold-fill + TSR + CHARTER + ADR. `tools:` arrays preserved. |
| Validator | New: 7 pure-function pipeline-artifact validators. 45 new mutation assertions in `test-validate-extensions.js`. |
| Schemas | Rewrites: `schemas/pipeline-artifact.schema.md` (revision 3 → 4), `schemas/routing-taxonomy.md` (revision 1 → 2). New: `schemas/lockfile.schema.md`, 14 templates under `schemas/templates/`. |
| Artifact canon | 14 → 12 + conditional ADRs. Folded: VERDICT + CODE-REVIEW → TSR; ANNOUNCEMENT → RELEASE `S-ANNOUNCEMENT-001`. Added: CHARTER (mode: full\|brief), ADR (global numbering). Dropped: DOC, IMPL-NOTES, IMPL-BE, IMPL-FE, CODE-DESIGN-BE, CODE-DESIGN-FE, COMMIT-MSG-as-file. |
| Diagrams | MANDATORY per artifact type (use-case, C4, sequence, ER, state-machine, service-contract, DAG, deploy/rollback). PlantUML source rendered to SVG. |
| Provenance | Moved from inline frontmatter to `<artifact>.lock.yaml` sidecar. Hash-stamper writes only when paired. |
| Migration | **None.** v1.x consumer projects rerun from intent. |

## Pre-deploy verification

Run on a clean machine before promoting to users:

1. `node --version` ≥ 18.0.0 (required by `package.json` engines).
2. `claude --version` (Claude Code installed and on `$PATH`).
3. `git --version` (required by `hash-stamper` for repo-relative paths and by the `commit-work` skill).
4. **NEW for v2.0.0** — Java + PlantUML for diagram rendering:
   - `java -version` ≥ 8.
   - `~/plantuml.jar` present (download: `curl -o ~/plantuml.jar https://downloads.sourceforge.net/project/plantuml/plantuml.jar`), OR `$PLANTUML_JAR` set, OR `which plantuml` returns a wrapper.
   - The `/plantuml` skill ships `scripts/check_setup.py` to verify all three. Run `python skills/plantuml/scripts/check_setup.py` from the orchestra clone to validate.
5. **Optional:** `sqlite3 --version` (P0 backend for `orchestra-probe.db_state`).

If PlantUML is missing at consumer-install time, agents that author diagrams will write `.puml` source successfully but `.svg` rendering will be deferred — the lockfile records `rendered_hash: "sha256:UNRENDERED"` and `validate.js --with-diagrams` flags it. Render later via `python skills/plantuml/scripts/convert_puml.py <path>.puml --format svg`.

## Deploy steps

Run by the consumer in their own shell (same as v1.0.0; only the post-install footprint differs):

1. **Register the marketplace, then install the plugin** (two commands inside any Claude Code session):
   ```
   /plugin marketplace add hunghlh98/orchestra
   /plugin install orchestra@orchestra-marketplace
   ```
   *Expected:* plugin manifest registered; `~/.claude/plugins/orchestra/` populated; no follow-up prompts.

2. **Verify install:** open Claude Code in any directory and run:
   ```
   /orchestra help
   ```
   *Expected:* the usage block prints. If you see "Unknown command", install did not register the `commands` array — check `~/.claude/plugins/orchestra/.claude-plugin/plugin.json` for `"version": "2.0.0"` and `"commands": ["./commands/orchestra.md"]`.

3. **Bootstrap a project:** `cd <your-project>` then run any natural-language `/orchestra` invocation:
   ```
   /orchestra build me a tiny URL shortener
   ```
   *Expected (NEW for v2.0.0):* on first invocation, the dispatcher (a) bootstraps `<project>/.claude/.orchestra/local.yaml`, (b) classifies intent as `feature` via `@lead`, (c) runs `Bash(scaffold-artifact CHARTER 001-... --mode=full)` BEFORE spawning `@product`, then `scaffold-artifact PRD ...`, etc. Each scaffold call writes the artifact body, the paired `<artifact>.lock.yaml`, and stub `.puml` diagram source files. `@product` then Reads + fills + Writes; the hash-stamper hook fires on Write and stamps hashes into the paired lockfile.

4. **Test the validator chain (plugin-side, optional):**
   ```sh
   cd <orchestra-clone> && npm test
   ```
   *Expected:* all 12 validators green: `validate.js`, `test-hooks.js` (83), `test-hash-stamper.js` (27 NEW), `test-scaffold.js` (116 NEW), `test-validate-extensions.js` (45 NEW), `test-agents.js` (16), `test-bash-strip.js` (6), `validate-drift.js`, `test-removability.js`, `test-metrics.js` (91), `test-bootstrap.js` (37), `test-probe.js` (30).

## Expected v2 folder structure

After a successful `/orchestra <feature-intent>` run, consumers should see this layout under `<project>/.claude/.orchestra/`:

```
.claude/.orchestra/
├── local.yaml                                     # discovery snapshot
├── architecture/
│   ├── SAD.md (+ SAD.lock.yaml)                   # singleton
│   ├── diagrams/
│   │   ├── sad-c4-context.{puml,svg}              # MANDATORY C4 L1
│   │   └── sad-c4-container.{puml,svg}            # MANDATORY C4 L2
│   └── decisions/                                 # NEW v2 — global ADRs
│       ├── ADR-NNNN-<slug>.md (+ .lock.yaml)
│       └── diagrams/
│           ├── adr-NNNN-status.{puml,svg}         # MANDATORY state-machine
│           └── adr-NNNN-option-{A,B,C}.{puml,svg} # OPTIONAL per-option sketches
├── runbooks/
│   └── RUNBOOK-v0.X.Y.md (+ .lock.yaml)           # consumer's own release runbook
├── releases/
│   └── RELEASE-v0.X.Y.md (+ .lock.yaml)           # absorbs ANNOUNCEMENT (S-ANNOUNCEMENT-001)
├── metrics/
│   ├── events.jsonl                               # 50MB rotation
│   └── runs/<run-id>.json
└── pipeline/<NNN>-<slug>/                         # per-feature dir
    ├── intent.yaml
    ├── charter/                                   # NEW v2 (Planning)
    │   ├── <NNN>-CHARTER.md (+ .lock.yaml)
    │   └── diagrams/.gitkeep
    ├── requirements/
    │   ├── <NNN>-PRD.md (+ .lock.yaml)
    │   ├── <NNN>-FRS.md (+ .lock.yaml)
    │   └── diagrams/frs-usecase.{puml,svg}        # MANDATORY use-case
    ├── interfaces/
    │   ├── <NNN>-API.openapi.yaml (+ .lock.yaml)
    │   ├── <NNN>-CONTRACT.md (+ .lock.yaml)
    │   └── diagrams/
    │       ├── contract-service.{puml,svg}        # MANDATORY service-contract
    │       └── contract-sequence-<crit-id>.{puml,svg}  # per critical-path criterion
    ├── design/
    │   ├── <NNN>-TDD.md (+ .lock.yaml)
    │   └── diagrams/
    │       ├── tdd-c4-component.{puml,svg}        # MANDATORY C4 L3
    │       ├── tdd-sequence-<flow>.{puml,svg}     # ≥1 per primary flow
    │       ├── tdd-er.{puml,svg}                  # MANDATORY data model
    │       └── tdd-state.{puml,svg}               # only if lifecycle exists
    ├── plan/
    │   ├── <NNN>-TASKS.md (+ .lock.yaml)
    │   └── diagrams/tasks-dag.{puml,svg}          # MANDATORY DAG
    └── verify/
        ├── <NNN>-TEST.md (+ .lock.yaml)           # coverage matrix only
        └── <NNN>-TSR.md (+ .lock.yaml)            # NEW v2 — folded VERDICT + CODE-REVIEW
```

### Per-intent variations

Not all intents emit all artifacts. The dispatcher's pre-spawn scaffold (per `commands/orchestra.md` Step 5(a)) produces only what the routed intent's whitelist authorizes:

| Intent | Charter | PRD/FRS | TDD | API/CONTRACT | TASKS | TEST | TSR | RELEASE | ADR (cond.) |
|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| `feature` | full | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `hotfix` | (skip) | (skip) | ✓ | (skip) | ✓ | ✓ | eval-half | ✓ | (skip) |
| `template` | brief | (skip) | ✓ | (skip) | ✓ | ✓ | ✓ | (skip) | (skip) |
| `refactor` | (skip) | (skip) | ✓ (update) | (skip) | ✓ | ✓ | ✓ | (skip) | ✓ |
| `docs` | brief | (skip) | (skip) | (skip) | (skip) | (skip) | rev-half | (skip) | (skip) |
| `review-only` | (skip) | (skip) | (skip) | (skip) | (skip) | (skip) | rev-half | (skip) | (skip) |

Exception files (any intent, only on triggered conditions): `ESCALATE-*.md`, `ESCALATE-ARCH-*.md`, `ESCALATE-ADR-<NNNN>.md`, `DEADLOCK-*.md`, `DEADLOCK-ADR-<NNNN>.md`, `SUMMARY-<id>.md` (terminal state).

### Lockfile shape (per artifact)

Every scaffold-managed artifact has a paired `.lock.yaml` (per `schemas/lockfile.schema.md`):

```yaml
artifact_id: <ID>
artifact_path: pipeline/<NNN>-<slug>/<folder>/<NNN>-<TYPE>.md
schema_revision: 1
sections:
  S-<TYPE>-NNN:
    hash: "sha256:..."          # filled by hash-stamper on Write
    confirmed: true              # @evaluator/@reviewer flip from false → true on grade
references:
  - type: prd
    id: 001-foo
    section: S-PROBLEM-001
    hash-at-write: "sha256:..."
diagrams:
  - kind: usecase
    source: diagrams/frs-usecase.puml
    rendered: diagrams/frs-usecase.svg
    source_hash: "sha256:..."
    rendered_hash: "sha256:..."   # OR "sha256:UNRENDERED" if PlantUML missing
    omit: false                    # true for state-machine when no lifecycle
```

## Health checks (post-deploy)

On a clean throwaway directory:

```sh
mkdir /tmp/orchestra-smoke && cd /tmp/orchestra-smoke && git init
```

Then in Claude Code:

1. `/orchestra help` → confirm usage prints.
2. `/orchestra build me a tiny hello-world endpoint` → confirm:
   - `local.yaml` created
   - `pipeline/001-<slug>/charter/001-CHARTER.md` exists with `mode: full`
   - `001-CHARTER.lock.yaml` paired alongside, populated with the 4 anchors at non-TBD hashes
   - At least one `.puml` source file exists under some `pipeline/.../diagrams/`
3. `cat .claude/.orchestra/metrics/events.jsonl` — confirm structural events only.
4. `cd <orchestra-clone> && npm test` — all 12 suites green.

If all four steps succeed, v2.0.0 install is healthy.

## Common failure modes

| Symptom | Cause | Resolution |
|---|---|---|
| `validate.js` reports `frontmatter-out-of-sync` | Body section edited after lockfile was hashed; hash-stamper didn't fire | Re-Write the artifact via Claude Code so hash-stamper fires; OR flip `S-...-NNN.hash` to `TBD` in lockfile and re-Write |
| `hash-at-write: TBD-UNRESOLVED` | Upstream artifact missing or its lockfile lacks the cited section | Verify upstream exists; re-run hash-stamper by re-Writing downstream |
| `lockfile-grammar` parse error | Hand-edited lockfile broke `yaml-mini.js` grammar | Restore from `git show HEAD~1:<lockfile-path>` or re-scaffold with `--force` |
| `structural-drift — missing-anchors=[...]` | Agent removed/renamed a required H2 anchor | Restore the anchor; agents fill FILL spans only, never structure |
| `diagram-rendered-drift — rendered file missing` | `.puml` authored but `/plantuml` skill never invoked to render | `python skills/plantuml/scripts/convert_puml.py <path>.puml --format svg` OR set `rendered_hash: "sha256:UNRENDERED"` to acknowledge |
| `orphan-type — VERDICT folded into TSR per v2.0` | Stale v1 file lingers from a v1.x rerun | Delete the orphan; re-run against v2 TSR/RELEASE structure |
| `fold-violation — missing S-REV-VERDICT-001` | TSR scaffolded but `@reviewer` never filled the rev half | Spawn `@reviewer`; or accept `rev_verdict: pending` until reviewer is available |

## Rollback

If install regresses an existing project:

1. **Uninstall the plugin** (inside Claude Code):
   ```
   /plugin uninstall orchestra
   /plugin marketplace remove orchestra-marketplace   # optional
   ```

2. **Clean consumer state (optional):**
   ```sh
   rm -rf <project>/.claude/.orchestra/
   ```

**v2 → v1 downgrade is NOT auto-migrated.** v1 hash-stamper will not understand v2 lockfile sidecars; v1 `validate-drift.js` will see no inline `sections:` blocks in v2 artifacts. If downgrading, treat existing v2 artifacts as read-only and re-run from intent.

## Observability

Local-only (no remote telemetry; G-M5 invariant unchanged from v1):

- `<project>/.claude/.orchestra/metrics/events.jsonl` — 50MB rotation, 5-archive retention.
- Disable for air-gapped: `export ORCHESTRA_HOOK_METRICS_COLLECTOR=off`.
- Per-component opt-out via `manifests/runtime-toggles.json` env vars.

## Refs

- [`releases/RELEASE-v2.0.0.md`](../releases/RELEASE-v2.0.0.md) — release summary (when authored)
- [`docs/DESIGN-005-doc-output-overhaul.md`](../docs/DESIGN-005-doc-output-overhaul.md) — full v2 design rationale
- [`schemas/lockfile.schema.md`](../schemas/lockfile.schema.md) — sidecar provenance spec
- [`schemas/pipeline-artifact.schema.md`](../schemas/pipeline-artifact.schema.md) — v2 frontmatter shapes (revision 4)
- [`schemas/routing-taxonomy.md`](../schemas/routing-taxonomy.md) — per-intent whitelist (revision 2)
- [`commands/orchestra.md`](../commands/orchestra.md) — dispatcher contract (Step 5(a) pre-spawn scaffold)
- [`runbooks/RUNBOOK-v1.0.0.md`](RUNBOOK-v1.0.0.md) — prior release runbook (for v1 → v2 diff)
