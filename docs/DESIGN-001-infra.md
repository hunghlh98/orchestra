---
id: DESIGN-001-infra
title: orchestra v1.0.0 — Infrastructure Architecture Design
created: 2026-04-29
status: draft
revision: 2
scope: load-bearing infra only (5 hooks, 2 MCPs, 4 manifests, 1 drift validator)
references:
  prd:
    - id: PRD-001
      sections: [S-INVARIANTS-001, S-FRS-001, S-FRONTMATTER-001, S-QUALITY-001, S-TESTING-001]
  brainstorm:
    - decisions: [Q1, Q2, Q3=A, Q4, Q5, Q6=a, Q7, Q8]
---

# orchestra v1.0.0 — Infrastructure Architecture Design

> Design output of `/sc:sc-design`. Specifies the contracts, schemas, and algorithms for the load-bearing infrastructure of orchestra v1.0.0. Agent prompts and skill bodies are leaf components and are out of scope for this pass; they slot into the harness once PR #1–#4 land.

---

## 0. Scope and frame <a id="S-SCOPE-001"></a>

| In scope | Out of scope |
|---|---|
| 5 hooks, 2 MCPs, 4 manifests, 1 drift validator | 8 agent prompts, 8 skill bodies |
| Hook protocol contracts and exit semantics | Spec-phase dialogue patterns (PRD §9.4) |
| MCP tool schemas + security boundaries | Routing taxonomy (PRD §9.5) |
| `validate-drift.js` algorithm | v1.1+ items |
| PR sequencing for manifests-first bootstrap | Source code (deferred to `/sc:sc-implement`) |

All design decisions trace to a PRD section. Where this design extends PRD-001, the extension is flagged.

### Locked inputs from `/sc:sc-brainstorm`

- Publish target: `hunghlh98/orchestra` (Q1)
- Pre-scaffold cleanup: remove `.venv/` before PR #1 (Q2)
- Model id form **A**: `model: claude-opus-4-7` + `context_mode: 1m` on agent frontmatter (Q3)
- Hand-rolled YAML in hooks; frontmatter grammar frozen (Q4)
- Reference shape: `{ type, id, section, hash-at-write }` with deterministic path resolution (Q5)
- Bootstrap order **(a)**: manifests-first; CI green at every commit (Q6)
- `validate-drift.js` empty-tree: pass-by-default (Q7)
- Idempotent dir creation in `metrics-collector`; `local.bootstrapped` event spec'd below (Q8)

### Pre-PRD edits the brainstorm queued

These edits to PRD-001 should land before or alongside PR #1:

1. §8.10, §10.1: model id form A propagation; add `context_mode` field to agent frontmatter contract.
2. §8.9: extend stdlib-only rule to hooks.
3. §8.13: freeze frontmatter grammar (block-style only; no flow style; no anchors/aliases; no multi-doc; quoted hash values).
4. §10.5: reference shape becomes `{ type, id, section, hash-at-write }`.
5. §9.9: add `validate-drift.completed` and `local.bootstrapped` events.
6. §11.2 + §12: `.gitignore` containing `.claude/.orchestra/{local.yaml, metrics, sessions}` becomes a release-gate prerequisite.
7. §9.11 step 4: explicit `local.bootstrapped` emission post-`local.yaml`-write.

---

## 1. Component dependency graph <a id="S-DEPGRAPH-001"></a>

