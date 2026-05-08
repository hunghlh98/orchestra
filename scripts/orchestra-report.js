#!/usr/bin/env node
// scripts/orchestra-report.js
// Stream 7 R7.6 reporter — reads events.jsonl + tokens.jsonl + runs/*.json
// from <cwd>/.orchestra/metrics/, emits Gantt timeline (.svg) + role/phase
// pivots (.json) + non-blocking readers / business-code-purity summaries.
// Cadence: on /orchestra report invocation. Never blocks.
//
// CLI:
//   node scripts/orchestra-report.js --metrics-dir <path> --out <dir> [--run-id <id>]
//
// Output layout:
//   <out>/gantt.svg
//   <out>/cost-by-role.json
//   <out>/cost-by-phase.json
//   <out>/warnings.json   (readers + src-purity summaries; empty arrays when none)
//   <out>/summary.json    (run-level snapshot lifted from runs/<id>.json)
//
// Joins:
//   events.jsonl.task.subagent.invoked.subagent_session_id ↔
//     tokens.jsonl.subagent_session_id   (R7.3)
//   events.jsonl.subagent.stopped.subagent_session_id ↔ same.
//
// Empty inputs are tolerated — reporter writes empty pivots and exits 0.

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { computeUsd } from "../hooks/lib/rate-card.js";

function parseArgs(argv) {
  const args = { metricsDir: null, out: null, runId: null };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--metrics-dir") args.metricsDir = argv[++i];
    else if (a === "--out") args.out = argv[++i];
    else if (a === "--run-id") args.runId = argv[++i];
  }
  return args;
}

function readJsonl(path) {
  if (!existsSync(path)) return [];
  const result = [];
  for (const line of readFileSync(path, "utf8").split("\n")) {
    if (!line.trim()) continue;
    try { result.push(JSON.parse(line)); } catch {}
  }
  return result;
}

function pickRun(runs, runId) {
  if (runId) return runs.find(r => r.run_id === runId) || null;
  // Default: latest by ended_at.
  if (runs.length === 0) return null;
  return runs.sort((a, b) => (b.ended_at || "").localeCompare(a.ended_at || ""))[0];
}

function loadRuns(metricsDir) {
  const runsDir = join(metricsDir, "runs");
  if (!existsSync(runsDir)) return [];
  return readdirSync(runsDir)
    .filter(f => f.endsWith(".json"))
    .map(f => {
      try { return JSON.parse(readFileSync(join(runsDir, f), "utf8")); }
      catch { return null; }
    })
    .filter(Boolean);
}

// Build per-subagent intervals: invoked.ts → stopped.ts.
// invoked carries phase + agent_role; stopped carries subagent_session_id.
// Join by chronological adjacency within run_id (orchestra runs subagents
// sequentially per parent). For runs with parallel fan-out, join by ts proximity.
function buildIntervals(events, runId) {
  const runEvents = events.filter(e => e.run_id === runId);
  const invokes = runEvents.filter(e => e.event === "task.subagent.invoked");
  const stops = runEvents.filter(e => e.event === "subagent.stopped");
  const intervals = [];
  // Pair: each invoke with the next stop after it whose subagent_session_id
  // hasn't been claimed yet. When stop has no sid (legacy events), pair
  // positionally.
  const usedStops = new Set();
  for (const inv of invokes) {
    const startTs = inv.ts;
    const candidates = stops.filter((s, i) => !usedStops.has(i) && s.ts >= startTs);
    if (candidates.length === 0) continue;
    const stop = candidates[0];
    const stopIdx = stops.indexOf(stop);
    usedStops.add(stopIdx);
    intervals.push({
      agent_role: inv.agent_role || "unknown",
      phase: inv.phase || null,
      subagent_session_id: stop.subagent_session_id || null,
      start: startTs,
      end: stop.ts,
      duration_ms: Date.parse(stop.ts) - Date.parse(startTs),
    });
  }
  return intervals;
}

