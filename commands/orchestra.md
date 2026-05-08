---
name: orchestra
description: v4.0 multi-agent SDLC pipeline. Mode-detect → chain-rigor election → spec-to-code chain (PRD/FRS/SAD/ADR/TDD/openapi/code/TSR). Subcommands ship | report | resume.
argument-hint: <subcommand|natural language>
---

# /orchestra dispatcher (v4.0)

One entry surface for the spec-to-code chain. Mode-detect (greenfield vs
brownfield) and chain-rigor (Full / Standard / Light) elect which layers
fire; subcommands handle out-of-band release / observability / resume work.

## Invariants

The 4 runtime hooks (see "Runtime hooks" table below) own their events and
side effects. Do not write to `<cwd>/.orchestra/metrics/events.jsonl`
directly, hash artifact frontmatter manually, or replicate any hook's
work. The hash-stamper / lockfile model from v3 is gone — provenance and
review state live in artifact frontmatter (`status`, `verdict`, `readers`,
`sections`); drift detection is `git diff` in CI.

## Status output

Two model-emitted channels (NOT hook output): single-line status updates
at filesystem-coupled transitions, and multi-line banners on exception
artifacts. No ANSI, no emoji.

| Event | Format |
|---|---|
| Before `Agent({ subagent_type: "<role>" })` | `[orchestra] spawn @<role> → <artifact-target>` |
| After parent `Read(<path>)` returns | `[orchestra] read  @<role> wrote <filename>` |
| Before `AskUserQuestion` pause | `[orchestra] pause: <one-line question>` |
| Terminal state | `[orchestra] shutdown <terminal_state> feature=<feature-id> duration=<Ns>` |
| Cost banner (opt-in via `ORCHESTRA_METRICS_COST_BANNER=on`) | `[orchestra] [cost] <tokens-K> / $<usd> (subagents only; full total in metrics/runs/<id>.json after Stop hook)` |

Banner template — fires after parent `Read` returns an artifact whose
basename matches `DEADLOCK-*.md`, `ESCALATE-*.md`, or `ESCALATE-ADR-*.md`:

```
============================================================
[orchestra] <ARTIFACT_TYPE> detected
  triggered_by_<stage|agent>: <value-from-frontmatter>
  resolution: <value-from-frontmatter>
  path: <absolute path to artifact>
============================================================
```

`metrics-collector` captures structurally-equivalent events for replay;
status lines + banners are the user's live signal.

## Parse arguments

Look at the first whitespace-separated token of `$ARGUMENTS`:

- `ship`     → run **/orchestra ship** (release authoring; gate-verified)
- `report`   → run **/orchestra report** (observability — Gantt + cost pivots)
- `resume`   → run **/orchestra resume** [<feature-id>] (resume interrupted feature)
- `help`     → print usage block (defined below)
- otherwise  → run the **smart router** (decision tree → spawn @lead)

## Decision tree (entry flow)

Bare `/orchestra` (no subcommand) — script-first detection, then
`AskUserQuestion` only when the answer cannot be inferred. Cache locked
decisions to `<cwd>/.orchestra/local.yaml` so re-runs don't re-prompt.

```
/orchestra <intent>
  │
  ├─ load <cwd>/.orchestra/local.yaml (if present, lift cached answers)
  │
  ├─ Detect mode:
  │     no <cwd>/src/ AND no package.json/pom.xml/go.mod/Cargo.toml → greenfield
  │     <cwd>/src/ exists OR build manifest exists                  → brownfield
  │     ambiguous (e.g., docs/ exists but no source)                → AskUserQuestion (mode)
  │
  ├─ If brownfield AND local.yaml.depth missing → AskUserQuestion (depth):
  │     light  | medium  | full
  │     (drives reverse-doc artifact-set; see project-discovery skill)
  │
  ├─ If local.yaml.chain_rigor missing → AskUserQuestion (chain rigor):
  │     Full      — all layers (PRD → FRS → SAD → ADR → TDD → openapi → code+tests → TSR)
  │     Standard  — skip SAD / ADR  (PRD → FRS → TDD → openapi → code+tests → TSR)
  │     Light     — TDD-only        (TDD → openapi → code+tests → TSR; component-internal change, no spec uplift)
  │
  ├─ If greenfield AND local.yaml.primary_language missing → AskUserQuestion (language + framework):
  │     primary_language: java | kotlin | go | python | typescript | <other>
  │     framework: <freeform>  (e.g., "spring-boot 3.x", "gin", "fastapi", "express")
  │
  ├─ Persist answered fields to <cwd>/.orchestra/local.yaml.
  │
  └─ Spawn @lead with locked decisions in prompt:
       "mode=<mode> rigor=<rigor> primary_language=<lang>"
       (chain-rigor selects which layers @lead routes through; see "Chain
        execution" below.)
```

