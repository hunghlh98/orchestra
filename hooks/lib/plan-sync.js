// hooks/lib/plan-sync.js
// Projection helpers for agent-plan-sync hook. SubagentStop-only model:
// when a subagent finishes, this module walks its transcript jsonl, extracts
// every TaskCreate/TaskUpdate event, and returns rows ready for upsert into
// the session-level <cwd>/.orchestra/plans/<sessionId>/agent-tasks.md ledger.
//
// findJustStoppedSubagentMeta — locates the most-recently-touched
//   subagent's jsonl + .meta.json under the dispatcher's sessions tree.
// projectSubagentRows — reads the transcript, returns row objects
//   { agent, feature_id, task_id, description, status, updated }.
// deriveFeatureId — three-tier feature-id discovery (spawn prompt, pipeline
//   manifest mtime, pipeline dir mtime).

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { getProjectSessionsDir } from "./jsonl-emit.js";
import { extractCreatedTaskId, mapClaudeStatus, oneLine } from "./plan-frontmatter.js";

// findJustStoppedSubagentMeta — at SubagentStop, locate the most-recent-mtime
// agent-*.jsonl under <projects>/<parent-sid>/subagents/, paired with its
// .meta.json. Returns { sid, path, role } or null.
export function findJustStoppedSubagentMeta(cwd, parentSid) {
  if (!parentSid) return null;
  const subDir = join(getProjectSessionsDir(cwd), parentSid, "subagents");
  let entries;
  try { entries = readdirSync(subDir).filter(f => /^agent-[a-f0-9]+\.jsonl$/i.test(f)); }
  catch { return null; }
  if (entries.length === 0) return null;

  let mostRecent = null, bestMtime = 0;
  for (const f of entries) {
    const path = join(subDir, f);
    let mtime; try { mtime = statSync(path).mtimeMs; } catch { continue; }
    if (mtime > bestMtime) { bestMtime = mtime; mostRecent = { f, path }; }
  }
  if (!mostRecent) return null;

  const sid = mostRecent.f.replace(/^agent-/, "").replace(/\.jsonl$/, "");
  const metaPath = join(subDir, `agent-${sid}.meta.json`);
  const role = deriveAgentRoleFromMeta(metaPath) || deriveAgentRoleFromJsonl(mostRecent.path) || "unknown";
  return { sid, path: mostRecent.path, role };
}

// projectSubagentRows — walks a subagent transcript jsonl, returns one row
// per task_id observed. agent + feature_id are constants per subagent;
// description / status / updated are the latest observed values.
export function projectSubagentRows(cwd, subagentJsonlPath, agentRole) {
  if (!existsSync(subagentJsonlPath)) return [];
  let content;
  try { content = readFileSync(subagentJsonlPath, "utf8"); } catch { return []; }

  const featureId = deriveFeatureId(cwd, subagentJsonlPath) || "_workspace";
  const tasksByCreateId = new Map();   // tool_use_id (TaskCreate) → row
  const tasksByClaudeId = new Map();   // claude_task_id (taskId) → row

  for (const line of content.split("\n")) {
    if (!line.trim()) continue;
    let evt;
    try { evt = JSON.parse(line); } catch { continue; }
    const ts = typeof evt.timestamp === "string" ? evt.timestamp : new Date().toISOString();
    const message = evt.message;
    if (!message || !Array.isArray(message.content)) continue;

    for (const block of message.content) {
      if (!block || typeof block !== "object") continue;
      if (block.type === "tool_use" && (block.name === "TaskCreate" || block.name === "TaskUpdate")) {
        const input = block.input || {};
        if (block.name === "TaskCreate") {
          const row = {
            agent: `@${agentRole}`,
            feature_id: featureId,
            task_id: null,
            description: oneLine(input.subject || input.description || ""),
            status: "pending",
            updated: ts,
          };
          tasksByCreateId.set(block.id, row);
        } else if (block.name === "TaskUpdate") {
          const claudeId = input.taskId ? String(input.taskId) : null;
          if (!claudeId) continue;
          const existing = tasksByClaudeId.get(claudeId);
          if (!existing) continue;
          if (typeof input.status === "string") {
            const mapped = mapClaudeStatus(input.status);
            if (mapped) existing.status = mapped;
          }
          if (typeof input.subject === "string") existing.description = oneLine(input.subject);
          existing.updated = ts;
        }
      } else if (block.type === "tool_result" && block.tool_use_id && tasksByCreateId.has(block.tool_use_id)) {
        const row = tasksByCreateId.get(block.tool_use_id);
        const claudeId = extractCreatedTaskId(block.content);
        if (claudeId) {
          row.task_id = claudeId;
          tasksByClaudeId.set(claudeId, row);
        }
      }
    }
  }

  return [...tasksByClaudeId.values()];
}