```
                     ┌─────────────────────┐
                     │ manifests/*.json    │ ◄── PR #1 (skeletons)
                     │  install-modules    │
                     │  runtime-toggles    │
                     │  known-models       │
                     │  plugin.json        │
                     └──────────┬──────────┘
                                │ schema validated by
                                ▼
                     ┌─────────────────────┐
                     │ scripts/validate.js │
                     │ test-removability.js│
                     │ test-agents.js      │ ◄── PR #1 + PR #5 wiring
                     │ test-bash-strip.js  │
                     └──────────┬──────────┘
                                │ shares code with
                                ▼
        ┌────────────────────────────────────────────────────┐
        │ hooks/lib/yaml-mini.js   ◄── frozen-grammar parser │
        │ hooks/lib/section-hash.js ◄── canonical SHA256     │
        └────────────┬───────────────────────────┬───────────┘
                     │                           │
                     ▼                           ▼
       ┌───────────────────────┐    ┌────────────────────────┐
       │ hooks/scripts/        │    │ scripts/validate-drift │
       │   hash-stamper.js     │◄══►│    .js                 │
       │                       │    │ (must agree on hashes) │
       └───────────────────────┘    └────────────────────────┘
                     │                           │ PR #2
                     ▼                           ▼
       ┌───────────────────────────────────────────────────┐
       │ hooks/scripts/                                    │ PR #3
       │   pre-write-check, post-bash-lint,                │
       │   val-calibration, metrics-collector              │
       └───────────────────────────────────────────────────┘
                                │
                                ▼
       ┌───────────────────────────────────────────────────┐
       │ scripts/mcp-servers/                              │ PR #4
       │   orchestra-fs (tree)                             │
       │   orchestra-probe (http_probe, db_state)          │
       └───────────────────────────────────────────────────┘
                                │
                                ▼
       ┌───────────────────────────────────────────────────┐
       │ agents/, skills/, commands/, rules/               │ PR #5+
       │ (out of scope for this design)                    │
       └───────────────────────────────────────────────────┘
```

**Critical pair (load-bearing for G3):** `hooks/lib/section-hash.js` is consumed by both `hash-stamper.js` AND `validate-drift.js`. They MUST produce identical hashes for identical inputs. `test-hooks.js` includes a fixed-input hash-equality test across both consumers.

---

## 2. Manifest schemas <a id="S-MANIFESTS-001"></a>

### 2.1 `.claude-plugin/plugin.json`

```json
{
  "$schema": "https://json.schemastore.org/claude-code-plugin",
  "name": "orchestra",
  "version": "1.0.0",
  "description": "Multi-agent SDLC pipeline behind /orchestra. One developer, generator/evaluator separation, document-driven gates.",
  "author": "hunghlh98",
  "license": "MIT",
  "keywords": ["claude-code", "sdlc", "multi-agent", "orchestrator"],
  "homepage": "https://github.com/hunghlh98/orchestra",
  "agents": [
    "agents/product.md",
    "agents/lead.md",
    "agents/backend.md",
    "agents/frontend.md",
    "agents/test.md",
    "agents/evaluator.md",
    "agents/reviewer.md",
    "agents/ship.md"
  ],
  "commands": ["commands/orchestra.md"],
  "hooks": "hooks/hooks.json",
  "mcpServers": ".claude-plugin/.mcp.json"
}
```

**Invariants:**
- Agents listed as **explicit file paths** (PRD §8.6) — auto-discovery is forbidden so `validate.js` can verify exactly 8 entries.
- `version` matches `VERSION` file and the topmost `## [X.Y.Z]` entry in `CHANGELOG.md` (release-gate per PRD §11.2).

### 2.2 `manifests/install-modules.json`

```json
{
  "$schema": "../schemas/install-modules.schema.json",
  "modules": [
    {
      "name": "agent.lead",
      "kind": "agent",
      "path": "agents/lead.md",
      "defaultEnabled": true,
      "stability": "stable"
    },
    {
      "name": "hook.hash-stamper",
      "kind": "hook",
      "path": "hooks/scripts/hash-stamper.js",
      "defaultEnabled": true,
      "stability": "stable"
    },
    {
      "name": "mcp.orchestra-probe",
      "kind": "mcp",
      "path": "scripts/mcp-servers/orchestra-probe.js",
      "defaultEnabled": true,
      "stability": "stable"
    }
  ]
}
```

**Schema rules:**
- `kind` ∈ `{agent, hook, skill, rule, command, mcp}`.
- `stability` ∈ `{stable, experimental}`. v1.0.0 ships `stable` only; `experimental` reserved for v1.1+.
- `name` is the canonical key referenced by `runtime-toggles.json`.

### 2.3 `manifests/runtime-toggles.json`