// Cost pivots: lift tokens.jsonl rows for the run, group.
function pivot(tokensRows, runId, key) {
  const grouped = new Map();
  for (const row of tokensRows) {
    if (row.run_id !== runId) continue;
    const k = row[key] || "unknown";
    if (!grouped.has(k)) grouped.set(k, { input: 0, output: 0, cache_read: 0, cache_create: 0, turns: 0 });
    const acc = grouped.get(k);
    acc.input += row.tokens?.input || 0;
    acc.output += row.tokens?.output || 0;
    acc.cache_read += row.tokens?.cache_read || 0;
    acc.cache_create += row.tokens?.cache_create || 0;
    acc.turns += row.tokens?.turns || 0;
  }
  const out = [];
  for (const [k, t] of grouped) {
    out.push({ [key]: k, tokens: t, cost_usd: computeUsd(t) });
  }
  return out.sort((a, b) => b.cost_usd - a.cost_usd);
}

// For phase pivot: join tokens.jsonl rows to events.jsonl invokes by
// subagent_session_id, lift `phase` from the invoke event.
function pivotByPhase(tokensRows, events, runId) {
  const invokesBySid = new Map();
  // task.subagent.invoked alone doesn't carry subagent_session_id — but we
  // can reconstruct via subagent.stopped (which does carry sid) + chronological
  // pairing identical to buildIntervals. Reuse the join.
  const intervals = buildIntervals(events, runId);
  const phaseBySid = new Map();
  for (const iv of intervals) {
    if (iv.subagent_session_id) phaseBySid.set(iv.subagent_session_id, iv.phase);
  }
  const grouped = new Map();
  for (const row of tokensRows) {
    if (row.run_id !== runId) continue;
    const phase = phaseBySid.get(row.subagent_session_id) || "unknown";
    if (!grouped.has(phase)) grouped.set(phase, { input: 0, output: 0, cache_read: 0, cache_create: 0, turns: 0 });
    const acc = grouped.get(phase);
    acc.input += row.tokens?.input || 0;
    acc.output += row.tokens?.output || 0;
    acc.cache_read += row.tokens?.cache_read || 0;
    acc.cache_create += row.tokens?.cache_create || 0;
    acc.turns += row.tokens?.turns || 0;
  }
  const out = [];
  for (const [phase, t] of grouped) {
    out.push({ phase, tokens: t, cost_usd: computeUsd(t) });
  }
  return out.sort((a, b) => b.cost_usd - a.cost_usd);
}

// Minimal SVG Gantt: one row per agent_role, time on X axis, bars colored
// by phase. Output is a self-contained .svg that opens in any browser.
function renderGantt(intervals) {
  if (intervals.length === 0) {
    return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="600" height="80"><text x="10" y="40">no subagent intervals</text></svg>\n`;
  }
  const minTs = Math.min(...intervals.map(i => Date.parse(i.start)));
  const maxTs = Math.max(...intervals.map(i => Date.parse(i.end)));
  const totalMs = Math.max(1, maxTs - minTs);
  const roles = [...new Set(intervals.map(i => i.agent_role))];
  const rowHeight = 28;
  const labelWidth = 120;
  const chartWidth = 720;
  const width = labelWidth + chartWidth + 20;
  const height = roles.length * rowHeight + 60;
  const phaseColors = {
    business: "#7e57c2", architecture: "#5c6bc0", component: "#42a5f5",
    boundary: "#26c6da", "implement-be": "#66bb6a", "implement-fe": "#9ccc65",
    "verify-plan": "#ffca28", "verify-evaluate": "#ffa726", "verify-review": "#ff7043",
    release: "#8d6e63", unknown: "#bdbdbd",
  };
  const lines = [`<?xml version="1.0" encoding="UTF-8"?>`,
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" font-family="ui-monospace, monospace" font-size="11">`];
  lines.push(`<text x="10" y="20" font-weight="bold">Orchestra Gantt — run window ${new Date(minTs).toISOString()} → ${new Date(maxTs).toISOString()}</text>`);
  for (let i = 0; i < roles.length; i++) {
    const y = 40 + i * rowHeight;
    lines.push(`<text x="10" y="${y + 14}">${escapeXml(roles[i])}</text>`);
    lines.push(`<line x1="${labelWidth}" y1="${y + rowHeight - 2}" x2="${labelWidth + chartWidth}" y2="${y + rowHeight - 2}" stroke="#eee"/>`);
  }
  for (const iv of intervals) {
    const rowIdx = roles.indexOf(iv.agent_role);
    const y = 40 + rowIdx * rowHeight + 4;
    const xStart = labelWidth + ((Date.parse(iv.start) - minTs) / totalMs) * chartWidth;
    const xEnd = labelWidth + ((Date.parse(iv.end) - minTs) / totalMs) * chartWidth;
    const w = Math.max(2, xEnd - xStart);
    const fill = phaseColors[iv.phase || "unknown"] || phaseColors.unknown;
    lines.push(`<rect x="${xStart.toFixed(1)}" y="${y}" width="${w.toFixed(1)}" height="18" fill="${fill}" opacity="0.85"><title>${escapeXml(iv.agent_role)} ${escapeXml(iv.phase || "no-phase")} — ${(iv.duration_ms / 1000).toFixed(1)}s</title></rect>`);
  }
  lines.push(`</svg>`);
  return lines.join("\n") + "\n";
}