Each ask is **elidable** when its answer is inferable from prompt or repo
state. Ask only when you can't infer.

### local.yaml schema

```yaml
mode: greenfield | brownfield
depth: light | medium | full         # brownfield only
chain_rigor: Full | Standard | Light
primary_language: java | kotlin | go | python | typescript | <other>
framework: <freeform>
```

`status: locked` MUST be set on `local.yaml` after first answer cache so
`pre-write-check.js` Gate-A protects it from accidental rewrite. (Gate
overridable via `ORCHESTRA_HOOK_PRE_WRITE_CHECK=off` if the user wants to
re-elicit.)

## Coordination protocol

**The 8 orchestra agents (`@product`, `@architect`, `@lead`, `@backend`,
`@frontend`, `@test`, `@evaluator`, `@reviewer`) are filesystem-coupled,
not message-coupled.** Tier tools omit `SendMessage` deliberately — agents
communicate by writing to designated paths under `<cwd>/.orchestra/` (for
agent-internal coordination) or `<cwd>/docs/` (for stakeholder-readable
artifacts). The parent reads those paths after each idle notification.

The handoff pattern:

```
1. Parent: Agent({ team_name, name, subagent_type, prompt: "Write your output to <designated path>. End your turn." })
2. Spawned agent runs; writes the file; turn ends; idle notification.
3. Parent: Read(<designated path>) to consume the agent's output.
4. Parent: optionally Agent again for the next stage.
```

Do NOT instruct spawned agents to call `SendMessage` (not in any tier).
Do NOT poll for messages — idle notification fires automatically. Do NOT
write artifacts from the parent context — every chain artifact must be
authored inside its assigned agent's context per the tier discipline.
**Carve-out**: parent writes `<cwd>/.orchestra/local.yaml` (decision-tree
cache) and the terminal closing event (no SUMMARY artifact in v4.0; the
`events.jsonl` Stop hook captures terminal state).

## Chain execution

Once decisions are locked in `local.yaml`, @lead routes through layers
per the elected chain rigor. Hard-sequential layers feed each other; the
parallel fan-out happens once `openapi.yaml` is locked.

```
HARD-SEQUENTIAL (lift dependency)
  PRD ──→ FRS ──→ SAD ──→ TDD ──→ openapi.yaml | asyncapi.yaml
                  │
                  └─ ADR-NNNN.md (parallel with TDD when independent of TDD content;
                     sequential if TDD informs it)

PARALLEL FAN-OUT (gated on openapi locked)
  openapi ──┬──→ @backend     ──→ server code + unit tests
            ├──→ @frontend    ──→ UI code + unit tests          (skipped if no UI layer)
            └──→ @test Stage-1 ──→ TSR test-plan + black-box tests   (SPEC-BOUND; src/ blocked)

CONVERGE
  All three ──→ @test Stage-2 (impl-aware) + @evaluator + @reviewer
            ──→ TSR-NNN.md (sections locked)
```

**Chain-rigor presets:**

| Layer | Full | Standard | Light |
|---|---|---|---|
| PRD | ✓ | ✓ | — |
| FRS | ✓ | ✓ | — |
| SAD | ✓ | — | — |
| ADR | ✓ (when triggered) | — | — |
| TDD | ✓ | ✓ | ✓ |
| openapi.yaml | ✓ | ✓ | ✓ |
| code + tests | ✓ | ✓ | ✓ |
| TSR | ✓ | ✓ | ✓ |

@lead reads `local.yaml.chain_rigor` and skips elided layers. Light rigor
is for component-internal changes that don't shift specs (e.g., refactor,
internal-only behavior fix); the implementer still produces tests and TSR
for verification.