```json
{
  "$schema": "../schemas/runtime-toggles.schema.json",
  "toggles": [
    {
      "module": "hook.hash-stamper",
      "envVar": "ORCHESTRA_HOOK_HASH_STAMPER",
      "default": "on",
      "description": "Section-hash stamper for .claude/.orchestra/ artifacts. Disabling breaks drift detection."
    },
    {
      "module": "hook.metrics-collector",
      "envVar": "ORCHESTRA_HOOK_METRICS_COLLECTOR",
      "default": "on",
      "description": "Local-only JSONL telemetry. Disable for fully air-gapped runs."
    }
  ]
}
```

**Invariant (G5):** for every entry in `install-modules.json` whose `kind` ∈ `{hook, skill, mcp}`, exactly one entry exists in `runtime-toggles.json` with `module` matching the install module's `name`. `test-removability.js` asserts this 1:1 correspondence.

Agents and rules are toggled via different mechanisms (`local.yaml` or `paths:` glob) so they are *not* in `runtime-toggles.json`. `test-removability.js` exempts these `kind` values.

### 2.4 `manifests/known-models.json` — new per Q3 = A

```json
{
  "$schema": "../schemas/known-models.schema.json",
  "models": [
    { "id": "claude-opus-4-7", "tier": "opus", "default": true, "supportsContextMode": ["default", "1m"] },
    { "id": "claude-sonnet-4-6", "tier": "sonnet", "supportsContextMode": ["default"] },
    { "id": "claude-haiku-4-5-20251001", "tier": "haiku", "supportsContextMode": ["default"] }
  ]
}
```

`test-agents.js` validates every agent's `model` ∈ `models[].id` AND `context_mode` ∈ that model's `supportsContextMode`. Exactly one entry has `default: true`.

---

## 3. Hook contracts <a id="S-HOOKS-001"></a>

### 3.1 Common protocol (PRD §9.9 invariants made concrete)

All hooks read JSON on stdin from Claude Code:

```json
{
  "session_id": "<uuid>",
  "transcript_path": "<path>",
  "cwd": "<path>",
  "hook_event_name": "PreToolUse|PostToolUse|UserPromptSubmit|SubagentStop|Stop",
  "tool_name": "<name>",
  "tool_input": { }
}
```

Three behavioral classes:

| Class | Used by | Stdout | Exit |
|---|---|---|---|
| **Blocker** | `pre-write-check` | stderr message on block; nothing on stdout | 0 allow / 2 block |
| **Rewriter** | `hash-stamper`, `val-calibration` | JSON with rewritten `tool_input` | 0 always |
| **Observer** | `post-bash-lint`, `metrics-collector` | nothing | 0 always |

**Universal env-var opt-out** — first action in every hook:

```js
if (process.env[`ORCHESTRA_HOOK_${NAME_UPPER}`] === "off") { process.exit(0); }
```

This single line makes G5 ship for every hook with no extra plumbing.

**Crash semantics** — every hook wraps its body in `try/catch`. On any thrown exception: exit 0 (passthrough), append a `hook.<name>.crashed` event to the metrics JSONL if reachable. Hooks never block on their own bug (PRD §8.13 invariant).

### 3.2 `pre-write-check` (Blocker)

| Field | Spec |
|---|---|
| Trigger | `PreToolUse` on `Write \| Edit \| MultiEdit` |
| Detects | AWS keys (`AKIA[0-9A-Z]{16}`), GitHub PATs (`ghp_[A-Za-z0-9]{36}`, `github_pat_[A-Za-z0-9_]{82}`), JWTs (`eyJ[A-Za-z0-9_-]+\.eyJ[...]`), RSA/EC private keys (`-----BEGIN (RSA\|EC) PRIVATE KEY-----`), Slack tokens (`xox[baprs]-[A-Za-z0-9-]+`), Google API keys (`AIza[A-Za-z0-9_-]{35}`), Bearer/Basic auth (`(Bearer\|Basic) [A-Za-z0-9+/=._-]{12,}`) |
| Skip lines containing | `process.env.`, `${`, `placeholder`, `<your-`, `example`, `test-fixture` |
| Block path | exit 2; stderr: `pre-write-check: detected <kind> at line <N>. Use process.env or a placeholder.` |
| Allow path | exit 0; no stdout |
| Failure mode | regex engine error → catch → exit 0 + `hook.pre-write-check.crashed` event |

