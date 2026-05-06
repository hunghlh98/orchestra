---
id: PRD-004
title: Backlog mechanism + v2.* curation pass
status: planned
created: 2026-05-06
revision: 2
sections:
  S-PROBLEM-001:    { hash: "TBD", confirmed: true }
  S-DECISIONS-001:  { hash: "TBD", confirmed: true }
  S-CURATION-001:   { hash: "TBD", confirmed: true }
  S-FRS-001:        { hash: "TBD", confirmed: true }
  S-NONGOALS-001:   { hash: "TBD", confirmed: true }
  S-OPENQ-001:      { hash: "TBD", confirmed: false }
---

# PRD-004 — Backlog mechanism + v2.* curation pass

> Output of `/sc:sc-brainstorm` on 2026-05-06. Captures the user-confirmed v2.* release scope, the curation pass that prunes deferred items, and the canonical backlog mechanism that replaces scattered `PRD-NNN §14` / `DESIGN-NNN §<followups>` sections.

## 1. Problem <a id="S-PROBLEM-001"></a>

The orchestra plugin's deferred-feature inventory currently lives in five scattered locations:

- `docs/PRD-001.md §14` (8 sub-sections, ~50 items).
- `docs/PRD-002.md §8` deferred-items.
- `docs/PRD-003.md §11` (token-cost regression).
- `docs/DESIGN-005.md §14` and `docs/DESIGN-006.md §8` follow-ups.
- Inline `// deferred to v1.1+` comments in `agents/{backend,frontend}.md` and `skills/task-breakdown/SKILL.md`.

Two failure modes:

1. **Reconciliation drift.** Items shipped under v2.0 (e.g., `c4-architecture` skill, `/orchestra resume`, `/orchestra metrics`, `/orchestra shutdown`, mid-run visibility, the v1.0.1 streamline initiative) are still listed as deferred in `PRD-001 §14` and `WORKFLOW-002 §5.5`. Any planning pass that treats those PRDs as authoritative will mis-scope.
2. **Discovery cost.** "What's pending?" requires reading five+ documents. The cost is high enough that the question is rarely asked, which is why the backlog has rotted across two releases.

Compounded by stale `status:` frontmatter: `PRD-002` and `PRD-003` both claim `status: planned` despite being shipped.

## 2. User-confirmed decisions <a id="S-DECISIONS-001"></a>

| ID | Decision | Reason |
|---|---|---|
| D-1 | All in-scope work targets **v2.*** (MINOR/PATCH). No v3.0 breaking changes in this motion. | User: "i expect all scope release under v2.*". |
| D-2 | **Java** is the single language focus; FE / Go / Python / Kotlin expansions are out-of-scope. | User: "currently i focus only java code, so pick another". |
| D-3 | Three themes for the v2.* release window: **(α) backlog mechanism** (this PRD), **(β) `/orchestra sprint --think` + `--delegate`** flags, **(γ) consumer-observed token cost via `metrics-collector` hook + `/orchestra metrics`**. | User accepted B5 + B8.token-cost from the brainstorm; replaced B4 with α per their Q3 ask. γ shape later corrected by D-6. |
| D-4 | Backlog items unsuitable for current flow OR adding heavy complexity are **killed, not deferred**. Kills must be justified per item. | User: "remove and clean up". |
| D-5 | **`docs/optimization-pr-gamma-plan.md` is deleted.** Stale; v2.0 PR #5 already trimmed `commands/orchestra.md`. | User: "kill if not used". |
| D-6 | Theme γ adopts the **γ-C shape**: consumer-observed token cost surfaced via `/orchestra metrics`, NOT a CI regression gate on dev source. The existing `metrics-collector` hook is extended to record token counts per agent spawn into `events.jsonl`. | User /sc:sc-brainstorm follow-up on 2026-05-06: "γ-C: Consumer-observed token cost (live, surfaced in /orchestra metrics), can apply to hook metrics-collector". |
| D-7 | **Cleanup of stale "deferred / v1.1+" references** is elevated to a first-class deliverable under theme α phase α-2 (see §4.1.B). Both dev-surface (`docs/PRD-NNN`, `docs/DESIGN-NNN`, `docs/WORKFLOW-NNN`) and consumer-surface (`agents/{backend,frontend}.md`, `skills/task-breakdown/SKILL.md`, `commands/orchestra.md`, `README.md`) get reconciled. | User /sc:sc-brainstorm follow-up on 2026-05-06: "i think you also make plan for clean up un-implement feature on old doc for reduce confuse." |

