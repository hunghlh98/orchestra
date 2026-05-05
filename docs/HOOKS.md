# orchestra Plugin Hooks (developer reference)

> Plugin-maintainer documentation. Audience: contributors editing `hooks/scripts/*.js` or `hooks/hooks.json`. **NOT loaded into runtime context** — `commands/orchestra.md` carries a 5-row glossary that the model uses at runtime; full prose lives here so consumer-surface stays lean.
>
> Per CLAUDE.md the `## Invariants` block at the top of `commands/orchestra.md` is the load-bearing rule for the model: *"hooks own their events and side effects; do not replicate."* This doc explains *what* each hook does — the model doesn't need that detail to behave correctly.

---

## metrics-collector

The plugin's observability backbone. Two registrations in `hooks/hooks.json`; one script (`hooks/scripts/metrics-collector.js`) handles all matchers.

### Registration 1 — UserPromptSubmit

Fires the moment the user submits a prompt to Claude Code. The hook checks whether the prompt begins with `/orchestra` (matched against the plugin's command surface). On match, it emits:

```jsonl
{"ts":"...","run_id":"...","event":"prompt.submitted","matched_orchestra":true}
```

This event lands in `<cwd>/.claude/.orchestra/metrics/events.jsonl`. The privacy posture (`redact_prompts:true` by default in `metrics/manifest.json`) means raw prompt text is **not** captured — only the match flag.

### Registration 2 — Lifecycle events (PreToolUse + SubagentStop + Stop)

Matchers (combined): `PreToolUse:Task|Agent | PreToolUse:TeamCreate | PreToolUse:TeamDelete | PreToolUse:Skill | PreToolUse:Write|Edit|MultiEdit | PreToolUse:mcp__orchestra-* | SubagentStop | Stop`.

Emitted event types:

| Event | Triggered by | Enrichments |
|---|---|---|
| `task.subagent.invoked` | `PreToolUse:Task\|Agent` | `agent_name`, `team_name`, `prompt_summary` |
| `team.created` | `PreToolUse:TeamCreate` | `team_name`, `agent_type`, `description` |
| `team.shutdown` | `PreToolUse:TeamDelete` | `ts`, `run_id` (zero-param primitive — nothing to lift from `tool_input`) |
| `skill.invoked` | `PreToolUse:Skill` | `skill_name`, `args_summary` |
| `local.bootstrapped` | `PreToolUse:Write` matching `local.yaml` | path |
| `artifact.written` | `PreToolUse:Write\|Edit\|MultiEdit` matching `<project>/.claude/.orchestra/pipeline/**` | `feature_id`, `artifact_type`, `file_name`. Special enrichments: `intent.yaml` writes lift `intent` / `confidence` / `pattern`; `SUMMARY-*.md` writes lift `team_name` / `terminal_state` / `duration_seconds` |
| `mcp.tool.called` | `PreToolUse:mcp__orchestra-*` | tool name + args summary |
| `subagent.stopped` | `SubagentStop` | run_id |
| `session.stopped` | `Stop` | run_id |

**Goal:** `events.jsonl` alone reconstructs the full smoke trace; no need to read Claude Code's session jsonl to debug a run.

**Observability invariant:** This hook is the only writer to `events.jsonl`. The dispatcher MUST NOT write directly to events.jsonl — that's a violation of the `## Invariants` contract.

---

## hash-stamper

Matchers: `PreToolUse:Write|Edit|MultiEdit`.

Walks the artifact frontmatter when writing under `<project>/.claude/.orchestra/**/*.md`. Two operations:

1. **Stamp `sections:` hashes.** For each key in the `sections:` dict, compute a content hash from the body section anchored by `<a id="<key>"></a>` and write it back to the frontmatter. Hashes are computed with the project's `hashes.algo` (default `sha256`) and stored as `sections.<KEY>.hash`.
2. **Resolve `references[].hash-at-write: TBD`.** When an artifact references another artifact (e.g., a CONTRACT references its upstream PRD), the `hash-at-write` field captures the upstream's section hash *at the moment of write*. The hook resolves any `TBD` value to the actual hash.

**Subagent-write caveat:** Hooks attach to the parent context's tool calls; subagent writes may bypass this hook. That's why agents author `sections:` and `references:` blocks explicitly per `schemas/pipeline-artifact.schema.md` — the schema is the source of truth even if the hook isn't fired on every write.

---

## pre-write-check

Matchers: `PreToolUse:Write|Edit|MultiEdit`.

Pattern-based secret detector. On any write, scans the `tool_input.content` against 8 patterns:

- AWS access key (`AKIA[0-9A-Z]{16}`)
- AWS secret access key (40-char base64-ish)
- GitHub Personal Access Token (`ghp_[0-9a-zA-Z]{36}`, `gho_*`, `ghu_*`, `ghs_*`, `ghr_*`)
- GitLab PAT (`glpat-[0-9a-zA-Z_-]{20}`)
- JWT (3 base64url segments separated by dots)
- OpenAI API key (`sk-[0-9a-zA-Z]{48}`)
- Slack token (`xox[baprs]-...`)
- Generic high-entropy string (Shannon entropy threshold)

On hit: exits 2 (blocking — Claude Code interprets exit 2 as "do not proceed with this tool call"). On clean: exits 0.

Observer? **No.** This is a blocking gate.

---

## val-calibration

Matchers: `PreToolUse:Task|Agent`.

Reads `subagent_type` from `tool_input`. If it equals `evaluator`, prepends a `<calibration-anchor>` block to the spawn prompt by reading `skills/evaluator-tuning/references/calibration-examples.md`.

**Why `Task|Agent`:** The hook fires on both legacy (`Task` tool name from earlier Claude Code versions) and canonical (`Agent` tool name from current). This is structural future-proofing — when the legacy `Task` name is removed, the matcher can shrink to `Agent` only.

**Why this matters:** The calibration anchor is the canonical pattern that the rest of the plugin should imitate (per DESIGN-004 §3.2 generalization rationale). Heavy domain knowledge lives in `references/`; a hook brings it in only when the relevant agent spawns.

---

## post-bash-lint

Matchers: `PostToolUse:Bash`.

After every Bash invocation, surfaces source-modifying commands to stderr as a soft warning. Detects:

- `npm install` (mutates `package.json` / `package-lock.json`)
- `sed -i` (in-place edits)
- `>` redirects to tracked files
- `tee` to tracked files
- `git checkout --` (discards working tree changes)
- `git reset --hard` (destructive)

**Observer; never blocks.** Exits 0 unconditionally. The user sees the warning in stderr and can choose to revert.

This hook is informational — its job is to make accidental source mutations visible in transcripts, not to prevent them. Real prevention belongs in agent-tier discipline (T-A agents have no Bash; T-C agents have no Bash; only T-A `@evaluator` and `@reviewer` use Bash, and their tools-array constraints already exclude source modification).

---

## Hook contract change history

| Date | Change | Notes |
|---|---|---|
| 2026-04-29 | `metrics-collector` registered initial 9 event types | Per WORKFLOW-001 PR #3 |
| 2026-05-04 | `metrics-collector` added `team.shutdown` event + SUMMARY enrichment | Per DESIGN-003-visibility-and-shutdown |
| 2026-05-04 | `metrics-collector` flipped `capture_insight_text` default `false → true` | Per CHANGELOG `[Unreleased]` |
| 2026-05-05 | Hooks-table prose moved here from `commands/orchestra.md` | Per WORKFLOW-003 PR #1 (T-S09); runtime context becomes 5-row glossary |

---

## Maintainer cheat sheet

- **All hook scripts must be Node.js stdlib-only** — no `node_modules` dependency. Per PRD-001 §8.9 (extended in PRD-001 PR #0 E-02).
- **Path resolution:** Use `process.env.CLAUDE_PLUGIN_ROOT` for plugin-relative paths. Hooks fire from the parent's CWD, not the plugin's directory.
- **Performance:** Hooks block tool execution. Keep work minimal; defer heavy I/O to background scripts when possible.
- **Failure mode:** Exit codes per Claude Code's hook protocol — exit 0 = continue, exit 2 = block (with stderr message). Hook errors at non-zero non-2 exits surface as warnings but do not block.
- **Testing:** `node scripts/test-hooks.js` validates `hooks.json` structure + matcher coverage. `node scripts/test-metrics.js` validates `metrics-collector` event taxonomy.
