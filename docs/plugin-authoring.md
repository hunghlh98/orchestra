# Plugin Authoring Guide

Synthesised from the `claude-ecosystem` plugin source
(`/Users/lap16318/work/play-with-claude/claude-code-plugins/plugins/claude-ecosystem`).

Six component types — **manifest, agents, skills, commands, hooks, output-styles** —
plus three repo-level artefacts — **rules, CLAUDE.md, tests** — together form a
comprehensive assistant plugin. This guide is the rule set for building one.

The rules are declarative and numbered. R1–R8 cover one component each.
R9–R14 are cross-cutting.

---

## The shape

A plugin that uses every component class lays out like this:

```
my-plugin/
├── .claude-plugin/
│   └── plugin.json                    # manifest (R1)
├── README.md                          # consumer-facing overview
├── CHANGELOG.md                       # commit-derived release log
├── CLAUDE.md                          # MAINTAINER memory (R8) — does not ship to consumers
├── agents/                            # R2 — workflow coordinators
│   └── <agent-name>.md
├── skills/                            # R3 — knowledge stores + nav hubs
│   └── <skill-name>/
│       ├── SKILL.md
│       ├── references/                # loaded on demand
│       ├── scripts/                   # not loaded into context
│       └── assets/                    # templates written verbatim
├── commands/                          # R4 — explicit slash commands with args
│   └── <command>.md
├── hooks/                             # R5 — harness-enforced automation
│   ├── hooks.json
│   └── <hook-name>/
│       ├── README.md
│       ├── <runtime>/                 # .sh, .py, .ts, .cs, .js
│       └── tests/
├── output-styles/                     # R6 — response-shape personas
│   └── <style>.md
├── rules/                             # R7 — always-on instructions
│   └── <topic>.md
└── scripts/                           # plugin-internal tooling
    └── tests/                         # plugin-level test runner
```

Not every plugin needs every component. Build only what your problem demands.

---

## The architecture (the central insight)

The claude-ecosystem plugin is structured in three concentric layers:

```
            ╭─────────── ORCHESTRATION ───────────╮
            │  agents (workflow coordinators)     │
            │      ↓ invoke                       │
            ╰──────┬──────────────────────────────╯
                   ↓
            ╭─────────── NAVIGATION ──────────────╮
            │  skills (keyword + decision-tree    │
            │           wrappers)                 │
            │      ↓ delegate                     │
            ╰──────┬──────────────────────────────╯
                   ↓
            ╭─────────── KNOWLEDGE ───────────────╮
            │  ONE canonical skill (docs-mgmt)    │
            │  holds authoritative content        │
            ╰─────────────────────────────────────╯
```

- The **knowledge layer** is one skill. In claude-ecosystem it is
  `skills/docs-management/`. Every fact lives here.
- The **navigation layer** is every other skill. They publish trigger
  keywords and decision trees and quote nothing — they delegate to the
  knowledge layer.
- The **orchestration layer** is the agents. They run workflows and
  produce reports; they do not store facts. When they need facts they
  invoke a skill listed in their `skills:` frontmatter.

This is the rule that pays for itself fastest. Without it, every doc
change requires touching N skills, audits drift, and consumers see
contradictions. With it, you update one place.

---

## R1 — Manifest (`.claude-plugin/plugin.json`)

Required fields:

```json
{
  "name": "my-plugin",
  "description": "...",
  "version": "1.0.0",
  "author": { "name": "...", "url": "https://..." },
  "license": "MIT"
}
```

Recommended fields:

- `repository`, `homepage`
- `keywords` — the array a marketplace search hits. Include user nouns
  AND trigger terms. Be generous; 20–40 entries is normal.
- `outputStyles: "./output-styles"` if you ship output styles. **Required**
  for the styles to be discovered; this field cannot be inferred.

Auto-discovered (no pointer needed): `agents/`, `commands/`, `hooks/`,
`skills/`, `rules/`.

**Rule:** the description is the second thing a user reads after the
name. Lead with the value proposition; list the component classes you
ship; close with the standout capability. Sentence-fragment style is
fine.

---

## R2 — Agents (`agents/*.md`)

Frontmatter — **required**:

```yaml
---
name: skill-auditor
description: "Use this agent when ..."
---
```

### Description shape

`description` has ONE job: tell Claude's auto-router and a human
agent picker **when to pick this agent**. Not a feature list, not a
coupling diagram, not a behavioral spec.

