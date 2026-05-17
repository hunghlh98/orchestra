// hooks/lib/metrics-aggregators.js
// Aggregators that write derived metric artifacts. Each function takes a
// hook-stdin-like input + cwd and produces one file under
// <cwd>/.orchestra/metrics/. Pure-ish: filesystem writes are the only side
// effect; no stdout/stderr from this module.
//
// Three aggregators:
//   emitSubagentTokens   — tokens.jsonl row on SubagentStop
//   emitInsightsForSession — insights.jsonl rows (per ★ Insight)
//   emitRunSummary       — runs/<run-id>.json on parent Stop
//   emitCostByPhase      — cost-by-phase.json on parent Stop

import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { safeAppend, safeWrite } from "./safe-fs.js";
import { computeUsd } from "./rate-card.js";
import {
  readJsonl, sumTokensInJsonl, extractInsightsFromJsonl,
  findPhaseForTs, getProjectSessionsDir,
} from "./jsonl-emit.js";
import { ensureManifest, readPluginVersion } from "./redaction.js";

// === tokens.jsonl row on SubagentStop ===
export function emitSubagentTokens(input, sub) {
  if (!sub) return null;
  const tokens = sumTokensInJsonl(sub.path);
  if (tokens.turns === 0) return null;

  const cwd = input.cwd || process.cwd();
  const parentId = input.session_id || "";
  const row = {
    ts: new Date().toISOString(),
    event: "subagent.tokens",
    run_id: parentId,
    subagent_session_id: sub.sid,
    agent_role: sub.role,
    agent_turn: sub.ord,
    tokens,
    usd: computeUsd(tokens),
  };

  const dir = join(cwd, ".orchestra/metrics");
  const path = join(dir, "tokens.jsonl");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  safeAppend(path, JSON.stringify(row));

  return { sid: sub.sid, path: sub.path, role: sub.role };
}

// === insights.jsonl rows for one session ===
// Default: body text captured. Set manifest.capture_insight_text:false to
// redact text to null (structural fields stay regardless).
export function emitInsightsForSession(input, sessionPath, sessionId, role) {
  if (!existsSync(sessionPath)) return 0;
  const cwd = input.cwd || process.cwd();
  const runId = input.session_id || "";
  const metricsDir = join(cwd, ".orchestra/metrics");
  if (!existsSync(metricsDir)) mkdirSync(metricsDir, { recursive: true });
  const manifest = ensureManifest(metricsDir);

  const insights = extractInsightsFromJsonl(sessionPath);
  if (insights.length === 0) return 0;

  const insightsPath = join(metricsDir, "insights.jsonl");
  const ts = new Date().toISOString();
  for (let i = 0; i < insights.length; i++) {
    const ins = insights[i];
    const row = {
      ts, event: "insight.emitted",
      run_id: runId,
      session_id: sessionId,
      agent_role: role,
      insight_index: i + 1,
      line_count: ins.line_count,
      char_count: ins.char_count,
      text: manifest.capture_insight_text ? ins.text : null,
    };
    safeAppend(insightsPath, JSON.stringify(row));
  }
  return insights.length;
}