// deriveFeatureId — three-tier discovery.
//   1. Spawn-prompt feature-id pattern (first user message).
//   2. Most-recently-modified intent.yaml under pipeline/<feature-id>/.
//   3. Most-recently-modified pipeline/<feature-id>/ dir.
export function deriveFeatureId(cwd, subagentJsonlPath) {
  if (subagentJsonlPath && existsSync(subagentJsonlPath)) {
    let content;
    try { content = readFileSync(subagentJsonlPath, "utf8"); } catch { content = ""; }
    for (const line of content.split("\n")) {
      if (!line.trim()) continue;
      try {
        const d = JSON.parse(line);
        if (d?.type !== "user") continue;
        let text = d.message?.content;
        if (Array.isArray(text)) {
          text = text.map(c => (c && typeof c.text === "string") ? c.text : "").join(" ");
        }
        if (typeof text !== "string") continue;
        const m = text.match(/\bfeature[_-]?id[:= ]+["']?(\d{3}-[a-z][a-z0-9-]*)/i)
              || text.match(/\bfeature[:= ]+["']?(\d{3}-[a-z][a-z0-9-]*)/i)
              || text.match(/(?:^|[/\s"'`])(\d{3}-[a-z][a-z0-9-]*)(?=[/\s"'`-]|$)/);
        if (m) return m[1];
        break;
      } catch {}
    }
  }
  const pipelineRoot = join(cwd, ".orchestra", "pipeline");
  let dirs;
  try { dirs = readdirSync(pipelineRoot, { withFileTypes: true }); }
  catch { return null; }
  let best = null;
  for (const d of dirs) {
    if (!d.isDirectory()) continue;
    if (!/^\d{3}-[a-z][a-z0-9-]*$/.test(d.name)) continue;
    const intentPath = join(pipelineRoot, d.name, "intent.yaml");
    let mtime;
    try { mtime = statSync(existsSync(intentPath) ? intentPath : join(pipelineRoot, d.name)).mtimeMs; }
    catch { continue; }
    if (!best || mtime > best.mtime) best = { name: d.name, mtime };
  }
  return best ? best.name : null;
}

function deriveAgentRoleFromMeta(metaPath) {
  try {
    const meta = JSON.parse(readFileSync(metaPath, "utf8"));
    if (typeof meta.agentType === "string" && meta.agentType.length > 0) {
      return meta.agentType.replace(/^orchestra:/, "") || null;
    }
  } catch {}
  return null;
}

function deriveAgentRoleFromJsonl(jsonlPath) {
  let content;
  try { content = readFileSync(jsonlPath, "utf8"); } catch { return null; }
  for (const line of content.split("\n")) {
    if (!line.trim()) continue;
    try {
      const d = JSON.parse(line);
      if (d?.type !== "user") continue;
      let text = d.message?.content;
      if (Array.isArray(text)) {
        text = text.map(c => (c && typeof c.text === "string") ? c.text : "").join(" ");
      }
      if (typeof text !== "string") continue;
      const m = text.match(/You are @(\w+) in the orchestra pipeline/);
      if (m) return m[1];
    } catch {}
  }
  return null;
}