- **Lead with a trigger verb.** `Use this agent when …`, `Use when …`,
  or `PROACTIVELY use when …`. Claude reads this to decide auto-spawn.
- **Length: 120–300 chars (~20–40 words).** A 144-agent community
  sample reports min 117, max 417, avg ~220.
- **Shape:** trigger verb + primary scenario + (optional)
  `Invoke when X, Y, Z` expansion for secondary triggers.

Forbidden in `description:`:

- Output inventory (`Authors SAD, ADRs, BR-AC…`) — belongs in body
  workflow and README component table.
- Behavioral rules (`Always opens with X question`) — body only.
- Coupling info (`Spawned by dispatcher after gate-3`,
  `Paired with @other-agent`) — body only; pollutes routing surface
  and excludes free-form spawn paths.
- Tool / permission claims (`No Bash`, `src/ never read`) —
  frontmatter is the source of truth.
- Version stamps.

Wrong (output inventory + dispatcher coupling):

```yaml
description: Architecture + per-feature design owner. Authors SAD, ADRs, BR-AC, C4 L1+L2+L3+L4, per-feature TDD, openapi/asyncapi/clientapi. Spawned by dispatcher.
```

Right (trigger + scenario):

```yaml
description: "Use this agent when authoring system architecture (SAD, ADRs, C4 diagrams), per-feature design (TDD, openapi/asyncapi/clientapi), or deriving architecture from existing source."
```

### Frontmatter — recommended

- `tools:` — **explicit allow-list**, comma-separated. Name every MCP
  tool by its exact qualified name (`mcp__perplexity__search`).
  **Never use `*`** in agents you ship; the source plugin only allows
  `*` on its catch-all coordinator agent.
- `disallowedTools:` is valid spec but **deny-lists are forbidden
  here**. They leave the surface implicit and drift silently when
  Claude Code adds new built-in tools.
- `model:` — `opus` | `sonnet` | `haiku`. Pick by reasoning need vs
  cost. Auditors usually `opus`; lookup helpers `haiku`.
- `color:` — visual differentiation in the picker.
- `permissionMode:` — `plan` for auditors and analysts (read, do not
  write).
- `skills:` — skills auto-loaded into the agent's startup context.
  **This is how you wire delegation.**

Tool allow-list by role:

| Role | Allow-list |
|---|---|
| read-only reviewer / auditor | `Read, Grep, Glob, Skill` |
| research | `Read, Grep, Glob, WebFetch, WebSearch, Skill` |
| spec / doc author | `Read, Write, Glob, Grep, Skill, AskUserQuestion` |
| implementer | `Read, Write, Edit, MultiEdit, Glob, Grep, Skill` |
| test runner (needs execution) | `Read, Write, Edit, MultiEdit, Glob, Grep, Bash, Skill` |

### Custom frontmatter fields — permitted only when CI-gated

Only fields documented in the current Claude Code agent spec are
honored at runtime. Custom fields (e.g. `context_mode:`, `tier:`,
`phase:`) are **silently ignored by the host harness** — they look
authoritative but do nothing at run time.

Custom fields are **permitted** when ALL three hold:

1. A CI validator in the plugin's own `scripts/tests/` enforces field
   shape and value-consistency against a manifest.
2. The field's purpose is documented in the maintainer `CLAUDE.md`.
3. Readers cannot confuse the field for a runtime knob — i.e., it
   pairs with a spec field whose values it constrains, not a
   standalone behavior switch.

Canonical example: orchestra's `context_mode: default | 1m`. CI check 6
in `scripts/tests/agents.test.js` requires the value to live in
`manifests/known-models.json.<model>.supportsContextMode`. The field
declares intent (this agent needs the 1M-context variant of the model
named in `model:`) and gates which `model:` pairings are valid. The
host harness ignores the field; CI prevents the inconsistency that
would otherwise drift.

**Forbidden** when ungated: a `context_mode: 1m` line on an agent in a
plugin with no CI validator. Looks authoritative; does nothing.
Encode the intent in body prose instead.

Drift hazards an ungated custom field carries:

- Reader assumes the field shapes runtime behavior.
- Field claims one thing (`context_mode: 1m`); runtime delivers
  whatever the host selects.
- Speculative cleanup during unrelated renames silently drops the
  field; nothing fails.