## 3. Curation pass <a id="S-CURATION-001"></a>

Classification of every B1–B10 item from the brainstorm inventory.

### 3.1 KILL (remove from backlog; justification per row)

| Item | Source | Reason |
|---|---|---|
| `@pm` haiku-tier intent classifier (B1) | PRD-001 §14.1 | Adds a tier-0 hop in front of `@product`, complicates routing taxonomy. Cost-optimization premise unverified — `@product` calls are not the dominant cost. |
| `reducing-entropy` skill (B2) | PRD-001 §14.2 | Unclear failure mode; no observed regression that justifies it. Add only if a real issue surfaces. |
| `post-deploy-analytics` skill (B2) | PRD-001 §14.2 | Requires deployment infra orchestra explicitly disclaims (PRD-001 NG2: not a CI/CD system). |
| `save` / `load` skill (B2) | PRD-001 §14.2 | PRD itself gates this on "telemetry-justified ROI"; no telemetry, no justification. |
| `cost-profiler` hook (B3) | PRD-001 §14.3 | Same telemetry-gate as save/load; explicit opt-in already documented but premature. |
| Mid-flight checkpoint over end-to-end run (B6) | PRD-001 §14.6 | Overlaps with shipped `/orchestra resume`; would duplicate state. |
| Heartbeat / stall-detection (B7) | PRD-002 §8 | Adds polling/timer infrastructure to a filesystem-coupled system; architecturally awkward. PRD-002 brainstorm Q2 already declined this once. |
| External sinks (Slack / CI / web dashboard) (B7) | PRD-002 §8 | Explicitly out-of-scope per PRD-002 §Q3. Re-confirm kill. |
| `install.sh` / `install.ps1` (B9) | PRD-001 §14.8 | Redundant with `claude plugin install` (the G4 acceptance criterion). |
| Consumer-facing `HOOKS.md` (B9) | PRD-001 §14.8 | `manifests/runtime-toggles.json` already serves consumers; dev-surface `docs/HOOKS.md` is sufficient for maintainers. |
| `adr-tools` / `log4brains` interop (B10) | DESIGN-005 §14 F-6 | Naming convention is already compatible; no demand has surfaced. Kill until a user asks. |
| `docs/optimization-pr-gamma-plan.md` | dev-surface artifact | Stale per D-5. Delete the file as part of the migration. |

### 3.2 DEFER (valid; push to canonical backlog; no near-term plan)

| Item | Source | Why defer (not kill) |
|---|---|---|
| `@architect`, `@ux`, `@security`, `@debugger` specialist agents (B1) | PRD-001 §14.1 | Each requires its own design pass; routing-taxonomy implications real. Per D-1 these are also v3-shaped (breaking), so explicitly out-of-window. |
| Mechanical FE/BE separation via pre-write-check globs (B1) | agents/{backend,frontend}.md | Useful but not Java-focus-relevant per D-2. |
| `migration-extraction` skill + `/orchestra legacy <path>` (B2 / B5) | PRD-001 §14.2, §14.5 | Brownfield reverse mode; coupled. Land together when prioritized. |
| `frontend-component-patterns` skill (B2) | DESIGN-006 §8 | FE-shaped per D-2. |
| `sc-spec-panel` skill (B2) | PRD-001 §14.2, §9.4 | Adds a 4th dialogue pattern; needs design spec. |
| 5-dimension confidence scorecard (B6) | PRD-001 §14.6 | Refinement of HIGH/MEDIUM/LOW; non-trivial reshape of `@lead` autonomy classification. |
| Wave orchestration / Pattern C integration checkpoints (B6) | PRD-001 §14.6 | Pattern C itself is v1.1+; checkpoints downstream. |
| Async `OPTION_SYNTHESIS` / `PROPOSAL-<id>.md` (B6) | PRD-001 line ~539 | New artifact type + async semantics; heavy. |
| Async `PAUSE-<phase>-<id>.md` artifacts (B6) | WORKFLOW-002 line ~227 | Pairs with B6 OPTION_SYNTHESIS. |
| Sprint-level rollup across multiple issues (B7) | PRD-002 §8 | Multi-feature aggregation; current scope is per-feature-id. |
| Empirical ablation loop (B8) | PRD-001 §14.7 | High-leverage but standalone tooling motion; deserves its own design. |
| Playwright MCP for FE behavioral probes (B8) | PRD-001 §14.7 | FE-shaped per D-2. |
| Parallel worktrees pattern (B8) | PRD-001 §14.7 | Workflow guidance; can wait. |
| Tiered memory + memory consolidation (B8) | PRD-001 §14.7 | Touches the memory system; high-blast-radius. |
| NoSQL probes (Mongo / DynamoDB / Redis) (B8) | PRD-001 line ~860 | Out-of-scope for SQL-focused user; defer until asked. |
| `/save`, `/load`, `/orchestra-disagree` subcommands (B5) | commands/orchestra.md line ~257 | Couple to telemetry / save-load skill — gated similarly. |

