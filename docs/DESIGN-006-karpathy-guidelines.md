---
id: DESIGN-006-karpathy-guidelines
title: orchestra v2.1.0 — Karpathy-Guidelines Skill Integration
created: 2026-05-06
status: implemented
revision: 1
scope: new consumer-surface skill `skills/karpathy-guidelines/`, tier-aware invocation across 5 of 8 agents, attribution placement, MINOR release via /release-plugin
references:
  upstream:
    - https://github.com/forrestchang/andrej-karpathy-skills
    - https://x.com/karpathy/status/2015883857489522876
  project:
    - CLAUDE.md (`/Users/lap16318/playwithclaude/orchestra/CLAUDE.md`) — load-bearing rules: "Update discipline — no annotation creep" and "Two surfaces, never mix them"
  brainstorm-decisions:
    - shape: B (one canonical skill + one-line agent invocations)
    - variant: adapted-per-tier (skip 3 agents)
    - scope: orchestra plugin only
    - semver: MINOR (2.0.0 → 2.1.0)
    - attribution: rewrite-and-attribute (no upstream LICENSE; no license claim in our frontmatter)
---

# orchestra v2.1.0 — Karpathy-Guidelines Skill Integration

> Output of `/sc:sc-brainstorm` → `/sc:sc-design` → `/sc:sc-implement`. Persists the rationale behind the v2.1.0 motion so a future reader can reconstruct *why* this shape, not just *what* shipped.

---

## 0. Why this exists

The user's personal global `CLAUDE.md` already adopts §1–4 of Karpathy's behavioral rules. The gap was that **orchestra consumers don't get this benefit unless we ship it inside the plugin**. v2.1.0 closes the gap by packaging the rules as a skill that orchestra agents invoke during artifact authoring and code editing.

## 1. The hard constraint that shaped the design

Project `CLAUDE.md` carries an explicit "no annotation creep" rule:

> If a load-bearing rule already lives elsewhere, trust it and do NOT re-state it inline... Each repetition is a tax on every consumer load AND leaks into model narration when explanatory style is on.

Inlining the same Karpathy block into 8 agent prompts is exactly the pattern that rule was written to prevent. The chosen shape — single skill + one-line invocation in 5 of 8 agents — is the minimum-creep way to deliver the value.

## 2. Tier-mapping decision

| Agent | Tier | Decision | Rationale |
|---|---|---|---|
| `@product` | T-B | invoke (rules 1, 4) | Confidence-tiered dialogue maps to "Think before authoring"; FRS acceptance criteria map to "Verifiable goals". |
| `@lead` | T-B | invoke (rules 1, 2, 4) | "Don't write CONTRACT criteria you can't probe" is *minimum surface* in orchestra terms; ADR triggers ARE the *tradeoffs* in rule 1. |
| `@backend` | T-C | invoke (full) | Implementer; rules were written for this audience. |
| `@frontend` | T-C | invoke (full) | Implementer; the 4-state rule (loading / empty / error / success) reinforces *verifiable goals*. |
| `@test` | T-C | invoke (rules 2, 3, 4) | `@test` doesn't dialogue — gaps go to ESCALATE, not AskUserQuestion; rule 1 omitted from the recommendation. |
| `@evaluator` | T-A | **skip** | Calibration anchor's `≥80% confidence → pending` semantic supersedes "ask if uncertain". `@evaluator` never edits — diff rules don't apply. |
| `@reviewer` | T-A | **skip** | `code-review` skill's severity rubric is the canonical site for review wisdom. "Never patch the diff" tier rule conflicts with rule 3's "remove orphans your changes created". |
| `@ship` | T-B | **skip** | Gate-driven release flow + `commit-work`'s "one coherent commit per logical feature" already encode *verifiable goals* and *minimum surface*. |

**Skip-3 over invoke-all-8** chosen because: adding the invocation to a tier whose own invariants conflict with the rules creates rule-against-rule noise inside the agent's prompt. Easier to add later than retract.

## 3. File-level changes

| File | Change | Net |
|---|---|---|
| `skills/karpathy-guidelines/SKILL.md` | NEW | +112 lines |
| `agents/product.md` | +1 skill bullet | +1 |
| `agents/lead.md` | +1 skill bullet | +1 |
| `agents/backend.md` | +1 skill bullet | +1 |
| `agents/frontend.md` | replace placeholder with real Skills block + 1 bullet; preserve deferral note | +3 |
| `agents/test.md` | +1 skill bullet | +1 |
| `agents/evaluator.md` | unchanged | 0 |
| `agents/reviewer.md` | unchanged | 0 |
| `agents/ship.md` | unchanged | 0 |
| `README.md` | NEW Acknowledgments section (3 entries: karpathy-guidelines, plantuml, c4-architecture) | +8 |
| `docs/DESIGN-006-karpathy-guidelines.md` | NEW (this file) | dev-trace |
| `CHANGELOG.md` | `## [2.1.0]` section under Unreleased (authored by `/release-plugin` after smoke green) | release-time |
| `VERSION` / `package.json` / `.claude-plugin/plugin.json` | atomic bump 2.0.0 → 2.1.0 via `scripts/bump-version.js` | release-time |

**Consumer-surface delta:** 1 new file, +7 lines across 5 agents. Zero changes to schemas, hooks, MCP servers, or `commands/orchestra.md`.