### Body shape

1. **Purpose.** One declarative: "You are `@name`. [What you do.]"
2. **CRITICAL: Single Source of Truth Pattern.** Name the skill this
   agent delegates to; restate "do NOT hardcode logic — invoke the
   skill". Skipping this block is the #1 cause of drift. Omit only
   when the agent has zero canonical skill (rare).
3. **Numbered Workflow (5–8 steps).** Step `0` is `PLAN` per the
   host plugin's plan discipline, if used.
4. **Scoring rubric / report template,** if the agent generates one.
5. **One worked `<example>` block** at the foot. Two if forward /
   reverse paths differ materially.

### Forbidden: body anti-patterns

- **Frontmatter-restatement tables**
  (`## Setup → ### Valid field values | Field | Value | Rationale |`).
  DRY violation: change frontmatter → table drifts. Frontmatter is
  the source of truth. If rationale matters, encode it in the
  maintainer CLAUDE.md, not the agent body.
- **Hook-path cites in prose**
  (`hooks/scripts/val-calibration.js autonomy tier`). The agent
  shouldn't know which hook implements which behavior. Reference the
  *behavior* (`the calibration anchor injected into your prompt`),
  not the script path.
- **Inline restatements** of constraints already enforced by hooks or
  schemas. Trust the gate; do not narrate it.

### Rules

- **R2.1** — Agents coordinate, skills know. If you find yourself
  writing rules in an agent that already live in a skill, fold them
  up to the skill and reference it.
- **R2.2** — Agents that fan out to multiple MCP servers MUST include
  a **validation protocol**: which server to query first, which to
  cross-check, what to do when none answer. See claude-ecosystem's
  `skill-auditor.md` for the canonical shape.
- **R2.3** — One agent, one job. **Hard limit ≤2 workflow trees per
  agent file.** N distinct trees (reverse-pass + forward-chain +
  source-walk + DIV resolution in one agent) is an anti-pattern;
  split into smaller agents and let a coordinator route.
- **R2.4** — Description is routing surface; body is specification.
  A fact belongs to one surface, not both. Description leaks into
  body = harmless verbosity; body leaks into description = blocks
  free-form spawn and pollutes auto-routing.
- **R2.5** — Frontmatter is the truth for fields it defines. Body
  restatement tables (`### Valid field values`) are forbidden — they
  drift the moment frontmatter changes.
- **R2.6** — Reference behaviors by name in prose, never by
  implementing path. The implementing tier may change without
  touching every agent.

---

## R3 — Skills (`skills/<name>/SKILL.md`)

Two flavours:

| Flavour | Frontmatter | Invocation |
| --- | --- | --- |
| **Meta-skill** (auto-trigger) | `user-invocable: false` | Claude loads it when prompt matches the `description` keywords |
| **User-invocable skill** | `user-invocable: true` (or omit — default is true for plugin skills) | `/plugin-name:skill-name` from the user |

Since Claude Code v2.1.3+, slash commands and user-invocable skills are
unified — both flow through the Skill tool. Reach for `commands/` only
when you need the affordances skills don't have (R4).

Frontmatter — **required**:

```yaml
---
name: skill-development
description: Comprehensive meta-skill for creating, managing, validating ... Use when creating new skills, validating existing skills, ...
user-invocable: false
allowed-tools: Read, Glob, Grep, Skill
---
```

- `description` is **the trigger surface**. Pack it with every
  synonym, keyword, and "Use when X" phrase a user might type. Up to
  ~1024 chars. This is the single biggest discoverability lever.
- `allowed-tools` — restrict aggressively. If the skill only reads
  docs, give it `Read, Glob, Grep, Skill` and nothing else.

Body shape:

1. **🚨 MANDATORY delegation block** (only if the skill teaches about
   Claude Code itself). Pattern:
   > STOP — before responding, invoke `docs-management` and base your
   > answer on its content.
2. Overview (2–3 sentences).
3. "When to Use" bullet list mirroring the description keywords.
4. Quick Decision Tree (numbered options → reference file links).
5. References section. **Every** linked file gets a "Load when…"
   condition so progressive disclosure works.

Directory:

```
skills/<name>/
├── SKILL.md         # navigation hub — target <500 lines
├── references/      # leaves, loaded on demand by the decision tree
├── scripts/         # executable helpers; never loaded into context
└── assets/          # templates the skill writes verbatim
```