### 3.3 KEEP (v2.* in scope)

| Item | Source | Theme | Notes |
|---|---|---|---|
| Centralized backlog mechanism | this PRD §4.1 | α | Replaces scattered §14 / §followup sections. Foundation for all future planning. |
| `/orchestra sprint --think` flag (B5) | PRD-001 §14.5 | β | `PLAN.md` exploration ≥3 approaches; small surface. |
| `/orchestra sprint --delegate` flag (B5) | PRD-001 §14.5 | β | Pause after `PLAN.md` for human approval. |
| Consumer-observed token cost via `metrics-collector` + `/orchestra metrics` (B8 reshape) | PRD-003 §11 | γ | Live observability, not a CI gate. See D-6 + §4.3. |
| Stale `status:` frontmatter on PRD-002 + PRD-003 | dev hygiene | α-companion | Flip to `shipped` + version field as part of α migration. |
| OQ-3 ESCALATE pending vs abandoned semantics | PRD-002 §OQ-3 | α-companion | Tiny semantic clarification; resolve during α migration. |
| `console-log-auditor` hook (B3) | PRD-001 §14.3 | candidate | Java-aware regex on `System.out.println` / `System.err.println` etc. Cheap; fits D-2. **User confirm before adding** — see OQ-1. |
| `prompt-injection-guard` hook (B3) | PRD-001 §14.3 | candidate | `PreToolUse` on `WebFetch`. Orthogonal, cheap. **User confirm before adding** — see OQ-1. |
| `db_state` JSONL ledger (B8) | PRD-001 §14.7 | candidate | Tiny addition for `@evaluator` probe observability. **User confirm before adding** — see OQ-1. |

The three "candidate" rows above are not part of D-3's three themes but are cheap enough that they could ride alongside without disturbing scope. Decision in §6.

## 4. Functional requirements <a id="S-FRS-001"></a>

### 4.1 Theme α — Backlog mechanism

**F-α-1.** Single canonical backlog file at `docs/BACKLOG.md` (dev-surface; consumer install does not see it).

**F-α-2.** Each backlog item has a stable ID. Format: `BL-NNNN-<slug>` (4-digit zero-padded, global flat numbering, mirrors the ADR pattern from DESIGN-005). Numbers never reuse on close.

**F-α-3.** Each item has a status from a fixed enum: `proposed | accepted | in-flight | shipped | killed | deferred`.

**F-α-4.** Each item carries minimum metadata:
- ID, slug, status.
- Source (the PRD/DESIGN/inline-comment site that originally proposed it; populated during migration).
- One-paragraph rationale.
- Date created / date last-changed (resolved to absolute dates per CLAUDE.md "convert relative dates").

**F-α-5.** Migration: the kills in §3.1 + defers in §3.2 land as `BL-NNNN-...` entries in `docs/BACKLOG.md` (status `killed` or `deferred`) **once**, then the source PRDs / DESIGN docs are edited to point to the BACKLOG file instead of inlining the items.