Implementation note: regex set is a const array; iterating once over content is O(n × patterns). For typical Write payloads (<100KB), elapsed < 50ms. No SLA needed.

### 3.3 `hash-stamper` (Rewriter — load-bearing for G3)

| Field | Spec |
|---|---|
| Trigger | `PreToolUse` on `Write \| Edit \| MultiEdit` where `tool_input.file_path` matches `**/.claude/.orchestra/**/*.{md,openapi.yaml}` |
| Algorithm | PRD §8.13 steps 1–7, made concrete below |
| Failure modes | Per PRD §8.13 table — all exit 0 |

**Algorithm (concrete):**

```
1. Parse stdin → { tool_input.file_path, tool_input.content }
2. If file extension is .openapi.yaml: hash the whole-file body (no anchors); skip section walk
3. Else (.md):
   a. Split content at first occurrence of `^---\n` ... `\n---\n` → frontmatter, body
   b. Walk body lines; whenever a line matches `^##\s.*<a id="(S-[A-Z]+-\d{3})">`:
      record (anchor_id, start_line)
   c. For each anchor, content slice = body[start_line+1 .. next_anchor_start_line-1] OR EOF
   d. Normalize: convert CRLF→LF; strip trailing whitespace per line; drop the anchor heading line itself
   e. hash = "sha256:" + sha256_hex(utf8(normalized_slice))
4. Parse frontmatter via lib/yaml-mini.js (frozen grammar):
   - Update sections.<id>.hash for each anchor found
   - Preserve sections.<id>.confirmed / sections.<id>.inferred flags
5. For each references[].hash-at-write that is "TBD":
   - Resolve upstream path from { type, id } per the table:
       sad → architecture/SAD.md
       prd|frs|tdd|api|contract|test|... → pipeline/<id>/<TYPE>-<id>.md (or .openapi.yaml)
       runbook|release → runbooks/RUNBOOK-<id>.md / releases/RELEASE-<id>.md
   - Read upstream file; parse its frontmatter; look up sections.<section>.hash
   - If found → set references[i].hash-at-write to that hash
   - If not found → set "TBD-UNRESOLVED"; emit hook.hash-stamper.upstream-unresolved
6. Re-emit frontmatter (preserving key order via sequential-write parser); reassemble file
7. Stdout JSON: { hookSpecificOutput: { hookEventName: "PreToolUse",
     permissionDecision: "allow",
     updatedInput: { file_path, content: <rewritten> } } }
   exit 0
   NOTE: updatedInput must include EVERY field of the original tool_input,
   not just modified ones. For Write that means both file_path and content;
   for Edit that means file_path, old_string, new_string, and replace_all
   if present in the input. Hash-stamper's read of tool_input in step 1
   already captures the full input, so re-emitting all fields is mechanical.
