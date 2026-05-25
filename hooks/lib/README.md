# hooks/lib — shared hook utilities

Internal ESM modules consumed by `hooks/scripts/*.js`. Ship to consumers as part of the plugin install.

## Module index

| Module | Purpose | Consumers |
|---|---|---|
| `yaml-mini.js` | Minimal YAML parser/serializer (frontmatter shape, no doc tags / anchors / complex types). | `agent-plan-sync.js`, `pre-write-check.js`, MCP servers |
| `safe-fs.js` | Atomic file write helpers (write-to-temp, rename, fsync). Prevents partial writes on crash. | `agent-plan-sync.js`, `metrics-collector.js`, `metrics-aggregators.js`, `redaction.js` |
| `rate-card.js` | Token / API cost lookup table for `known-models.schema.json` models. Cents-per-Mtoken. | `metrics-aggregators.js` |
| `bootstrap-consumer-claude-md.js` | Splices the orchestra section into consumer's `<context_path>/CLAUDE.md`. | `mcp__orchestra-utils__claude_md` |
| `event-shapers.js` | Pure hook-stdin → event-row classifier. `classify()`, `inferArtifactType()`, `deriveArtifactId()`, `deriveAgentRole()`. No filesystem IO. | `metrics-collector.js` |
| `field-extract.js` | YAML field extraction without a full parser (`matchField`, `extractBootstrapFields`, `extractIntentFields`, `extractSummaryFields`). | `event-shapers.js`, `metrics-collector.js` |
| `jsonl-emit.js` | Read-side helpers for session jsonls + events.jsonl (`readJsonl`, `sumTokensInJsonl`, `identifyAgent`, `extractInsightsFromJsonl`, `findJustStoppedSubagent`, `readActivePhase`, `findPhaseForTs`, `getProjectSessionsDir`). Read-only. | `metrics-collector.js`, `metrics-aggregators.js` |
| `redaction.js` | Manifest + redaction policy (`ensureManifest`, `applyRedaction`, `readPluginVersion`). | `metrics-collector.js`, `metrics-aggregators.js` |
| `metrics-aggregators.js` | Derived metrics writers (`emitSubagentTokens`, `emitInsightsForSession`, `emitRunSummary`, `emitCostByPhase`). | `metrics-collector.js` |
| `plan-frontmatter.js` | Session-level AGENT-TASKS ledger shape: `planPathFor`, `readPlan`/`writePlan`/`readOrInitPlan`/`initPlan`/`renderPlan`, `upsertTaskRow`, `finalizeFrontmatter`, `mapClaudeStatus`, `oneLine`, `extractCreatedTaskId`. | `agent-plan-sync.js` |
| `plan-sync.js` | Subagent transcript projection: `findJustStoppedSubagentMeta`, `projectSubagentRows`, `deriveFeatureId`. | `agent-plan-sync.js` |
| `cite-patterns.js` | Canonical regex tables for pre-write-check (`SECRET_PATTERNS`, `SKIP_PATTERNS`, `CITE_DENYLIST_RE`, chain-cite-reject / codebase-token-reject path + identifier patterns, `isChainArtifactUnderDocs`). | `gate-d.js` |
| `gate-d.js` | Pure gate matchers returning `{gate, message}` on hit (`checkSecrets`, `checkChainCiteReject`, `checkCodebaseTokenReject`, `checkWorkspaceSadContainerFloor`). | `pre-write-check.js` |
| `gate-f.js` | Changelog append-only enforcement (`checkChangelogAppendOnly`, `parseChangelogRows`). | `pre-write-check.js` |
| `preflight-detect.js` | `/orchestra` preflight detection + block builder (`buildPreflightBlock`, `parseSourceFlag`). | `orchestra-preflight.js` |
| `stdin-bounded.js` | Bounded stdin reader (1 MiB hard cap) shared across hook scripts. Returns `{text, bytes, overflow}`. | every hook script |

## Stability contract

These modules are **consumer surface**. Breaking changes require:

1. SemVer MAJOR bump (per `CLAUDE.md` release workflow).
2. CHANGELOG `### Breaking` entry citing the affected module + migration path.
3. Audit every consumer of the module (`grep -rn "from \"../lib/<name>\"" hooks/ mcp-servers/`) before merge.

Function signatures and exported names are part of the public contract. Internal helpers (not exported) may change freely.

## Authoring rules

- **ESM.** `import` / `export` only; CommonJS (`require` / `module.exports`) is not used in this tree. Hook scripts and MCP servers consume these modules via static ESM imports.
- **Pure functions where possible.** Side effects (filesystem, network, env reads) only when the function's name announces it.
- **No `process.exit()` from lib code.** Throw or return; let the calling hook decide exit codes.
- **No `console.log` in lib code.** Hooks own stdout/stderr emission so the hook contract (decision control via stderr) stays predictable.

## Adding a new module

1. Author at `hooks/lib/<name>.js`. Use named exports (`export function` / `export const`); avoid a single default-export bag.
2. Add a row to the Module index above with purpose + consumer list.
3. Update `Stability contract` if the module's exports become part of consumer-observable behaviour.
