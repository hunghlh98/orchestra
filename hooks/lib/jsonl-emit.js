// hooks/lib/jsonl-emit.js
// Read-side helpers for Claude Code session jsonls + orchestra events.jsonl.
// All functions are read-only (no writes); the calling hook owns emission.
//
// Two transcript layouts are supported (current Claude Code first, older
// builds as fallback) so the hook stays robust across platform changes:
//   v4 layout: ~/.claude/projects/<encoded-cwd>/<parent_sid>/subagents/agent-*.jsonl
//              + sibling agent-*.meta.json with {agentType: "orchestra:<role>"}
//   v3 layout: ~/.claude/projects/<encoded-cwd>/<sub_sid>.jsonl at project root

import { existsSync, readFileSync, readdirSync, statSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

export function readJsonl(path) {
  const result = [];
  let content;
  try { content = readFileSync(path, "utf8"); } catch { return result; }
  for (const line of content.split("\n")) {
    if (!line.trim()) continue;
    try { result.push(JSON.parse(line)); } catch {}
  }
  return result;
}

export function getProjectSessionsDir(cwd) {
  let resolved;
  try { resolved = realpathSync(cwd); } catch { resolved = cwd; }
  const encoded = resolved.replace(/\//g, "-");
  return join(homedir(), ".claude", "projects", encoded);
}

// Streaming writes the same assistant turn 2-3 times to the jsonl (each
// progress event re-serializes the in-flight message). Dedup by message.id
// or per-row totals come out 2-3x inflated.
export function sumTokensInJsonl(jsonlPath) {
  const result = { input: 0, output: 0, cache_read: 0, cache_create: 0, turns: 0 };
  const seen = new Set();
  let content;
  try { content = readFileSync(jsonlPath, "utf8"); } catch { return result; }
  for (const line of content.split("\n")) {
    if (!line.trim()) continue;
    try {
      const d = JSON.parse(line);
      const u = d?.message?.usage;
      if (!u) continue;
      const mid = d?.message?.id;
      if (mid && seen.has(mid)) continue;
      if (mid) seen.add(mid);
      result.input += u.input_tokens || 0;
      result.output += u.output_tokens || 0;
      result.cache_read += u.cache_read_input_tokens || 0;
      result.cache_create += u.cache_creation_input_tokens || 0;
      result.turns += 1;
    } catch {}
  }
  return result;
}

// Identifies the agent that owns a session jsonl. Scans user messages for
// the "You are @<name> in the orchestra pipeline" header injected by the
// dispatcher. Returns {role:"dispatcher"} for the parent (carries a
// <local-command-caveat>); {role:"unknown"} for sidecar/permission files.
export function identifyAgent(jsonlPath) {
  let content;
  try { content = readFileSync(jsonlPath, "utf8"); } catch { return { role: "unknown", ord: null }; }
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
      if (text.includes("<local-command-caveat>")) return { role: "dispatcher", ord: null };
      const m = text.match(/You are @(\w+) in the orchestra pipeline/);
      if (m) {
        const ordM = text.match(/\((\w+) turn\)/);
        return { role: m[1], ord: ordM ? ordM[1] : null };
      }
    } catch {}
  }
  return { role: "unknown", ord: null };
}

export function findJustStoppedSubagent(input) {
  const cwd = input.cwd || process.cwd();
  const parentId = input.session_id || "";
  if (!parentId) return null;
  return findSubagentInSiblingDir(cwd, parentId)
      || findSubagentInProjectRoot(cwd, parentId);
}