```

**Hand-rolled YAML grammar (the "frozen frontmatter shape" promise):**

```
document    := "---\n" entries "---\n"
entries     := entry+
entry       := key ":" (scalar | "\n" indented_block)
indented_block := (indent entry)+
key         := [a-zA-Z][a-zA-Z0-9_-]*
scalar      := unquoted | quoted_string
quoted_string := '"' (escaped_char | non_quote)* '"'
unquoted    := [^\n]+ (no leading/trailing whitespace)
```

**Forbidden** (validator rejects with `frontmatter-grammar-violation`):
- Flow style (`{ }`, `[ ]`)
- YAML anchors (`&`, `*`)
- Multi-document (`---` markers inside body)
- Tags (`!!str`, etc.)
- Implicit boolean coercion (must be `true`/`false` only, lowercase)
- Hash values without quotes (forces `"sha256:..."` form)

This grammar covers every PRD example in §8.13 and §10. It is parser-implementable in ~150 lines of stdlib-only Node.

**✓ R1 resolved — 2026-04-29.** Claude Code's PreToolUse hook protocol supports `tool_input` modification via the `hookSpecificOutput.updatedInput` field (not `modifiedToolInput` as initially assumed). Step 7 above is updated. The contract requires every field of the original `tool_input` to appear in `updatedInput`, not just modified ones. Source: <https://code.claude.com/docs/en/hooks.md>. PR #2 proceeds with the in-design algorithm; no fallback to PostToolUse double-write needed.

### 3.4 `post-bash-lint` (Observer)

| Field | Spec |
|---|---|
| Trigger | `PostToolUse` on `Bash` |
| Behavior | Inspect `tool_input.command` for source-modifying patterns (`> *.{js,ts,java,py}`, `tee`, `sed -i`, `npm install`); if matched and a known linter is on PATH, run it; emit findings to stderr |
| Exit | 0 always (observer) |
| No-op cases | No source-modifying pattern → exit 0; linter absent → exit 0 |

### 3.5 `val-calibration` (Rewriter)

| Field | Spec |
|---|---|
| Trigger | `PreToolUse` on `Task` where `tool_input.subagent_type === "evaluator"` |
| Behavior | Read `skills/evaluator-tuning/references/calibration-examples.md`; inject as `<calibration-anchor>...</calibration-anchor>` block into `tool_input.prompt` |
| Failure | references file missing → exit 0 (graceful no-op per PRD §9.9 invariant 4) |

### 3.6 `metrics-collector` (Observer, multi-event)

| Field | Spec |
|---|---|
| Subscribed events | `UserPromptSubmit`, `PreToolUse(Task)`, `PreToolUse(mcp__orchestra-*)`, `SubagentStop`, `Stop` |
| Output sink | `<cwd>/.claude/.orchestra/metrics/events.jsonl` (append-only) |
| Pre-flight | `mkdir -p` parents (idempotent per Q8); if creation fails → exit 0, drop event |
| Event shape | One JSON per line; PRD §9.9 schema + the 2 new events below |
| Rotation | When file size > 50MB after append: rename to `events-<ISO>.jsonl`, gzip, retain last 5 archives, start fresh file. Rotation runs on the next event after threshold; never blocks |

**Event additions per Q7/Q8 (extends PRD §9.9):**

```json
{"ts":"<ISO>","event":"local.bootstrapped","run_id":"<uuid>","project_mode":"greenfield|brownfield","primary_language":"<lang>","framework":"<fw|null>"}
{"ts":"<ISO>","event":"validate-drift.completed","run_id":"<uuid>","fail_count":0,"warn_count":0,"artifacts_walked":0}
```

`local.bootstrapped` fires from a one-shot trigger inside `@lead`'s post-bootstrap step — the hook itself does not know about bootstrap; the event is appended by `@lead` to the JSONL via tool call after `local.yaml` write. This must be documented in PRD §9.11 step 4.

`validate-drift.completed` is appended directly by `validate-drift.js` (it has filesystem access).

---

## 4. MCP tool schemas <a id="S-MCPS-001"></a>

### 4.1 `orchestra-fs`

```json
{
  "name": "orchestra-fs",
  "version": "1.0.0",
  "description": "Filesystem exploration with auditable tool calls.",
  "tools": [
    {
      "name": "tree",
      "description": "Recursively list directory contents in a tree-like format. Wraps the system `tree` CLI for auditability.",
      "inputSchema": {
        "type": "object",
        "properties": {
          "path": { "type": "string", "description": "Directory to walk. Must be inside cwd." },
          "depth": { "type": "integer", "default": 3, "minimum": 1, "maximum": 8 },
          "ignore_globs": { "type": "array", "items": { "type": "string" }, "default": ["node_modules", ".git", ".venv"] }
        },
        "required": ["path"]
      }
    }
  ]
}
```

**Security boundary:**
- `path` resolved relative to MCP server's cwd; reject any resolved path that escapes via `..`.
- If `tree` CLI is absent on PATH, fall back to a stdlib `fs.readdir` walker. Same output shape.
- Server logs every call to stderr (visible in Claude Code's MCP inspector); no tool args are logged anywhere else.

### 4.2 `orchestra-probe`

```json
{
  "name": "orchestra-probe",
  "version": "1.0.0",
  "description": "Runtime probes for @evaluator. SQL backends only in v1.0.0.",
  "tools": [
    {
      "name": "http_probe",
      "description": "Make an HTTP request and return status, headers (filtered), and body (truncated).",
      "inputSchema": {
        "type": "object",
        "properties": {
          "method": { "type": "string", "enum": ["GET","POST","PUT","DELETE","PATCH","HEAD"] },
          "url": { "type": "string", "format": "uri" },
          "headers": { "type": "object", "additionalProperties": { "type": "string" } },
          "body": { "type": "string" },
          "timeout_ms": { "type": "integer", "default": 5000, "maximum": 30000 },
          "follow_redirects": { "type": "boolean", "default": false },
          "max_body_bytes": { "type": "integer", "default": 65536 }
        },
        "required": ["method", "url"]
      }
    },
    {
      "name": "db_state",
      "description": "Run a parameterized SELECT against sqlite3, psql, or mysql via DSN. Read-only; SELECT-only enforced server-side.",
      "inputSchema": {
        "type": "object",
        "properties": {
          "dsn": { "type": "string", "description": "sqlite3:///path | postgres://... | mysql://..." },
          "query": { "type": "string", "description": "SQL with $1/$2 or ?-style placeholders." },
          "params": { "type": "array", "items": { "type": ["string","number","boolean","null"] } },
          "timeout_ms": { "type": "integer", "default": 5000, "maximum": 30000 },
          "row_cap": { "type": "integer", "default": 100, "maximum": 1000 }
        },
        "required": ["dsn", "query"]
      }
    }
  ]
}
```

**Security boundaries:**
- `db_state` rejects any query whose first non-comment, non-whitespace token is not `SELECT` (case-insensitive). No `INSERT`, `UPDATE`, `DELETE`, `DROP`, `WITH ... INSERT`, etc.
- DSN parsed into driver + connection params; never interpolated into shell commands. CLI invocation via `spawn` with array args, never `exec` with concatenated strings.
- **Post-substitution secret redaction:** before returning rows, the response body passes through the same regex set as `pre-write-check`. Any match → replaced with `[REDACTED:<kind>]`. This protects against a probe accidentally surfacing live secrets to the model.
- Row cap and timeout enforced server-side; client-supplied values clamped.
- DSN values never logged in cleartext; logged with credentials replaced by `***`.

---

## 5. `validate-drift.js` algorithm <a id="S-DRIFT-001"></a>

```
Input: <project>/.claude/.orchestra/ directory (cwd-relative)
Output: <project>/.claude/.orchestra/DRIFT-REPORT.md
Exit codes: 0 always; release gate reads severity from the report

