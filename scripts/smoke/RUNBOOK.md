# Orchestra acceptance-smoke RUNBOOK

These smokes verify v4.0 end-to-end. They are **manual** because `/orchestra` runs an
LLM-driven chain inside an interactive Claude Code session; piping pre-canned answers
from a shell does not produce comparable artifacts (LLM prose is non-deterministic, and
agent token spend is rate-limited). Run them locally before tagging a release; record
the resulting numbers against the v3.x baseline in §8.bis of `docs/v4.0-brief.md`.

The two automated regression checks (`scripts/tests/cite-purity.test.js` for plugin
consumer-surface citations and `scripts/tests/report.test.js` for metrics-pipeline shape)
run on every `npm test` and catch the deterministic invariants that don't need an LLM.

---

## SMOKE-GREENFIELD

**Precondition.** A clean Claude Code session, with the orchestra plugin freshly installed:

```sh
mkdir -p /tmp/orchestra-smoke-greenfield && cd /tmp/orchestra-smoke-greenfield
git init
```

In the Claude session for that directory:

```
/plugin marketplace add hunghlh98/orchestra
/plugin install orchestra@orchestra-marketplace
```

**Driver prompt (intentless).**

```
/orchestra build a TODO API
```

**Expected interactive flow.**
1. Bootstrap detects empty repo → mode = greenfield (no AskUserQuestion needed).
2. AskUserQuestion: chain rigor (Full | Standard | Light). Answer **Standard**.
3. AskUserQuestion: language + framework (greenfield + intent doesn't pin one). Answer **Java + Spring Boot**.
4. `@lead` spawns; chain runs forward.

**Expected artifacts in `<project>/docs/`.**
| Layer | File(s) |
|---|---|
| Business | `001-PRD.md`, `001-FRS.md` |
| Architecture | (skipped — Standard rigor) |
| Component | `001-TDD.md` |
| Boundary | `001-API.openapi.yaml` |
| Implement | `<project>/src/main/java/...` (Spring controllers, services, entities) + `<project>/src/test/java/...` (unit + slice tests) |
| Verify | `001-TSR.md` (single file, both `§verdict-evaluator` and `§verdict-reviewer` anchors present) |

**Expected runtime artifacts in `<project>/.orchestra/`.**
- `local.yaml` with `mode: greenfield`, `bootstrap: completed`, `primary_language: java`
- `metrics/events.jsonl` — non-empty; every `task.subagent.invoked` carries `agent_role` + `phase`; every `subagent.stopped` carries `subagent_session_id` matching an `agent-<hex>` filename in the sibling subagents dir
- `metrics/tokens.jsonl` — exists; one row per spawned subagent; every row carries a real `agent_role` (lifted from `agent-<id>.meta.json` `agentType`) + `subagent_session_id` matching the sibling-dir filename. No `unknown` roles. Token totals are deduped by `message.id` (streaming dupes counted once).
- `metrics/insights.jsonl` — dispatcher-role rows expected when the `/orchestra` session ran in Explanatory output style; subagent-role rows are absent today (no `agents/*.md` instructs spawned agents to emit `★ Insight` blocks).
- `metrics/runs/<run-id>.json` — `status: completed` (not `aborted`); `agents_spawned` non-empty (matches the distinct `agent_role` values in `task.subagent.invoked`); `tokens` and `cost_usd` reflect parent + subagent contributions (was parent-only before the 2026-05-08 fix).

**Gate verdicts.** Both `S-EVAL-VERDICT-001` and `S-REV-VERDICT-001` blocks in `001-TSR.md` resolve to **PASS**.

**Cost cap.** ≤ v3.x greenfield baseline on equivalent layers (§8.bis: $121.90 was a Full-rigor *aborted* run; Standard greenfield should land well below this).

**Post-smoke checks.**
1. `npx orchestra-report` (or `node scripts/orchestra-report.js --metrics-dir <project>/.orchestra/metrics --out /tmp/report-greenfield`) → confirm `cost-by-role.json` and `cost-by-phase.json` are populated (no `unknown` rows).
2. §7.28 cite-purity grep on `<project>/src/**`:

```sh
denylist='(per |\()(PRD|FRS|SAD|ADR-?[0-9]*|TDD|CONTRACT|TSR) §'
denylist_ids='(FR|AC|C|NFR)-[0-9]+|S-[A-Z][A-Z-]*-[0-9]+'
grep -rE "$denylist" <project>/src/ && echo "FAIL §7.28: chain-anchor cite leaked into src/" || echo "OK §7.28 anchors"
grep -rE "$denylist_ids" <project>/src/ && echo "FAIL §7.28: symbolic IDs leaked into src/" || echo "OK §7.28 IDs"
```

Both `OK` lines = pass. v3.x baseline was 63 cites / 15 files / 833 LOC of leakage.

---

## SMOKE-BROWNFIELD

**Precondition.** Clone or copy a small existing Java/Spring project (e.g., a 3-5 file
TODO API) into a fresh temp dir, *do not commit changes*. Make sure
`<project>/src/main/java/` exists and `<project>/.orchestra/` does not.

```sh
cp -r /path/to/existing-todo-api /tmp/orchestra-smoke-brownfield && cd /tmp/orchestra-smoke-brownfield
```

In a Claude session for that directory:

```
/plugin marketplace add hunghlh98/orchestra
/plugin install orchestra@orchestra-marketplace
/orchestra add a "due-by" timestamp to the existing TODO endpoint
```

**Expected interactive flow.**
1. Bootstrap detects `src/main/java` → mode = brownfield (no AskUserQuestion).
2. AskUserQuestion: depth (light | medium | full). Answer **medium**.
3. AskUserQuestion: chain rigor. Answer **Standard**.
4. `@product` + `@architect` + `@lead` reverse-document at depth=medium → produce `001-PRD.md`, `001-FRS.md`, `001-TDD.md` describing the *current* code.
5. After reverse-doc green, `@lead` spawns the forward chain on the new feature ask.

**Expected artifacts.**
- Reverse-doc artifacts: `001-PRD.md`, `001-FRS.md`, `001-TDD.md` — describe the existing TODO API as it stands.
- Forward-chain artifacts: `002-PRD.md` … `002-TSR.md` — describe the new "due-by" feature.
- `<project>/.orchestra/local.yaml` has `mode: brownfield`, `bootstrap: completed`.

**Gate verdicts.** Reverse-doc TSR (if elected) and forward-feature TSR both PASS.

**Baseline.** v3.x had no brownfield mode. This run **is** the v4.0 brownfield baseline —
record cost, wall time, subagent count, and per-role split into a release note.

---

## What constitutes "GA-ready"

Both smokes complete with `status: completed`, both gate columns PASS, both §7.28 greps
return zero hits, both `npx orchestra-report` invocations show populated role+phase
pivots. Cost numbers go into the release note as the v4.0 baseline.