## 4. Skill body design (canonical-site discipline)

Single-file skill (no `references/`, no `scripts/`), mirroring the shape of `skills/code-review/SKILL.md`. Sections:

1. **Header + attribution** — origin line in frontmatter, prose attribution in body opening.
2. **Tradeoff** — one line: caution over speed; trivial mechanical edits skip.
3. **When to use** — orchestra-specific trigger points per tier.
4. **The four rules** — adapted in orchestra's vocabulary (CONTRACT criteria, AskUserQuestion, ESCALATE-`<id>`.md, scaffolded artifact spans, `<a id="S-...">` anchors). NOT verbatim copy of upstream.
5. **Tier-by-tier applicability table** — the 8 × 4 matrix the agents reference instead of restating per-agent emphasis. This is what keeps the canonical site single.
6. **Conflict resolution** — explicit precedence rules for collisions with calibration anchor / `code-review` / `rules/<lang>/coding-style.md`.
7. **Attribution footer** — Karpathy tweet URL + forrestchang repo URL.

The agent-side invocation is uniform across all 5 invoking agents:

```
- `karpathy-guidelines` — behavioral guidelines on assumptions, minimum surface, surgical edits, and verifiable goals. Apply during authoring; per-tier section emphasis is in the skill body.
```

Per-tier nuance lives **only** in the skill's applicability table, never duplicated into agent files.

## 5. Attribution & license

- **Frontmatter**: `origin: forrestchang/andrej-karpathy-skills (adapted; ideas attributed to Andrej Karpathy)`. **No `license:` field** — upstream repo carries `"license": null` at GitHub. Upstream's own `SKILL.md` declares `license: MIT` in frontmatter without a backing LICENSE file; we don't propagate that unverified claim.
- **In-skill prose**: opening + footer both cite Karpathy's tweet and forrestchang's repo.
- **CHANGELOG**: v2.1.0 entry will name the borrow under `### Added`.
- **README**: Acknowledgments section lists this alongside `plantuml` and `c4-architecture` for upstream-credit parity.

If forrestchang or Karpathy publishes a license clarification later, the skill's frontmatter is updated in a follow-up patch.

## 6. Release pipeline

Two-commit shape per `/release-plugin`:

1. **Pre-release housekeeping** (already landed): chore commit tracking `skills-lock.json` + `docs/sdlc_knowledge.md`. Keeps the v2.1.0 commits surgical.
2. **Feature commit**: `feat(skills): karpathy-guidelines + tier-aware invocation across 5 agents` — covers SKILL.md, 5 agent edits, README Acknowledgments, this design doc.
3. **Smoke chain** (interactive, user-driven): the 5-step consumer install loop. Required before CHANGELOG.
4. **Version bump commit** (authored by `/release-plugin`): `chore(v2.1.0): bump VERSION + author CHANGELOG` — atomic 3-file version update via `scripts/bump-version.js`, plus moving Unreleased content to a dated section.
5. **Manual tag + push** (user-driven): outside the command's scope.

## 7. Validation plan

**Automated** (run before feature commit):
- `npm test` — all 12 suites green. Particular interest: `test-agents.js` (frontmatter + structure) and `validate.js` (skill discoverability).
- `bash scripts/test-streamline-fixture.sh` — `fixture smoke: PASS`.

**Interactive** (user-driven, before CHANGELOG):
1. `claude plugin validate .`
2. `/plugin marketplace add /absolute/path/to/clone`
3. `/plugin install orchestra@<marketplace-name>`
4. `/orchestra help` — surface loads
5. `git init` throwaway dir + `/orchestra <intent>` — bootstrap; spawn `@backend`; confirm `karpathy-guidelines` appears in the agent's Skills block and is invokable.

## 8. Risks & follow-ups

- **License clarification**: if upstream adds an explicit license, our frontmatter and CHANGELOG attribution should be updated in a follow-up patch.
- **Token budget**: v2.0.0 streamline brought mean `agents/*.md` from 785 → ~660 words (-16%). v2.1.0's +1 line per agent costs ~10 words across 5 agents — well within budget but worth re-measuring during the next streamline pass.
- **Stale README status line**: `> **Status:** v1.0.0 released 2026-05-03.` at the bottom of README.md is unrelated to v2.1.0. Out of scope for this release; flag for the next docs touch.
- **Future deferred FE skill**: `agents/frontend.md` still references `frontend-component-patterns` as deferred. v2.1.0 doesn't ship it; that remains a future motion.

## 9. Decision log

| Q | Decision | Date |
|---|---|---|
| Distribution shape | B — single skill + one-line invocation | 2026-05-06 |
| Variant | adapted-per-tier (skip 3) | 2026-05-06 |
| Scope | orchestra plugin only | 2026-05-06 |
| SemVer | MINOR (2.0.0 → 2.1.0) | 2026-05-06 |
| Attribution | rewrite-and-attribute, no license claim | 2026-05-06 |
| README Acknowledgments | yes, alongside plantuml + c4-architecture | 2026-05-06 |
| Untracked-files handling | commit as separate chore commit before v2.1.0 work | 2026-05-06 |
| Design doc persistence | yes, `docs/DESIGN-006-karpathy-guidelines.md` | 2026-05-06 |