**F-α-6.** New deferred items added during future PRDs get a `BL-NNNN-...` entry on the same edit. A short cross-link in the PRD body suffices: `> Backlog: BL-NNNN-...`.

**F-α-7.** Stale-status reconciliation: edit `docs/PRD-002.md` and `docs/PRD-003.md` frontmatter `status: planned` → `status: shipped`, add `shipped_in: <version>` (PRD-003 → 2.0.0; PRD-002 → resolve from git log during design).

**F-α-8.** Validation (optional, deferred to design pass): a `scripts/validate-backlog.js` that lints required fields. Decide YES/NO during /sc:sc-design. See OQ-2.

**Non-goal for α:** no per-item file (no `docs/backlog/BL-NNNN-<slug>.md` ADR-style folder unless the design pass argues for it). Start with a flat table; complexity earns its keep.

### 4.1.B Phase α-2: Cleanup migration plan

The migration that populates `docs/BACKLOG.md` for the first time is also the cleanup pass for stale "deferred / v1.1+" references scattered across the repo. Per D-7, this is a first-class deliverable, not a side-effect.

Two sweeps. **Sweep 1 lands first** under a dev-only commit; **Sweep 2 lands second** under a separate commit so a consumer-surface smoke regression can revert independently.

#### Sweep 1 — dev-surface (under `docs/`)

Each location's existing inlined backlog content is excised; the section is replaced with a one-line pointer to `docs/BACKLOG.md`.