1. If .claude/.orchestra/ does not exist OR contains no .md files under
   pipeline/, architecture/, runbooks/, releases/:
     write empty DRIFT-REPORT.md with header "No artifacts found. Pass-by-default."
     append metrics event { event: "validate-drift.completed",
                            fail_count: 0, warn_count: 0, artifacts_walked: 0 }
     exit 0   (Q7 — pass-by-default)

2. Walk all .md and .openapi.yaml files under .claude/.orchestra/ (excluding
   metrics/, sessions/, DRIFT-REPORT.md itself, SUMMARY-*.md).

3. For each artifact:
   a. Parse frontmatter via lib/yaml-mini.js (same parser as hash-stamper).
      On parse failure → record finding "frontmatter-parse-failed" severity=fail
      and skip this artifact's downstream checks.
   b. For each anchor in body, recompute hash via lib/section-hash.js.
   c. If frontmatter sections.<id>.hash != recomputed:
        record "frontmatter-out-of-sync" severity=fail
        (means hash-stamper did not run; manual edit happened or hook is off)

4. For each artifact's references[]:
   a. Resolve upstream by (type, id) per the deterministic table from §3.3.
   b. If upstream missing OR upstream's sections.<section> missing:
        if hash-at-write == "TBD-UNRESOLVED":
          severity = warn if folder is in-flight, fail if folder is sealed
        else:
          severity = fail "upstream-vanished"
   c. Else if upstream.sections.<section>.hash != reference.hash-at-write:
        if upstream.sections.<section>.confirmed == true:
          severity = fail "drift-on-confirmed"
        else if upstream.sections.<section>.inferred == true:
          severity = warn "drift-on-inferred"

