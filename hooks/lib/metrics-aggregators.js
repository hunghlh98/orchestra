// hooks/lib/metrics-aggregators.js
// Aggregators that write derived metric artifacts. Each function takes a
// hook-stdin-like input + cwd and produces one file under
// <cwd>/.orchestra/metrics/. Pure-ish: filesystem writes are the only side
// effect; no stdout/stderr from this module.
//
// Aggregators:
//   emitSubagentTokens       — tokens.jsonl row on SubagentStop
//   emitWorkflowSwarmTokens  — tokens.jsonl rows for Workflow-path agents on Stop
//   emitInsightsForSession   — insights.jsonl rows (per ★ Insight)
//   emitRunSummary           — runs/<run-id>.json on parent Stop
//   emitCostByPhase          — cost-by-phase.json on parent Stop

import { existsSync, mkdirSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { safeAppend, safeWrite } from "./safe-fs.js";
import { computeUsd } from "./rate-card.js";
import {
  readJsonl, sumTokensInJsonl,
  findPhaseForTs, getProjectSessionsDir,
  extractInsightsFromJsonl,
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

// === workflow-agent tokens.jsonl rows on parent Stop ===
// The Phase-3 preferred path dispatches the swarm as ONE native Workflow; its
// agent() spawns run in the workflow runtime and fire no SubagentStop, so
// emitSubagentTokens never sees them and the spec-draft swarm cost goes
// unrecorded. Harvest their transcripts —
// <sessionsDir>/<sid>/subagents/workflows/<wf-id>/agent-*.jsonl — and emit one
// subagent.tokens row each. Idempotent: parent Stop fires once per turn, so
// skip any agent sid already in tokens.jsonl.
export function emitWorkflowSwarmTokens(input) {
  const cwd = input.cwd || process.cwd();
  const sid = input.session_id || "";
  if (!sid) return;
  const wfRoot = join(getProjectSessionsDir(cwd), sid, "subagents", "workflows");
  if (!existsSync(wfRoot)) return;

  const metricsDir = join(cwd, ".orchestra/metrics");
  const tokensPath = join(metricsDir, "tokens.jsonl");
  const seen = new Set();
  if (existsSync(tokensPath)) {
    for (const r of readJsonl(tokensPath)) {
      if (r.subagent_session_id) seen.add(r.subagent_session_id);
    }
  }

  let wfDirs;
  try { wfDirs = readdirSync(wfRoot).filter(f => /^wf_/.test(f)); }
  catch { return; }

  const rows = [];
  for (const wf of wfDirs) {
    const wfDir = join(wfRoot, wf);
    let files;
    try { files = readdirSync(wfDir).filter(f => /^agent-[a-f0-9]+\.jsonl$/i.test(f)); }
    catch { continue; }
    for (const f of files) {
      const agentSid = f.replace(/\.jsonl$/, "");
      if (seen.has(agentSid)) continue;
      seen.add(agentSid);
      const path = join(wfDir, f);
      const tokens = sumTokensInJsonl(path);
      if (tokens.turns === 0) continue;

      let role = "workflow";
      try {
        const meta = JSON.parse(readFileSync(join(wfDir, `${agentSid}.meta.json`), "utf8"));
        if (typeof meta.agentType === "string" && meta.agentType.length) {
          role = meta.agentType.replace(/^orchestra:/, "") || "workflow";
        }
      } catch {}

      let ts;
      try { ts = new Date(statSync(path).mtimeMs).toISOString(); }
      catch { ts = new Date().toISOString(); }

      rows.push({
        ts, event: "subagent.tokens",
        run_id: sid,
        subagent_session_id: agentSid,
        agent_role: role,
        agent_turn: null,
        workflow_id: wf,
        tokens,
        usd: computeUsd(tokens),
      });
    }
  }
  if (rows.length === 0) return;
  if (!existsSync(metricsDir)) mkdirSync(metricsDir, { recursive: true });
  for (const row of rows) safeAppend(tokensPath, JSON.stringify(row));
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
  let intent = intentEvent?.intent || null;
  let confidence = intentEvent?.confidence || null;
  let pattern = intentEvent?.pattern || null;
  let autonomyLevel = intentEvent?.autonomy_level || null;
  let featureId = intentEvent?.feature_id || null;

  // Fallback for reverse-pass runs (no intent.yaml authored): lift from the
  // most-recent local.bootstrapped event. Feature-id scalar resolves only when
  // exactly one feature was authored; multi-feature runs leave it null.
  if (!autonomyLevel) {
    const localEvents = runEvents.filter(e => e.event === "local.bootstrapped");
    const latest = localEvents[localEvents.length - 1];
    if (latest?.autonomy_level) autonomyLevel = latest.autonomy_level;
  }
  if (!featureId) {
    const featureIds = new Set(
      runEvents
        .filter(e => e.event === "artifact.written" && e.feature_id)
        .map(e => e.feature_id)
    );
    if (featureIds.size === 1) featureId = [...featureIds][0];
  }

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

  // Parent insights now emit BEFORE emitRunSummary in metrics-collector.js
  // main(), so insights.jsonl carries both subagent + parent rows by the time
  // this count runs.
  let insightsCount = 0;
  const insightsPath = join(metricsDir, "insights.jsonl");
  if (existsSync(insightsPath)) {
    for (const row of readJsonl(insightsPath)) {
      if (row.run_id === sessionId) insightsCount += 1;
    }
  }

  const warnings = detectStaggeredCohort(runEvents).filter(w => w.run_id === sessionId);

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
    warnings,
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
  const byPhaseRole = {};
  const rows = existsSync(tokensPath) ? readJsonl(tokensPath) : [];
  for (const row of rows) {
    const phase = findPhaseForTs(intervals[row.run_id] || [], row.ts) || "unknown";
    const role = row.agent_role || "unknown";
    const t = row.tokens || {};

    if (!byPhase[phase]) {
      byPhase[phase] = { tokens: { input: 0, output: 0, cache_read: 0, cache_create: 0 } };
    }
    byPhase[phase].tokens.input += t.input || 0;
    byPhase[phase].tokens.output += t.output || 0;
    byPhase[phase].tokens.cache_read += t.cache_read || 0;
    byPhase[phase].tokens.cache_create += t.cache_create || 0;

    const composedKey = `${phase}.${role}`;
    if (!byPhaseRole[composedKey]) {
      byPhaseRole[composedKey] = {
        phase, agent_role: role,
        tokens: { input: 0, output: 0, cache_read: 0, cache_create: 0 },
      };
    }
    byPhaseRole[composedKey].tokens.input += t.input || 0;
    byPhaseRole[composedKey].tokens.output += t.output || 0;
    byPhaseRole[composedKey].tokens.cache_read += t.cache_read || 0;
    byPhaseRole[composedKey].tokens.cache_create += t.cache_create || 0;
  }
  for (const k of Object.keys(byPhase)) {
    byPhase[k].cost_usd = computeUsd(byPhase[k].tokens);
  }
  for (const k of Object.keys(byPhaseRole)) {
    byPhaseRole[k].cost_usd = computeUsd(byPhaseRole[k].tokens);
  }

  const out = {
    schema_version: 1,
    generated_at: new Date().toISOString(),
    by_phase: byPhase,
    by_phase_role: byPhaseRole,
  };
  safeWrite(join(metricsDir, "cost-by-phase.json"), JSON.stringify(out, null, 2) + "\n");
}

// detectStaggeredCohort — groups task.subagent.invoked rows by
// (run_id, phase, agent_role). Cohorts of >=2 spawns spanning more than
// thresholdMs from first to last surface as a warning row. Honours
// `parallel-spawn-discipline` rule from commands/orchestra.md S4.
export function detectStaggeredCohort(events, thresholdMs = 2000) {
  const groups = new Map();
  for (const e of events) {
    if (e.event !== "task.subagent.invoked") continue;
    if (!e.run_id || !e.ts || !e.agent_role) continue;
    const phase = e.phase || "unknown";
    const key = `${e.run_id}::${phase}::${e.agent_role}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(e);
  }
  const warnings = [];
  for (const [key, list] of groups) {
    if (list.length < 2) continue;
    list.sort((a, b) => a.ts.localeCompare(b.ts));
    const first = Date.parse(list[0].ts);
    const last = Date.parse(list[list.length - 1].ts);
    const stagger = last - first;
    if (stagger > thresholdMs) {
      const [run_id, phase, agent_role] = key.split("::");
      warnings.push({
        event: "cohort.spawn.staggered",
        run_id, phase, agent_role,
        cohort_size: list.length,
        max_stagger_ms: stagger,
        first_ts: list[0].ts,
        last_ts: list[list.length - 1].ts,
      });
    }
  }
  return warnings;
}