// v4 layout. The .meta.json is the canonical role source — subagent jsonls
// don't contain the "You are @<name>" header, so text-grep returns "unknown"
// and the meta is the only reliable lift.
function findSubagentInSiblingDir(cwd, parentId) {
  const subDir = join(getProjectSessionsDir(cwd), parentId, "subagents");
  let entries;
  try { entries = readdirSync(subDir).filter(f => /^agent-[a-f0-9]+\.jsonl$/i.test(f)); }
  catch { return null; }
  if (entries.length === 0) return null;

  let mostRecent = null, mostRecentMtime = 0;
  for (const f of entries) {
    const path = join(subDir, f);
    let mtime; try { mtime = statSync(path).mtimeMs; } catch { continue; }
    if (mtime > mostRecentMtime) { mostRecentMtime = mtime; mostRecent = { f, path }; }
  }
  if (!mostRecent) return null;

  const sid = mostRecent.f.replace(/\.jsonl$/, "");
  const metaPath = join(subDir, `${sid}.meta.json`);
  let role = "unknown";
  try {
    const meta = JSON.parse(readFileSync(metaPath, "utf8"));
    if (typeof meta.agentType === "string" && meta.agentType.length > 0) {
      role = meta.agentType.replace(/^orchestra:/, "") || "unknown";
    }
  } catch {}
  return { sid, path: mostRecent.path, role, ord: null };
}

// v3 fallback. Pick the most-recent-mtime candidate that identifies as a
// real subagent (rejecting "unknown" sidecars + parent dispatcher).
function findSubagentInProjectRoot(cwd, parentId) {
  const sessionsDir = getProjectSessionsDir(cwd);
  let entries;
  try { entries = readdirSync(sessionsDir).filter(f => f.endsWith(".jsonl")); }
  catch { return null; }

  const candidates = [];
  for (const f of entries) {
    const sid = f.replace(/\.jsonl$/, "");
    if (sid === parentId) continue;
    const path = join(sessionsDir, f);
    let mtime; try { mtime = statSync(path).mtimeMs; } catch { continue; }
    candidates.push({ sid, path, mtime });
  }
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => b.mtime - a.mtime);

  for (const c of candidates) {
    const agent = identifyAgent(c.path);
    if (agent.role && agent.role !== "unknown" && agent.role !== "dispatcher") {
      return { sid: c.sid, path: c.path, role: agent.role, ord: agent.ord };
    }
  }
  return null;
}

// Scans for `★ Insight ─...─{20,}` blocks in assistant text content.
// Returns array of { line_count, char_count, text } — caller decides
// whether to persist text per manifest.capture_insight_text.
export function extractInsightsFromJsonl(jsonlPath) {
  const found = [];
  let content;
  try { content = readFileSync(jsonlPath, "utf8"); } catch { return found; }
  const insightRe = /`?★ Insight ─+`?\n([\s\S]*?)\n`?─{20,}`?/g;
  for (const line of content.split("\n")) {
    if (!line.trim()) continue;
    try {
      const d = JSON.parse(line);
      if (d?.message?.role !== "assistant") continue;
      let text = d.message.content;
      if (Array.isArray(text)) {
        text = text.filter(c => c?.type === "text").map(c => c.text || "").join("\n");
      }
      if (typeof text !== "string" || !text.includes("★ Insight")) continue;
      insightRe.lastIndex = 0;
      let m;
      while ((m = insightRe.exec(text)) !== null) {
        const body = m[1];
        found.push({
          line_count: body.split("\n").length,
          char_count: body.length,
          text: body,
        });
      }
    } catch {}
  }
  return found;
}

// Active phase = most-recent pipeline.phase.start whose matching
// pipeline.phase.end has not yet been emitted.
export function readActivePhase(eventsPath) {
  if (!existsSync(eventsPath)) return null;
  let content;
  try { content = readFileSync(eventsPath, "utf8"); } catch { return null; }
  const open = new Map();
  for (const line of content.split("\n")) {
    if (!line.trim()) continue;
    try {
      const e = JSON.parse(line);
      if (e.event === "pipeline.phase.start" && typeof e.phase === "string") {
        open.set(e.phase, e.ts || "");
      } else if (e.event === "pipeline.phase.end" && typeof e.phase === "string") {
        open.delete(e.phase);
      }
    } catch {}
  }
  if (open.size === 0) return null;
  let latest = null, latestTs = "";
  for (const [p, ts] of open) {
    if (ts >= latestTs) { latest = p; latestTs = ts; }
  }
  return latest;
}

export function findPhaseForTs(intervals, ts) {
  if (!ts) return null;
  for (const iv of intervals) {
    if (iv.start_ts <= ts && (iv.end_ts === null || ts <= iv.end_ts)) {
      return iv.phase;
    }
  }
  return null;
}