Rules:

- **R3.1** — The 500-line SKILL.md guideline is a token budget, not a
  hard cap. If you exceed it, push content into `references/`.
- **R3.2** — Never duplicate content already in the canonical
  knowledge skill. Link to it.
- **R3.3** — `references/<file>.md` must be loadable in isolation —
  someone reading just that file should understand it without
  SKILL.md context.

---

## R4 — Commands (`commands/*.md`)

User-invocable skills (R3) are the preferred path and what the source
plugin uses exclusively. Use `commands/` only when you need affordances
skills don't expose:

- `$ARGUMENTS`, `$1`, `$2` positional/named arg interpolation.
- Pre-execution `bash` blocks via the `!` prefix.
- File references via `@path/to/file`.
- An `argument-hint` shown in the autocomplete.

Frontmatter:

```yaml
---
description: Short help text shown in /command picker
argument-hint: <pipeline-id>
allowed-tools: Read, Edit, Bash
---
```

Body is the prompt template. Use `$ARGUMENTS` to interpolate the
user's args. Wrap any embedded bash in `!` blocks; reference files
with `@path`.

Rules:

- **R4.1** — A command body is a prompt, not code. Write what Claude
  should DO, not what Claude should EXPLAIN.
- **R4.2** — `allowed-tools` is the same security knob as in skills.
  Default deny, allow what you need.
- **R4.3** — If the command is more than a thin arg-passing wrapper
  around a skill, you have a skill, not a command.

---

## R5 — Hooks (`hooks/hooks.json` + `hooks/<name>/`)

`hooks/hooks.json` is the single configuration file. Shape:

```json
{
  "description": "...",
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Write|Edit",
        "hooks": [
          {
            "type": "command",
            "command": "bash \"${CLAUDE_PLUGIN_ROOT}/hooks/prevent-backup-files/run.sh\"",
            "timeout": 10
          }
        ]
      }
    ],
    "SessionStart": [ { "hooks": [ ... ] } ]
  }
}
```

Events: `PreToolUse`, `PostToolUse`, `UserPromptSubmit`,
`SessionStart`, `SessionEnd`, `Stop`, `SubagentStop`, `PreCompact`,
`Notification`.

Per-hook directory:

```
hooks/<hook-name>/
├── README.md         # what it does, exit codes, expected JSON shape
├── <runtime>/        # impl — .sh, .py, .ts, .js, .cs, ...
└── tests/            # unit tests
```

Rules:

- **R5.1** — Reference impl paths via `${CLAUDE_PLUGIN_ROOT}` — never
  assume cwd. Every command string in hooks.json must use it.
- **R5.2** — Hooks read JSON on stdin and signal via exit code (0 =
  allow, 2 = block-with-stderr-as-feedback) or stdout JSON. Pick one
  convention per hook and document it in README.md.
- **R5.3** — Keep hooks deterministic and fast. The 10 s timeout
  shown above is the source plugin's default; bigger means you have a
  job, not a hook.
- **R5.4** — Hooks that mutate user state (writes, network calls, env
  changes) MUST be loud in README.md. Silent mutation is the worst
  failure mode.
- **R5.5** — Static data a hook reads at runtime MUST live under a
  shipping directory (`hooks/`, `skills/`, `agents/`, `schemas/`,
  `commands/`). Never under `scripts/` — `scripts/` is build-time
  tooling and is not guaranteed to land on the consumer's machine.

---

## R6 — Output styles (`output-styles/*.md`)

Personas that swap Claude's response shape across a whole session.
The claude-ecosystem source ships **nine** of them — treat
output-styles as a first-class surface of a comprehensive plugin, not
an afterthought.

The shipped styles cluster into two flavours:

| Flavour | Examples (claude-ecosystem) | Body posture |
| --- | --- | --- |
| **Code-oriented** | `plugin-developer`, `skill-author`, `code-reviewer`, `plugin-auditor`, `technical-writer`, `concise-coder`, `structured-output` | Reshape HOW Claude writes / reviews / formats code |
| **Dialogue / teaching** | `pure-teacher`, `socratic-mentor` | Reshape Claude's *epistemic stance* — questions before answers, no rescue-coding |

Frontmatter:

```yaml
---
name: Skill Author
description: Specialized mode for crafting Claude Code skills with proper delegation and progressive disclosure
keep-coding-instructions: true
---
```