| Source location | Action |
|---|---|
| `docs/PRD-001.md §14` (entire `## 14. v1.1+ Backlog`) | Items shipped under v2.0 (e.g., `c4-architecture` skill, `/orchestra resume`, mid-run visibility) are reconciled out — NOT entered as `shipped` in BACKLOG.md (they're done; pollution-free is preferred). KILL items from §3.1 enter BACKLOG.md as `status: killed` with the §3.1 justification. DEFER items from §3.2 enter as `status: deferred`. Section body replaced with: "See `docs/BACKLOG.md` for the canonical post-v1.0 backlog." |
| `docs/PRD-002.md §8` deferred items | Move to BACKLOG.md; replace with pointer. Resolve OQ-3 per §6 OQ-5. Frontmatter `status: planned` → `status: shipped`, `shipped_in: <version>` (resolve from git log during design). |
| `docs/PRD-003.md §11` token-cost backlog | Convert to a BACKLOG.md entry `BL-NNNN-token-cost-visibility` reshaped per γ-C. Section body replaced with pointer. Frontmatter `status: planned` → `status: shipped`, `shipped_in: 2.0.0`. |
| `docs/DESIGN-005.md §14` follow-ups (F-4 race-doc, F-6 adr-tools interop) | F-4 stays as a known-limitation note inline (it's a real architectural constraint, not a backlog item); F-6 moves to BACKLOG.md as `status: killed` per §3.1. |
| `docs/DESIGN-006.md §8` follow-ups | License clarification + `frontend-component-patterns` move to BACKLOG.md as `status: deferred`. README status line resolved during Sweep 2 below. |
| `docs/WORKFLOW-002.md §5.5` v1.1+ items list + line ~227 PROPOSAL/PAUSE async note | Replace with pointer. |
| `docs/optimization-pr-gamma-plan.md` | **Delete file** (per D-5). |

#### Sweep 2 — consumer-surface (everything that ships)

Per project `CLAUDE.md` "Consumer surface MUST NOT cite developer-surface artifacts": these inline references leak the dev backlog into the consumer's session and add zero behavior. Reword or drop.

| File | Line | Current text (verbatim) | Action |
|---|---|---|---|
| `agents/backend.md` | ~18 | "(prompt-only scoping; mechanical separation deferred to v1.1+)" | Drop the parenthetical entirely. The "Do not touch frontend files" rule before it stays. |
| `agents/frontend.md` | ~19 | "(prompt-only scoping; mechanical separation deferred to v1.1+)" | Drop the parenthetical. |
| `agents/frontend.md` | ~27 | "(No FE-specific skill yet — `frontend-component-patterns` deferred to a later release.)" | Drop entirely. Consumer doesn't need a roadmap. |
| `skills/task-breakdown/SKILL.md` | ~116 | "Task can't be assigned to a v1.0.0 agent role → flag as 'needs `@architect` or `@security`' and defer (those agents are v1.1+)." | Reword: drop "v1.0.0" and "v1.1+" version refs. Semantic survives: "Task can't be assigned to a current agent role → flag as 'needs-future-specialist' and defer." |
| `commands/orchestra.md` | ~257 | "Deferred (v1.1+): `/save`, `/load`, `/orchestra-disagree`, `/orchestra legacy`." | **Delete the line.** Roadmap leaking into the consumer's `/orchestra help` output; gives no operational value. |
| `README.md` | bottom | "Status: v1.0.0 released 2026-05-03." (per DESIGN-006 §8 flag) | Update to current state OR remove (decide during /sc:sc-design — README front-matter status is non-load-bearing). |

**Sweep 2 acceptance gates.** Consumer-surface edits trigger a smoke-test re-run before any release tag, per the `smoke-before-release-docs` memory. Pre/post word-count delta is recorded in the PR description so the new γ-C `metrics-collector` baseline reflects the trimmer state.

### 4.2 Theme β — `/orchestra sprint --think` + `--delegate`

**F-β-1.** `/orchestra sprint --think` instructs `@lead` to write a `PLAN.md` artifact under the feature dir before any TDD work, exploring **≥3** distinct approaches with named tradeoffs.

**F-β-2.** `/orchestra sprint --delegate` triggers a sync pause after `PLAN.md` is written; user picks an approach via `AskUserQuestion`; chosen approach becomes the seed for the TDD/CONTRACT phase.

**F-β-3.** Both flags compose with `--size N` (already shipped) and `--confidence high|medium|low` (already shipped).

**F-β-4.** Schema: `PLAN.md` is a **new artifact type**. Fits the v2 scaffold-fill template engine. Add to `schemas/pipeline-artifact.schema.md` and a template at `schemas/templates/PLAN.template.md`.

**F-β-5.** Routing: only the `feature` and `refactor` intents accept `--think`/`--delegate`. `hotfix`/`docs`/`template`/`review-only` reject with an explanatory error.

### 4.3 Theme γ — Consumer-observed token cost (via `metrics-collector` extension)

Per D-6, theme γ is reshaped from a CI regression on dev source to **live observability surfaced in the consumer's session**. No CI gate — the cost lens lives at the surface where the consumer actually pays for it.

**F-γ-1.** Extend the existing `metrics-collector` hook (already emits `events.jsonl` entries for plugin events: `local.bootstrapped`, `★ Insight` capture, etc.) to record per-agent-spawn token cost:
- New event type `agent.spawn.cost` (or piggyback on the existing spawn event with new fields).
- Fields: `feature_id`, `agent` (e.g., `@lead`), `tokens_in`, `tokens_out`, `timestamp` (UTC ISO-8601), and `source` ∈ {`runtime`, `proxy`} — see F-γ-2.

**F-γ-2.** Token-source resolution (feasibility punted to /sc:sc-design):
- **Preferred path.** If Claude Code's hook payload exposes runtime token usage (e.g., via `tokensIn` / `tokensOut` on agent spawn events), record it as-is with `source: runtime`.
- **Fallback path.** If runtime usage is not exposed to hooks, count words across the spawn payload statically (system prompt + agent body + skills loaded + scaffolds + references pulled) and record with `source: proxy`. This understates output tokens but bounds input tokens reliably.
- The two paths must produce the same event schema so /orchestra metrics doesn't branch on source.

**F-γ-3.** `/orchestra metrics` subcommand (already shipped) extends to aggregate token cost per `feature_id`:
- Total tokens for the run (input + output).
- Per-agent breakdown — heaviest spawn surfaced first.
- Trend vs. last 10 runs (rolling baseline). Warns inline if current run is >X% over rolling mean — see OQ-4 for X.

**F-γ-4.** Optional terminal-banner line: at end of `/orchestra` run, dispatcher prints `[cost] N tokens (Δ vs avg: ±X%)`. Mandatory vs. opt-in vs. CLI-flag — see OQ-4.

**F-γ-5.** No CI gate. The dev-surface measurement of `commands/orchestra.md` and `agents/*.md` word count is **not** part of γ. Theme α phase α-2 records before/after deltas in the migration PR description as a one-time observation, but no automated regression check.

**F-γ-6.** Aggregate-rollup compatibility: `scripts/aggregate-metrics.py` (already exists for cross-consumer rollup) gains a `--cost` flag that summarizes token cost across `events.jsonl` files from multiple consumer projects. Still local — no telemetry transmission.

**F-γ-7.** `local.yaml` config field `metrics.show_cost_banner: bool` (default per OQ-4) toggles F-γ-4. Documented in `manifests/runtime-toggles.json`.

## 5. Non-goals <a id="S-NONGOALS-001"></a>

- **NG1.** No specialist agents (`@architect`, `@ux`, `@security`, `@debugger`) introduced in v2.*.
- **NG2.** No language-rule expansion (Go/Python/Kotlin remain stubs).
- **NG3.** No Pattern-C wave / async OPTION_SYNTHESIS in v2.*.
- **NG4.** No per-item ADR-style folder for the backlog (`docs/backlog/BL-*.md`) unless `/sc:sc-design` argues for it.
- **NG5.** No telemetry-collection infrastructure (`save`/`load`/`cost-profiler` all gated on data we don't have).
- **NG6.** No new MCP servers in v2.* (Playwright deferred per D-2; NoSQL probes deferred).
- **NG7.** No FE-specific skill or hook in v2.* per D-2.

## 6. Open questions <a id="S-OPENQ-001"></a>

| ID | Question | Default if unanswered |
|---|---|---|
| OQ-1 | Should the three "candidate" rows in §3.3 (`console-log-auditor`, `prompt-injection-guard`, `db_state` JSONL ledger) ride along with the v2.* release, or stay deferred to keep the release surface focused? | Stay deferred. Three themes is enough; expanding scope risks the release. |
| OQ-2 | For the backlog mechanism (theme α), does a flat `docs/BACKLOG.md` table satisfy the user's "machine" framing, or does the user want an ADR-style per-item folder + validator script? | Flat table only; per CLAUDE.md "Simplicity First". Promote later if the table outgrows itself. |
| OQ-3 | For `/orchestra sprint --delegate` (theme β), the sync pause uses `AskUserQuestion`. The current AskUserQuestion budget is HIGH=0, MEDIUM=1, LOW=2-3. Does `--delegate` count against the budget or live outside it? | Outside the budget — `--delegate` is an explicit user opt-in, not a confidence-driven question. |
| OQ-4 | Theme γ banner shape (F-γ-4): should `/orchestra` print the cost summary terminal banner **mandatorily** on every run, **opt-in via `local.yaml.metrics.show_cost_banner: true`**, or **opt-in via CLI flag `/orchestra ... --show-cost`**? Also: warn-threshold X% in F-γ-3 — default `+15%`? | Opt-in via `local.yaml` (default `false`). Keeps default UX clean; lets cost-conscious consumers enable once instead of per-invocation. Warn threshold `+15%` of rolling 10-run mean. |
| OQ-5 | ESCALATE `pending` vs `abandoned` (PRD-002 OQ-3): does `pending` resolution auto-shutdown the team container, or hold open until `abandoned`? | Hold open. Pending = under user review; auto-shutdown loses context. |

## 7. Next step

Hand this PRD to `/sc:sc-design` to produce `DESIGN-007-backlog-and-v2-curation.md` covering:

- File layout for `docs/BACKLOG.md` + one-shot migration script (covers both Sweep 1 and Sweep 2 from §4.1.B).
- Schema for `PLAN.md` artifact + scaffold template.
- `metrics-collector` hook extension contract: `agent.spawn.cost` event shape, runtime-vs-proxy source path resolution, `local.yaml.metrics.show_cost_banner` field, `/orchestra metrics` aggregation contract.
- Resolution of OQ-1..OQ-5.

`/sc:sc-workflow` follows after the design lands.
