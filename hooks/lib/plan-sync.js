// hooks/lib/plan-sync.js
// Subagent identity + feature-id resolution for agent-plan-sync hook.
// resolveContext() — for Task*-tool inputs (fired inside subagent):
//   derives (cwd, runId=parent_sid, subSid, agent, featureId).
// findJustStoppedSubagentMeta() — for SubagentStop (fires on dispatcher):
//   locates the most-recently-touched subagent jsonl + .meta.json.
//
// Why a second module beside jsonl-emit.js: agent-plan-sync.js needs the
// parent_sid (the dispatcher) to construct the plan-file path, which
// jsonl-emit.js doesn't surface (it just finds-and-returns the subagent).
// Keeping these helpers local to plan-sync avoids polluting jsonl-emit's
// metrics-flavored API.

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { getProjectSessionsDir } from "./jsonl-emit.js";

export function resolveContext(input) {
  const cwd = input.cwd || process.cwd();
  const subSid = input.session_id;
  if (!subSid) return null;

  const parentSid = findParentSid(cwd, subSid);
  if (!parentSid) return null;

  const subDir = join(getProjectSessionsDir(cwd), parentSid, "subagents");
  const subagentJsonlPath = join(subDir, `agent-${subSid}.jsonl`);
  const metaPath = join(subDir, `agent-${subSid}.meta.json`);

  const agent = deriveAgentRoleFromMeta(metaPath) || deriveAgentRoleFromJsonl(subagentJsonlPath);
  if (!agent || agent === "unknown") return null;

  const featureId = deriveFeatureId(cwd, subagentJsonlPath);
  if (!featureId) return null;

  return { cwd, runId: parentSid, subSid, agent, featureId };
}

function findParentSid(cwd, subSid) {
  const sessionsDir = getProjectSessionsDir(cwd);
  let entries;
  try { entries = readdirSync(sessionsDir, { withFileTypes: true }); }
  catch { return null; }
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const candidate = join(sessionsDir, e.name, "subagents", `agent-${subSid}.jsonl`);
    if (existsSync(candidate)) return e.name;
  }
  return null;
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

// findJustStoppedSubagentMeta — used at SubagentStop. Most-recent-mtime
// agent-*.jsonl in the parent's subagents/ dir, paired with its .meta.json.
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

  const sid = mostRecent.f.replace(/\.jsonl$/, "");
  const metaPath = join(subDir, `${sid}.meta.json`);
  const role = deriveAgentRoleFromMeta(metaPath) || deriveAgentRoleFromJsonl(mostRecent.path) || "unknown";
  return { sid, path: mostRecent.path, role };
}