- `name:` — display name shown in the picker (Title Case is fine).
- `description:` — one-line summary shown in the picker.
- `keep-coding-instructions:` — retains the host's hard coding rules
  while the persona is active. Default to `true` for any style that
  might still write code. The dialogue/teaching styles in the source
  **also** set this to `true` — they suppress code generation via
  body rules, not by dropping the coding scaffolding. Dropping the
  flag unloads ALL coding context and is too blunt for behavioural
  suppression.

Body shape — the source plugin's house pattern (apply in this order):

1. **Persona statement.** "You are an X focused on Y."
2. **Style Switching Protocol** (subsection). Script what Claude says
   when **entering** AND when **leaving** the style. Example from
   `pure-teacher.md`:
   - On entry: *"Switching to teaching mode — I'll guide you to
     discover the answer yourself."*
   - On exit: *"Now that you understand X, here's the complete
     solution…"*
3. **Core Behaviors** (code-oriented) or **Core Philosophy**
   (dialogue) — numbered list of what this persona DOES and (when
   relevant) DOES NOT do.
4. **Response Framework / Scaffolding Levels** — the per-turn loop
   the persona follows.
5. **When to Use** comparison table that cross-references **other
   styles** by name with provenance:
   - Built-in Claude Code styles tagged `(built-in)`
   - Plugin-shipped styles tagged `(plugin)`
   - Followed by the note: *"Styles marked (built-in) are official
     Claude Code styles. Styles marked (plugin) are provided by the
     <plugin-name> plugin."*
6. **Switch to / Switch away** one-liners summarising the trigger
   and exit conditions.
7. **Anti-Patterns** or **Troubleshooting** table at the foot —
   "Avoid X / Why" or "Issue / Solution".

Rules:

- **R6.1** — `plugin.json` MUST include
  `"outputStyles": "./output-styles"`. Output styles are the one
  component class that is NOT auto-discovered.
- **R6.2** — Every style's "When to Use" table MUST name the **other
  plugin styles** it's adjacent to. Without cross-references, users
  pick blindly and your styles cannibalise each other's discovery.
- **R6.3** — Use the `(built-in)` / `(plugin)` provenance tag
  consistently across every style file. It keeps users oriented when
  comparing against the built-in Default and Explanatory styles.
- **R6.4** — Behaviour-suppression styles (e.g. "never write code")
  MUST encode the suppression in the **body**, not by dropping
  `keep-coding-instructions`. The flag is for unloading scaffolding,
  not for shaping behaviour.
- **R6.5** — Put anti-patterns in a **table at the foot**, not
  sprinkled through the body as inline "DO NOT" lines. The table is
  the source's house convention and keeps the persona prose clean.
- **R6.6** — Cover the **plugin's own surface** with styles. The
  claude-ecosystem set is a good template: one style per major
  authoring task the plugin teaches (skills, plugins, code review,
  auditing, documentation) plus one or two general-purpose styles
  (concise, structured) plus dialogue styles for teaching modes.

---

## R7 — Rules (`rules/*.md`)

A rule file is an always-loaded instruction the host project imports
into its CLAUDE.md. Rules differ from skills:

| | Skill | Rule |
| --- | --- | --- |
| Load timing | On trigger (description keywords) | Every turn |
| Content scope | Knowledge + workflow | One enforceable constraint |
| Size budget | Up to 500-line SKILL.md + references | Under 100 lines |
| Authority | "Here is how to do X" | "X is required / forbidden" |

Each rule file:

- One topic per file. `rules/no-mocks-in-integration-tests.md` not
  `rules/testing.md`.
- States the rule, the *why* (so edge cases can be judged), the
  application boundary (which directories / file types).
- Stays small — the cost of a rule is paid on every turn.

Host CLAUDE.md imports via `@rules/<topic>.md`.

**Rule:** if you can't justify a rule's tax on every conversation,
make it a skill instead.

---

## R8 — CLAUDE.md (maintainer's, not consumer's)

The plugin's OWN repo can host a top-level `CLAUDE.md`. This file:

- **Never ships to consumers.** It lives at repo root, outside
  `agents/ skills/ commands/ hooks/ rules/`. None of those directories
  are the right home.
- Governs how *maintainers* edit the plugin: conventions, traps,
  surface-vs-developer-surface boundaries, version bump discipline.