**Stage-1 @test is spec-bound.** Authoring runs in parallel with @backend
and @frontend. The agent reads only `openapi.yaml`/`asyncapi.yaml`, PRD,
FRS — `<consumer>/src/**` is blocked at the tool-permission level
(per-stage Read allowlist; mechanism in `agents/test.md`). If Stage-1
cannot author tests because openapi is silent, the agent writes
`<cwd>/.orchestra/pipeline/<id>/DEADLOCK-<id>.md` referencing the missing
spec element — @lead picks up and re-spawns @architect or self to amend.

**Within-agent parallelism (BL-0033).** @backend (and optionally
@frontend, @test) splits large impl tasks into N parallel sub-runs via
nested Agent calls when the task graph in `TASKS-NNN.md` has
parallel-eligible nodes. Prompt-discipline only — no harness change.

## Steps (smart router)

1. **Decision tree.** Per "Decision tree" above. Cache to `local.yaml`.
2. **Spawn @lead.** Pass locked decisions in prompt. If brownfield and depth-elected, @lead first invokes the `project-discovery` skill to reverse-doc to depth.
3. **@lead routes through layers** per chain-rigor:
   - **Business** (Full/Standard) — @product writes `docs/<feature-id>/PRD-<NNN>.md` then `docs/<feature-id>/FRS-<NNN>.md`. PRD `S-OPEN-Q-001` flags open questions; FRS lifts and resolves or escalates (BL-0029).
   - **Architecture** (Full only) — @architect writes `docs/SAD.md` (singleton; first-feature bootstrap) and `docs/adr/ADR-NNNN-<slug>.md` (per ADR trigger). C4 L1+L2 diagrams + Logical ERD + Inter-service Sequence as `.puml` under `docs/diagrams/`.
   - **Component** (always) — @lead writes `docs/<feature-id>/TDD-<NNN>.md` (C4 L3 + Intra-service Sequence + Technical State if applicable + Physical DB if schema touched).
   - **Boundary** (always) — @lead writes `docs/<feature-id>/openapi.yaml` (or asyncapi.yaml). CONTRACT narrative folds inline via `description:` fields and top-of-file `# orchestra:` comment block.
4. **openapi locked → fan-out.** @lead spawns @backend ‖ @frontend ‖ @test (Stage-1) in a single Agent-tool-call message. Each spawn carries a scoped Read allowlist: @test Stage-1 excludes `<consumer>/src/**`.
5. **Converge.** @backend writes server code + unit tests under `<consumer>/src/main/**` and `<consumer>/src/test/**`. @frontend writes UI code (skipped if no UI). @test Stage-1 writes the TSR test-plan section + black-box tests. After all three idle, @lead spawns @test Stage-2 (impl-aware) + @evaluator + @reviewer in dependency order.
6. **TSR multi-writer.** `docs/<feature-id>/TSR-<NNN>.md` accretes per-writer sections enforced by `pre-write-check.js` Gate-B (per-section locks):
   - `S-TEST-PLAN-001` — @test Stage-1 (spec-bound; src/ blocked)
   - `S-TEST-RESULTS-001` — @test Stage-2 (impl-aware; runs the suite, records per-test PASS/FAIL)
   - `S-VERDICT-EVAL-001` — @evaluator (inspection over PRD/FRS/openapi/TSR test sections; no Bash)
   - `S-VERDICT-REVIEW-001` — @reviewer (code review)
   - `S-ADR-REVIEW-001` — @reviewer (when ADRs touched)
   - `S-SHIP-001` — `/orchestra ship` subcommand

   @evaluator reads only `docs/<feature-id>/*` artifacts (PRD, FRS, TDD, openapi, TSR test-plan + test-results sections); `<consumer>/src/**` is blocked. @test Stage-2 owns suite execution; @evaluator becomes pure inspection (no Bash) and grades the PASS/FAIL evidence Stage-2 records.
7. **Terminal state.** After every parent `Read` in steps 5–6, evaluate:
   - `RELEASE-vX.Y.Z.md` written → `terminal_state = "success"` (only via `/orchestra ship`)
   - `DEADLOCK-*.md` → `terminal_state = "deadlock"`
   - `ESCALATE(-ADR)?-*.md` with frontmatter `resolution: abandoned` → `terminal_state = "escalated"`
   - otherwise → continue Step 5–6 spawn loop

   On terminal state: emit closing status line. The Stop hook fires `events.jsonl` event with the terminal state and `<run-id>.json.status` ∈ {`completed`, `aborted`, `deadlocked`}. No SUMMARY artifact write — observability is the source of truth (BL-0032).