5. "Folder is sealed" = exists releases/RELEASE-*.md whose body references
   pipeline/<id>/. Pre-release (no RELEASE) = in-flight.

6. Inferred-needing-review summary (brownfield UX):
   For every artifact, count inferred:true sections weighted by reference count
   from other artifacts. Emit as the FIRST block of DRIFT-REPORT.md, sorted
   most-cited first. (PRD §8.13 inferred→confirmed flip discoverability.)

7. Write DRIFT-REPORT.md:
     ## Inferred sections needing review
     <table sorted by reference count>
     ## Drift findings
     <grouped by downstream artifact>
     <each finding: severity | downstream | reference | upstream | reason>
     ## Summary
     fail_count, warn_count, artifacts_walked

8. Append metrics event validate-drift.completed with the counts.

9. Exit 0. The release gate (PRD §11.2) reads DRIFT-REPORT.md and blocks on any
   severity=fail entry. validate-drift.js itself never exits non-zero — it is
   a reporter, not an enforcer.
```

**Why exit 0 always:** the report is the artifact; gates read the artifact. This pattern means `validate-drift.js` can run continuously during development without breaking flows; only the release gate enforces.

---

## 6. PR sequencing under bootstrap order (a) <a id="S-PRPLAN-001"></a>

Each PR ships green CI. No PR merges with red CI.

### PR #1 — Manifest skeletons + CI (lights up G5 from commit #1)

**Adds:**
- `.gitignore` containing `.claude/.orchestra/{local.yaml,metrics,sessions}` (release-gate prerequisite per Q-edit #6)
- `package.json` (no runtime deps; Node ≥18 for ESM and built-in `node:test`)
- `VERSION` (contents: `1.0.0`)
- `CHANGELOG.md` with `## [Unreleased]`
- `manifests/install-modules.json` — empty `modules: []`
- `manifests/runtime-toggles.json` — empty `toggles: []`
- `manifests/known-models.json` — 3 entries from §2.4
- `schemas/*.schema.json` for the 3 manifests above
- `.claude-plugin/plugin.json` — minimal (no agents listed yet)
- `scripts/validate.js` — checks manifests parse against schemas; checks plugin.json minimum keys
- `scripts/test-removability.js` — passes vacuously on empty modules; the assertion logic is in place
- `scripts/test-agents.js`, `scripts/test-bash-strip.js`, `scripts/test-hooks.js` — skeletons that pass on empty inputs
- `scripts/validate-drift.js` — implements the empty-tree pass-by-default branch only
- `.github/workflows/ci.yml` — runs all 6 validators on push/PR
- `README.md` — bare scaffold

**Exit criteria:** `npm test` chains all 6 validators, all green, on a clean checkout.

### PR #2 — hash-stamper + validate-drift complete (closes G3)

**Adds:**
- `hooks/hooks.json` — registers `hash-stamper` only
- `hooks/lib/yaml-mini.js` — frozen-grammar parser
- `hooks/lib/section-hash.js` — canonical SHA256 with normalization rules
- `hooks/scripts/hash-stamper.js`
- `scripts/validate-drift.js` — full algorithm replacing the empty-tree stub
- `scripts/test-hooks.js` — hash-equality test across hash-stamper and validate-drift, fixed-input regression suite
- `manifests/install-modules.json` += hook entry
- `manifests/runtime-toggles.json` += `ORCHESTRA_HOOK_HASH_STAMPER`
- `docs/pipeline-schema.md` — type-specific frontmatter additions promised in PRD §10.5

**Exit criteria:** create a fixture artifact under a test `.orchestra/`, write it through the hook, validate-drift runs clean. Both consumers produce identical hashes.