- Pairs with auto-memory (`~/.claude/projects/.../memory/MEMORY.md`)
  for session-learned lessons.

Use CLAUDE.md to encode rules **about authoring the plugin** that
would otherwise be relearned every session. Examples of good entries:

- "Consumer surface MUST NOT cite developer-surface docs by anchor."
- "Version bumps go through `scripts/bump-version.js` — never hand-edit."
- "Default to PATCH bumps unless explicitly told otherwise."

---

## Cross-cutting rules

### R9 — Single source of truth

Pick ONE skill to hold canonical content. Every other skill, agent,
hook, and command quotes it via delegation rather than restating its
rules. The source plugin uses `docs-management`. Without this rule,
your plugin's content drifts the moment any underlying source updates.

### R10 — Progressive disclosure

Load nothing you don't need.

- `SKILL.md` is a navigation hub. `references/*` are leaves.
- Agents inherit only the skills listed in their `skills:` frontmatter.
- Hooks load nothing into context — they run as separate processes.
- Rules tax every turn — keep them short, keep them few.

### R11 — Choosing the right component

| Need | Use |
| --- | --- |
| Teach Claude about a topic | **skill** |
| Let the user invoke with args | **command** (or user-invocable skill) |
| Run a workflow with its own context window and tool set | **agent** |
| Have the harness enforce or augment automatically | **hook** |
| Change the response shape globally | **output-style** |
| Constrain every turn | **rule** |
| Govern maintainers of the plugin itself | **CLAUDE.md** |

### R12 — Naming

- Component names match directory names exactly.
- Plugin-namespaced commands appear as `/<plugin>:<command>` — keep
  both halves kebab-case.
- Avoid abbreviations. `description` is the trigger surface; the
  `name` field should still be human-readable.

### R13 — Tests live next to the thing they test

- `hooks/<name>/tests/`
- `skills/<name>/tests/` when the skill has executable scripts
- Plugin-level test runner sits at `scripts/tests/`
- CI invokes the runner; never call test framework binaries directly
  from inside hooks.

### R14 — Versioning

- `version` in `plugin.json` is the source of truth.
- Bump via a script that touches every place the version is written
  (manifest + package metadata + any embedded constants). Never edit
  by hand.
- Default to PATCH.
- CHANGELOG is derived from the commit log, not hand-written. Group by
  Conventional Commits type (`feat` → Added, `fix` → Fixed, `refactor`
  → Changed, `!` / `BREAKING CHANGE:` → Breaking).

---

## Component interaction (typical comprehensive plugin)

```
                +----------------------+
   User prompt →| hooks (auto)         |  inject context, validate edits
                +----------+-----------+
                           ↓
                +----------------------+
                | output-style         |  shapes the response
                +----------+-----------+
                           ↓
                +----------------------+
                | rules (always-on)    |  hard constraints
                +----------+-----------+
                           ↓
                +----------------------+
                | skill (on trigger)   |  navigates, references
                +----------+-----------+
                           ↓
                +----------------------+
                | canonical knowledge  |  authoritative content
                | skill (docs-mgmt)    |
                +----------------------+

  /command   →  invokes a user-invocable skill or a commands/ file
  agent      →  spawned by Claude or via Task tool; carries its own
                skills list and tool allow-list
```

---

## Pre-ship checklist

- [ ] `plugin.json` has all required fields and accurate keywords.
- [ ] `outputStyles` field is present if you ship styles.
- [ ] Every skill's `description` is loaded with trigger keywords and
      "Use when X" phrases.
- [ ] Every agent's `tools:` list is explicit (no wildcards in
      shipping agents).
- [ ] Every hook references files via `${CLAUDE_PLUGIN_ROOT}`.
- [ ] One skill is designated as the canonical knowledge store; no
      skill or agent duplicates its content.
- [ ] Every reference file has a "Load when…" condition.
- [ ] Every hook has a README.md documenting exit codes and JSON
      contract.
- [ ] Rules are under 100 lines each and each carries a stated *why*.
- [ ] Maintainer `CLAUDE.md` lives at repo root, not inside any
      component directory.
- [ ] README maps every component a consumer will see.
- [ ] CHANGELOG records the release; version was bumped via script.

---

## /orchestra dispatch strategy contract