### src/ purity (enforced)

Implementer writes to `<consumer>/src/main/**`, `<consumer>/src/test/**`
(or language equivalents) MUST NOT carry chain-artifact section-anchor
cites — references like `PRD`/`FRS`/`TDD`/`CONTRACT`/`TSR`/`ADR-NNNN`
followed by a section pointer, plus `FR-N`, `AC-N`, `C-N`, `NFR-N`,
`S-XXX-NNN`, `openapi.yaml#/paths/`. `pre-write-check.js` Gate-D rejects
at write time. Traceability lives in commit messages, PR descriptions,
and the TSR verdict sections — not in business code.

## /orchestra ship

Cuts release artifacts after gate verification. Smoke-test the consumer
install path BEFORE invoking (`feedback_smoke-before-release-docs`
discipline).

Algorithm:

1. **Verify gates.** Walk artifacts; halt with the failing artifact path on:
   - Open `DEADLOCK-*.md` or `DEADLOCK-ADR-*.md` anywhere under `<cwd>/.orchestra/pipeline/`.
   - Any `docs/<feature-id>/TSR-*.md` with `eval_verdict: FAIL`, `rev_verdict: REQUEST_CHANGES`, or `eval_score < passing_score` from openapi description.
   - `<cwd>/.orchestra/pipeline/<id>/ESCALATE*.md` with `resolution: pending`.
   - `git diff`-detected drift on a `status: locked` artifact (use `git diff` since lockfile sidecars are gone).
2. **Smoke-test the consumer install path.** Canonical 5-step chain:
   - (a) `claude plugin validate .` — offline schema check.
   - (b) `/plugin marketplace add /absolute/path` — register local marketplace.
   - (c) `/plugin install <plugin>@<marketplace>` — deep-schema validate.
   - (d) `/orchestra help` — command surface loads.
   - (e) bootstrap test on `git init` directory — `/orchestra <intent>` writes `local.yaml` + `metrics/events.jsonl`.
   Any step fails → STOP. CI validators check our invariants, not Claude Code's plugin schemas.
3. **Author release artifacts** (parent context, narrowly carved exception):
   - `docs/releases/RELEASE-vX.Y.Z.md` — version, date, summary, included features, gates cleared, plus `S-ANNOUNCEMENT-001`.
   - `docs/runbooks/RUNBOOK-vX.Y.Z.md` — only when topology changed.
   - `docs/<feature-id>/TSR-<NNN>.md` `S-SHIP-001` — `ALLOW` / `HOLD` plus rationale (SHIP frontmatter `ship:` mirror).
4. **Draft release commit message** (Conventional Commits 1.0.0):
   - Read `git diff --staged --stat` and `git diff --staged`.
   - Type ∈ {`feat`, `fix`, `refactor`, `test`, `docs`, `chore`, `perf`, `ci`, `build`}; choose the dominant type.
   - Scope: load-bearing area (`api`, `infra`, `hooks`, `agents`, `skills`, `command`, `validators`, etc.).
   - Subject `≤72` chars, imperative mood, no trailing period.
   - Optional body wrapped at 72; trailers (`BREAKING CHANGE:`, `Closes #NN`, `Refs:`, `Co-Authored-By:`).
5. **Hand off to user.** User runs `git commit` / `git tag` / `git push`. This subcommand does NOT auto-commit, auto-tag, or push.

Bump VERSION via `node scripts/bump-version.js` only — never edit
`VERSION` / `package.json` / plugin manifest by hand.

## /orchestra report

Observability subcommand (Stream 7). Reads `events.jsonl` + `tokens.jsonl`
+ `runs/*.json` from `<cwd>/.orchestra/metrics/`; emits Gantt timeline
`.svg` + cost-by-role + cost-by-phase pivots, plus non-blocking
readers-violations summary (Gate-C aggregation) and business-code-purity
summary (Gate-D aggregation). Implementation: `scripts/orchestra-report.js`.

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/orchestra-report.js \
  --metrics-dir <cwd>/.orchestra/metrics \
  --out <cwd>/.orchestra/reports/<run-id>/