// === runs/<run-id>.json on parent Stop ===
// Aggregates events.jsonl + tokens.jsonl + the parent's own session jsonl
// into the harvest unit consumers ship to the plugin author.
export function emitRunSummary(input) {
  const cwd = input.cwd || process.cwd();
  const sessionId = input.session_id || "";
  if (!sessionId) return;

  const metricsDir = join(cwd, ".orchestra/metrics");
  const eventsPath = join(metricsDir, "events.jsonl");
  if (!existsSync(eventsPath)) return;

  const events = readJsonl(eventsPath);

  // Confirm this is a parent /orchestra dispatcher Stop (not a subagent stop).
  const promptStart = events.find(e =>
    e.event === "prompt.submitted" &&
    e.run_id === sessionId &&
    e.matched_orchestra === true
  );
  if (!promptStart) return;

  const startedAt = promptStart.ts;
  const endedAt = new Date().toISOString();
  const durationSeconds = Math.round(
    (Date.parse(endedAt) - Date.parse(startedAt)) / 1000
  );

  const runEvents = events.filter(e => e.ts >= startedAt && e.ts <= endedAt);

  const intentEvent = runEvents.find(e =>
    e.event === "artifact.written" && e.file_name === "intent.yaml"
  );
  const intent = intentEvent?.intent || null;
  const confidence = intentEvent?.confidence || null;
  const pattern = intentEvent?.pattern || null;
  const autonomyLevel = intentEvent?.autonomy_level || null;
  const featureId = intentEvent?.feature_id || null;

  // agent_role is reliably present (deriveAgentRole fills it from
  // subagent_type or @name) even when agent_name is null.
  const agentsSpawned = [...new Set(
    runEvents
      .filter(e => e.event === "task.subagent.invoked" && e.agent_role)
      .map(e => e.agent_role)
  )];

  const artifactsProduced = [...new Set(
    runEvents
      .filter(e => e.event === "artifact.written" && e.file_name)
      .map(e => e.file_name)
  )];

  const verdictWritten = artifactsProduced.some(n => /^VERDICT-/.test(n));
  const codeReviewWritten = artifactsProduced.some(n => /^CODE-REVIEW-/.test(n));
  const deadlocked = artifactsProduced.some(n => /^DEADLOCK/.test(n));
  const gates = {
    verdict: verdictWritten ? "produced" : "pending",
    code_review: codeReviewWritten ? "produced" : "pending",
    passing_score: null,
  };

  const tokens = { input: 0, output: 0, cache_read: 0, cache_create: 0 };
  const parentJsonl = join(getProjectSessionsDir(cwd), `${sessionId}.jsonl`);
  if (existsSync(parentJsonl)) {
    const t = sumTokensInJsonl(parentJsonl);
    tokens.input += t.input;
    tokens.output += t.output;
    tokens.cache_read += t.cache_read;
    tokens.cache_create += t.cache_create;
  }
  const tokensJsonl = join(metricsDir, "tokens.jsonl");
  if (existsSync(tokensJsonl)) {
    for (const row of readJsonl(tokensJsonl)) {
      if (row.run_id !== sessionId) continue;
      tokens.input += row.tokens?.input || 0;
      tokens.output += row.tokens?.output || 0;
      tokens.cache_read += row.tokens?.cache_read || 0;
      tokens.cache_create += row.tokens?.cache_create || 0;
    }
  }

  // The parent's Stop emission fires AFTER emitRunSummary in main(), so the
  // parent's own insights aren't on disk yet — only subagent insights are
  // counted here. Aggregators downstream pick up the late arrivals.
  let insightsCount = 0;
  const insightsPath = join(metricsDir, "insights.jsonl");
  if (existsSync(insightsPath)) {
    for (const row of readJsonl(insightsPath)) {
      if (row.run_id === sessionId) insightsCount += 1;
    }
  }

  const escalated = artifactsProduced.some(n => /^ESCALATE/.test(n));
  const status = deadlocked ? "deadlocked" : (escalated ? "aborted" : "completed");

  const summary = {
    run_id: sessionId,
    started_at: startedAt,
    ended_at: endedAt,
    duration_seconds: durationSeconds,
    status,
    intent, confidence, pattern,
    autonomy_level: autonomyLevel,
    feature_id: featureId,
    agents_spawned: agentsSpawned,
    artifacts_produced: artifactsProduced,
    gates,
    tokens,
    cost_usd: computeUsd(tokens),
    insights_count: insightsCount,
    deadlocked,
    plugin_version: readPluginVersion(),
  };

  const runsDir = join(metricsDir, "runs");
  if (!existsSync(runsDir)) mkdirSync(runsDir, { recursive: true });
  safeWrite(join(runsDir, `${sessionId}.json`), JSON.stringify(summary, null, 2) + "\n");
}

// === cost-by-phase.json on parent Stop ===
// Walks events.jsonl to build per-run phase intervals, then assigns each
// subagent.tokens row to the interval-containing-its-ts. Tokens outside
// any interval bucket under "unknown".
export function emitCostByPhase(input) {
  const cwd = input.cwd || process.cwd();
  const metricsDir = join(cwd, ".orchestra/metrics");
  const eventsPath = join(metricsDir, "events.jsonl");
  const tokensPath = join(metricsDir, "tokens.jsonl");
  if (!existsSync(eventsPath)) return;

  const intervals = {};
  for (const e of readJsonl(eventsPath)) {
    if (!e.run_id || !e.ts || typeof e.phase !== "string") continue;
    if (e.event === "pipeline.phase.start") {
      if (!intervals[e.run_id]) intervals[e.run_id] = [];
      intervals[e.run_id].push({ phase: e.phase, start_ts: e.ts, end_ts: null });
    } else if (e.event === "pipeline.phase.end") {
      const list = intervals[e.run_id] || [];
      for (let i = list.length - 1; i >= 0; i--) {
        if (list[i].phase === e.phase && list[i].end_ts === null) {
          list[i].end_ts = e.ts;
          break;
        }
      }
    }
  }

  const byPhase = {};
  const rows = existsSync(tokensPath) ? readJsonl(tokensPath) : [];
  for (const row of rows) {
    const phase = findPhaseForTs(intervals[row.run_id] || [], row.ts) || "unknown";
    if (!byPhase[phase]) {
      byPhase[phase] = { tokens: { input: 0, output: 0, cache_read: 0, cache_create: 0 } };
    }
    const t = row.tokens || {};
    byPhase[phase].tokens.input += t.input || 0;
    byPhase[phase].tokens.output += t.output || 0;
    byPhase[phase].tokens.cache_read += t.cache_read || 0;
    byPhase[phase].tokens.cache_create += t.cache_create || 0;
  }
  for (const k of Object.keys(byPhase)) {
    byPhase[k].cost_usd = computeUsd(byPhase[k].tokens);
  }

  const out = {
    schema_version: 1,
    generated_at: new Date().toISOString(),
    by_phase: byPhase,
  };
  safeWrite(join(metricsDir, "cost-by-phase.json"), JSON.stringify(out, null, 2) + "\n");
}