**Pre-merge gate (R1, resolved 2026-04-29):** Claude Code's PreToolUse protocol supports the `updatedInput` field for tool_input rewrite. PR #2 proceeds with the in-design algorithm.

### PR #3 — Remaining 4 hooks

**Adds:**
- `hooks/scripts/{pre-write-check,post-bash-lint,val-calibration,metrics-collector}.js`
- `hooks/hooks.json` updated with 4 new registrations
- `manifests/install-modules.json` += 4 hook entries
- `manifests/runtime-toggles.json` += 4 env-var entries
- `scripts/test-hooks.js` extended: blocker test for `pre-write-check`, observer tests for the rest
- `scripts/test-metrics.js` — JSONL append safety, rotation under threshold

**Exit criteria:** every hook honors its env-var opt-out; metrics JSONL appends are atomic; rotation triggers above 50MB in fixture.

### PR #4 — MCPs

**Adds:**
- `.claude-plugin/.mcp.json` — registers both servers
- `scripts/mcp-servers/orchestra-fs.js`
- `scripts/mcp-servers/orchestra-probe.js`
- `scripts/test-probe.js` — round-trips http_probe against an in-process server, db_state against a tmp sqlite file
- `manifests/install-modules.json` += 2 mcp entries
- `manifests/runtime-toggles.json` += 2 toggle entries
- `.gitignore` allow-list for shipped MCP scripts (per PRD §11.3)

**Exit criteria:** SELECT-only enforcement test passes; secret redaction test passes (probe returns row containing AWS-key-shaped string → response shows `[REDACTED:aws-key]`).

### PR #5+ — Agents, skills, commands, rules (out of scope for this design pass)

Once PR #4 merges, the harness is complete and CI will fail-loud the moment a non-conforming agent or hook is added. Agents come in via `/sc:sc-implement` against the leaf-component spec.

---

## 7. Open design risks <a id="S-RISKS-001"></a>

Each must be resolved before the named PR merges.

| # | Risk | Surfaces at | Resolution |
|---|---|---|---|
| ~~R1~~ | **Resolved 2026-04-29.** Field is `updatedInput` (not `modifiedToolInput`); requires all original `tool_input` keys present. §3.3 step 7 updated. Source: code.claude.com/docs/en/hooks.md | n/a | resolved |
| **R2** | `validate-drift.js` performance on a brownfield repo with 100+ artifacts — full SHA256 walk per push | After first real brownfield run | Profile, then add a Merkle-style "files changed since last run" cache if needed. Out of scope for v1.0.0 unless empirically slow |
| **R3** | Hand-rolled YAML parser handling of edge cases (multi-line strings, escaped quotes in hash values) | PR #2 review | Frozen grammar (§3.3) explicitly forbids these; validator rejects them as `frontmatter-grammar-violation`. If a real artifact needs them, revise grammar before adding to the parser |
| **R4** | `db_state` SELECT-only check vs. `WITH ... SELECT` CTEs and vendor-specific dialects | PR #4 | First-token-after-comments check is conservative; CTEs starting with `WITH` need an allow-list path. Defer or accept stricter behavior |
| **R5** | Concurrent writes from two agents to the same artifact (deferred per PRD §8.13) | When Pattern C wave teams ship | Out of v1.0.0; single-writer assumption holds |

---

## 8. Summary <a id="S-SUMMARY-001"></a>

PR #1 ships the green-CI manifests-first scaffold. PR #2 closes the drift loop (hash-stamper + validate-drift) — the moment that lands, G3 is enforceable for the rest of the build. PR #3 fills out the hook surface. PR #4 ships the MCP load-bearing pair. After PR #4, every leaf agent and skill added in `/sc:sc-implement` is automatically held to the harness contracts.

**Next step:** confirm R1 with a 30-minute spike against the live Claude Code hook protocol. If R1 resolves cleanly, hand off to `/sc:sc-workflow` to schedule PR #1. If R1 reveals the rewrite path is unavailable, revise §3.3 step 7 (PostToolUse double-write) before any `/sc:sc-implement` runs.

---

**End of DESIGN-001-infra.** Hand-off to `/sc:sc-workflow` for PR scheduling and task graph generation.