Locked enumeration of every execution path `/orchestra` dispatches. Anchored to
four entry shapes (`empty`, `spec-to-code`, `code-to-spec`, `<intent>`),
disambiguated by `docs/` and `src/**` preconditions, and resolved by three
locked decisions at the end of this section.

Nine strategies (S1–S9). Three orthogonal axes determine routing:

1. **Entry shape** — what the user types.
2. **`docs/` state** — empty, partial-locked one feature, full-locked one feature, locked N features.
3. **`src/**` state** — empty vs. present.

### Strategies

#### S1 — Empty invocation

- **Entry:** `/orchestra`
- **Preconditions:** —
- **Path:** Emit usage block. No chain. No agent spawn.

#### S2 — Greenfield author-from-scratch

- **Entry:** `/orchestra spec-to-code`
- **Preconditions:** `docs/<feature-id>/` empty. `src/**` empty.
- **Path:** Full forward chain.
  `@product` → `@architect` → `@lead` → implementer fan-out (`@backend` ‖ `@frontend` ‖ `@test-author`) → TSR convergence (`@test-runner` + `@evaluator` + `@reviewer`).

#### S3 — Single-feature resume

- **Entry:** `/orchestra spec-to-code`
- **Preconditions:** Locked artifacts for one feature in `docs/<feature-id>/`
  AND partial impl present in `src/**` for that feature OR partial-locked
  authoring layers.
- **Path:** Validate frontmatter (trust `status: locked` + `subagent_session_id`
  as-is — no re-validation against current `system.yaml`). Resume at first
  unlocked authoring layer OR first missing implementer artifact.
  Single-feature fan-out → TSR.

#### S4 — Multi-feature batch from locked docs

- **Entry:** `/orchestra spec-to-code`
- **Preconditions:** Locked artifacts for N feature-ids in `docs/`
  AND `src/**` empty.
- **Path:** Enumerate every locked `<feature-id>/` under `docs/`. Spawn N
  implementer fan-outs in one message (parallel-all). One TSR per feature.
  `clientapi.yaml` topo-sort is irrelevant at fan-out — preconditions
  guarantee every upstream contract is locked.

#### S5 — Reverse chain, auto-detected scope

- **Entry:** `/orchestra code-to-spec`
- **Preconditions:** `src/**` exists. No second token.
- **Path:** Reverse chain with scope inferred from `workspace_kind` in
  `.orchestra/system.yaml`. Single-repo workspace → per-service scope;
  multi-repo workspace → system-wide scope.

#### S6 — Reverse chain, forced system-wide

- **Entry:** `/orchestra code-to-spec system`
- **Preconditions:** Multi-repo workspace.
- **Path:** Reverse forced to `scope_level: system-wide`. Authors `SAD.md`,
  ADRs, `business-invariants.md`, and per-service BR-AC.

#### S7 — Reverse chain, forced per-service

- **Entry:** `/orchestra code-to-spec service:<name> --source=<path>`
- **Preconditions:** Scope pinned to one service. `--source=<path>` is REQUIRED.
- **Path:** Reverse forced to `scope_level: per-service`. Skips architecture
  layer (SAD / ADRs / business-invariants). Persists `source_path` to
  `local.yaml`.

#### S8 — Router, greenfield branch

- **Entry:** `/orchestra <intent>`
- **Preconditions:** Freeform intent. `src/**` empty (greenfield detected).
- **Path:**
  1. 3× `AskUserQuestion` upfront (restate-intent / scope / constraints).
  2. Route to S2, S3, or S4 based on `docs/` state.

#### S9 — Router, brownfield branch

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

### Decision matrix

| `docs/` state | `src/**` state | Strategy (explicit / via router) |
|---|---|---|
| Empty | Empty | S2 / S8 |
| Empty | Present | S5–S7 / S9 |
| Locked, one feature, partial layers | Empty | S3 |
| Locked, one feature, full | Empty | S4 (N=1) |
| Locked, one feature | Partial impl | S3 |
| Locked, N features | Empty | S4 |
| Locked, N features | Partial | Out of scope. Undefined. |

### Locked decisions

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

### Principled asymmetries

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

### Out-of-scope quadrant

`docs/` locked for N features + `src/**` partial impl is not a defined
strategy. It conflates S3 (resume per-feature) and S4 (batch enumerate); the
ambiguity is which features in `docs/` correspond to which partial state in
`src/**`. Resolution deferred to a future brief if the case surfaces in
practice.
