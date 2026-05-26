# /orchestra dispatch strategy contract

Companion to `commands/orchestra.md` (the dispatcher prompt itself). For generic plugin-authoring rules see `plugin-authoring.md` (R1-R14).

Locked enumeration of every execution path `/orchestra` dispatches. Anchored to
four entry shapes (`empty`, `spec-to-code`, `code-to-spec`, `<intent>`),
disambiguated by `docs/` and `src/**` preconditions, and resolved by three
locked decisions at the end of this section.

Nine strategies (S1–S9). Three orthogonal axes determine routing:

1. **Entry shape** — what the user types.
2. **`docs/` state** — empty, partial-locked one feature, full-locked one feature, locked N features.
3. **`src/**` state** — empty vs. present.

## Strategies

### S1 — Empty invocation

- **Entry:** `/orchestra`
- **Preconditions:** —
- **Path:** Emit usage block. No chain. No agent spawn.

### S2 — Greenfield author-from-scratch

- **Entry:** `/orchestra spec-to-code`
- **Preconditions:** `docs/<feature-id>/` empty. `src/**` empty.
- **Path:** Full forward chain.
  `@product` → `@analyst` → `@architect` → implementer fan-out (`@backend` ‖ `@frontend` ‖ `@test-author`) → TSR convergence (`@test-runner` + `@evaluator` + `@reviewer`).

### S3 — Single-feature resume

- **Entry:** `/orchestra spec-to-code`
- **Preconditions:** Locked artifacts for one feature in `docs/<feature-id>/`
  AND partial impl present in `src/**` for that feature OR partial-locked
  authoring layers.
- **Path:** Validate frontmatter (trust `status: locked` + `subagent_session_id`
  as-is — no re-validation against current `system.yaml`). Resume at first
  unlocked authoring layer OR first missing implementer artifact.
  Single-feature fan-out → TSR.

### S4 — Multi-feature batch from locked docs

- **Entry:** `/orchestra spec-to-code`
- **Preconditions:** Locked artifacts for N feature-ids in `docs/`
  AND `src/**` empty.
- **Path:** Enumerate every locked `<feature-id>/` under `docs/`. Spawn N
  implementer fan-outs in one message (parallel-all). One TSR per feature.
  `clientapi.yaml` topo-sort is irrelevant at fan-out — preconditions
  guarantee every upstream contract is locked.

### S5 — Reverse chain, auto-detected scope

- **Entry:** `/orchestra code-to-spec`
- **Preconditions:** `src/**` exists. No second token.
- **Path:** Reverse chain with scope inferred from `workspace_kind` in
  `.orchestra/system.yaml`. Single-repo workspace → per-service scope;
  multi-repo workspace → system-wide scope.

### S6 — Reverse chain, forced system-wide

- **Entry:** `/orchestra code-to-spec system`
- **Preconditions:** Multi-repo workspace.
- **Path:** Reverse forced to `scope_level: system-wide`. Authors `SAD.md`,
  ADRs, `business-invariants.md`, and per-service BR-AC.

### S7 — Reverse chain, forced per-service

- **Entry:** `/orchestra code-to-spec service:<name> --source=<path>`
- **Preconditions:** Scope pinned to one service. `--source=<path>` is REQUIRED.
- **Path:** Reverse forced to `scope_level: per-service`. Skips architecture
  layer (SAD / ADRs / business-invariants). Persists `source_path` to
  `local.yaml`.

### S8 — Router, greenfield branch

- **Entry:** `/orchestra <intent>`
- **Preconditions:** Freeform intent. `src/**` empty (greenfield detected).
- **Path:**
  1. 3× `AskUserQuestion` upfront (restate-intent / scope / constraints).
  2. Route to S2, S3, or S4 based on `docs/` state.

### S9 — Router, brownfield branch

- **Entry:** `/orchestra <intent>`
- **Preconditions:** Freeform intent. `src/**` present (brownfield detected).
- **Path:**
  1. 1× `AskUserQuestion` (workspace-kind-adaptive):
     - Single-repo: `investigate code first? [yes / no]`.
     - Multi-repo: `investigate? scope? [no / system-wide / service:<name>]`.
  2. Gate = `no` → **abort with error**. Forward chain over non-empty
     `src/**` without a baseline is unsafe.
  3. Gate = `yes` → run S5 / S6 / S7 at chosen scope.
  4. After reverse pass locks baseline: 3× `AskUserQuestion` post-reverse
     (restate-intent / scope / constraints — now informed by locked
     artifacts).
  5. Route to S2 / S3 / S4 based on `docs/` state after the reverse pass.

## Decision matrix

| `docs/` state | `src/**` state | Strategy (explicit / via router) |
|---|---|---|
| Empty | Empty | S2 / S8 |
| Empty | Present | S5–S7 / S9 |
| Locked, one feature, partial layers | Empty | S3 |
| Locked, one feature, full | Empty | S4 (N=1) |
| Locked, one feature | Partial impl | S3 |
| Locked, N features | Empty | S4 |
| Locked, N features | Partial | Out of scope. Undefined. |

## Locked decisions

1. **S9 gate = no investigation → abort with error.**
   Forward chain over non-empty `src/**` without a baseline silently
   overwrites code-truth with chain-invented specs. Not enough context to
   proceed safely.

2. **S3 partial-locked layer validation → trust locked frontmatter as-is.**
   The `status: locked` + `subagent_session_id` pair is the contract.
   Re-validating against current `system.yaml` would block cross-workspace
   migration, which is S3's whole point.

3. **S4 iteration policy → parallel-all.**
   Spawn N feature fan-outs in one message. `clientapi.yaml` topo-sort is
   irrelevant for fan-out (preconditions guarantee locked contracts) and
   only conditionally relevant for TSR (cross-feature integration tests, not
   orchestra's default).

## Principled asymmetries

- **3× `AskUserQuestion` position differs by branch.**
  Greenfield runs the round upfront (no code exists to inform). Brownfield
  runs 1× upfront (permission + scope gate) plus 3× post-reverse (now
  informed by locked artifacts). Driven by what information is available at
  each gate.

- **Router composes; never introduces new chain machinery.**
  S8 / S9 dispatch into S2 / S3 / S4 / S5 / S6 / S7. No router-only
  execution path exists.

- **`docs/` axis is orthogonal to `src/**` axis.**
  Four `docs/` states × two `src/**` states cover all quadrants in the
  decision matrix above.

- **`local.yaml` cache is dialogue compression, not a strategy.**
  When cached `scope_level` + `source_path` exist, S9's 1× elicitation
  degrades to a 1× confirmation. No new strategy emerges from the cache hit.

## Out-of-scope quadrant

`docs/` locked for N features + `src/**` partial impl is not a defined
strategy. It conflates S3 (resume per-feature) and S4 (batch enumerate); the
ambiguity is which features in `docs/` correspond to which partial state in
`src/**`. Resolution deferred to a future brief if the case surfaces in
practice.