```

Cadence: on invocation. Non-blocking — never causes a build to fail.

## /orchestra resume [<feature-id>]

Resume an interrupted feature run. Walks `<cwd>/.orchestra/pipeline/*/`
dirs, finds the next non-`done` task, respawns the owner. Idempotent —
respawning an owner whose prior turn partially completed is safe.

Algorithm:

1. **Enumerate candidates.** List `<cwd>/.orchestra/pipeline/*/` dirs without a final `docs/<feature-id>/TSR-*.md.ship: ALLOW`. 0 candidates → emit `[orchestra] resume no in-flight features` and exit. 1 → auto-select. >1 → `AskUserQuestion`. If `<feature-id>` arg passed, validate against candidates; mismatch → write `DEADLOCK-resume-<id>.md` and halt.
2. **Validate prerequisites.** Read `<cwd>/.orchestra/pipeline/<feature-id>/intent.yaml`. Missing → fail closed: write `DEADLOCK-resume-<feature-id>.md` and halt. Then scan:
   - `DEADLOCK-*.md` present → emit banner; deadlocks need manual rescope.
   - `ESCALATE*.md` with `resolution: pending` → emit banner + `AskUserQuestion` ("ESCALATE pending: `<reason>`. Resolved externally?"). Reject → halt; accept → proceed.
3. **Find resume point.** Read `TASKS-NNN.md` and walk topologically. For each task in order:
   - `Status = done` → skip.
   - Owner is read-only-tier (`@evaluator` / `@reviewer`) — derive done status from TSR frontmatter (`eval_verdict ∈ {PASS, FAIL}`, `rev_verdict ∈ {APPROVED, REQUEST_CHANGES}`).
   - Owner is artifact-tier — derive done from artifact existence with frontmatter `status: locked`.
   - First non-done task → resume point.
4. **REQUEST_CHANGES gate.** If resume point follows a TSR `rev_verdict: REQUEST_CHANGES`, do NOT auto-respawn. Emit banner + `AskUserQuestion` ("Last review verdict: REQUEST_CHANGES (`<N findings>`). Respawn @<owner> for revision, or halt?"). Accept → step 5; reject → halt.
5. **Spawn.** Issue `Agent({ subagent_type, prompt })` with locked decisions from `local.yaml` plus a resume directive: "Your task is `T-<id>` in `TASKS-<NNN>.md`. Read existing artifacts before re-writing — idempotent re-write is acceptable."
6. **Continue smart-router** from the resume point through terminal-state detection.

## Runtime hooks

4 hooks registered in `hooks/hooks.json`. Hooks own their events per
"Invariants" above — do not replicate hook side effects.

| Hook | Events (matchers) | Side effect |
|---|---|---|
| `metrics-collector` | UserPromptSubmit / PreToolUse:Task\|Agent\|TeamCreate\|TeamDelete\|Skill\|Write\|Edit\|MultiEdit\|mcp__orchestra-* / SubagentStop / Stop | Emits lifecycle events to `<cwd>/.orchestra/metrics/events.jsonl` (Stream 7 retools for `agent_role` + `phase` + `subagent_session_id` join keys) |
| `pre-write-check` | PreToolUse:Write\|Edit\|MultiEdit | Secrets matcher (8 patterns; exit 2) + 4 frontmatter gates: status-locked / sections-all-locked / readers-warning / src/ cite denylist |
| `val-calibration` | PreToolUse:Task\|Agent | Injects `<calibration-anchor>` block into `@evaluator` spawn prompts |
| `post-bash-lint` | PostToolUse:Bash | Surfaces source-modifying Bash to stderr (observer; never blocks) |

Stream 9 adds a fifth hook (`post-write-puml`) for diagram render
enforcement.

## /orchestra help

```
/orchestra <intent>           Smart router. Mode-detect → chain-rigor → spec-to-code chain (PRD/FRS/SAD/ADR/TDD/openapi/code+tests/TSR).
/orchestra ship               Verify gates → smoke-test install → write RELEASE / RUNBOOK + TSR S-SHIP-001 → draft Conventional Commits message. User commits + tags manually.
/orchestra report             Render Gantt + cost-by-role + cost-by-phase from events.jsonl/tokens.jsonl/runs.
/orchestra resume [<feature-id>] Walk .orchestra/pipeline/* dirs; find non-terminal feature; respawn next non-done task.
/orchestra help               This message.
```

Flags:
- `--rigor {Full,Standard,Light}` — override `local.yaml.chain_rigor` for this run.
- `--mode {greenfield,brownfield}` — override mode detection.
- `--depth {light,medium,full}` — override depth (brownfield only).