function escapeXml(s) {
  return String(s).replace(/[<>&"']/g, c => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" })[c]);
}

// Reads `policy.warning` events emitted by hooks (currently absent until
// pre-write-check.js retools — Stream 9 follow-up). Reporter is forward-
// compatible: empty array when no events match.
function summarizeWarnings(events, runId) {
  const policyEvents = events.filter(e =>
    e.run_id === runId && e.event === "policy.warning"
  );
  const readers = policyEvents.filter(e => e.gate === "C").map(e => ({
    file: e.file_path,
    readers: e.readers,
    ts: e.ts,
  }));
  const srcPurity = policyEvents.filter(e => e.gate === "D").map(e => ({
    file: e.file_path,
    cite: e.cite_pattern,
    ts: e.ts,
  }));
  return { readers_violations: readers, src_purity_violations: srcPurity };
}

function main() {
  const args = parseArgs(process.argv);
  if (!args.metricsDir) {
    process.stderr.write("orchestra-report: --metrics-dir required\n");
    process.exit(2);
  }
  const eventsPath = join(args.metricsDir, "events.jsonl");
  const tokensPath = join(args.metricsDir, "tokens.jsonl");
  const events = readJsonl(eventsPath);
  const tokens = readJsonl(tokensPath);
  const runs = loadRuns(args.metricsDir);
  const run = pickRun(runs, args.runId);

  if (!run) {
    process.stderr.write(`orchestra-report: no runs found under ${args.metricsDir}/runs/\n`);
    // Still exit 0 — reporter is non-blocking.
    process.exit(0);
  }

  const runId = run.run_id;
  const outDir = args.out || join(args.metricsDir, "reports", runId);
  mkdirSync(outDir, { recursive: true });

  const intervals = buildIntervals(events, runId);
  const costByRole = pivot(tokens, runId, "agent_role");
  const costByPhase = pivotByPhase(tokens, events, runId);
  const warnings = summarizeWarnings(events, runId);

  writeFileSync(join(outDir, "gantt.svg"), renderGantt(intervals));
  writeFileSync(join(outDir, "cost-by-role.json"), JSON.stringify(costByRole, null, 2) + "\n");
  writeFileSync(join(outDir, "cost-by-phase.json"), JSON.stringify(costByPhase, null, 2) + "\n");
  writeFileSync(join(outDir, "warnings.json"), JSON.stringify(warnings, null, 2) + "\n");
  writeFileSync(join(outDir, "summary.json"), JSON.stringify(run, null, 2) + "\n");

  // Stdout: terse human summary.
  const totalCost = costByRole.reduce((s, r) => s + r.cost_usd, 0);
  process.stdout.write(`orchestra-report: run ${runId} (${run.status || "?"}) — ${run.duration_seconds}s, ${intervals.length} subagent intervals, $${totalCost.toFixed(4)} total\n`);
  process.stdout.write(`  out: ${outDir}\n`);
  if (warnings.readers_violations.length > 0) {
    process.stdout.write(`  ⚠ readers-scope warnings: ${warnings.readers_violations.length}\n`);
  }
  if (warnings.src_purity_violations.length > 0) {
    process.stdout.write(`  ⚠ src-purity warnings: ${warnings.src_purity_violations.length}\n`);
  }
}

main();
