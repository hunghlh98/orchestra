#!/usr/bin/env node
// scripts/tests/report.test.js
// Stream 7 reporter smoke test: synthesize events.jsonl + tokens.jsonl +
// runs/<id>.json, run orchestra-report.js against them, assert output files.

import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const reporter = resolve(root, "scripts/orchestra-report.js");
let passes = 0, failures = 0;

function check(cond, msg) {
  if (cond) passes++;
  else { failures++; console.error(`  FAIL: ${msg}`); }
}

console.log("orchestra-report smoke:");
const tmp = mkdtempSync(join(tmpdir(), "orchestra-report-"));
const metricsDir = join(tmp, ".orchestra/metrics");
mkdirSync(metricsDir, { recursive: true });
mkdirSync(join(metricsDir, "runs"), { recursive: true });
const runId = "smoke-1";

const events = [
  { ts: "2026-05-08T10:00:00.000Z", event: "prompt.submitted", run_id: runId, matched_orchestra: true },
  { ts: "2026-05-08T10:00:01.000Z", event: "task.subagent.invoked", run_id: runId, subagent_type: "orchestra:lead", agent_role: "lead", phase: "component" },
  { ts: "2026-05-08T10:00:30.000Z", event: "subagent.stopped", run_id: runId, subagent_session_id: "sa-1", agent_role: "lead" },
  { ts: "2026-05-08T10:00:31.000Z", event: "task.subagent.invoked", run_id: runId, subagent_type: "orchestra:backend", agent_role: "backend", phase: "implement-be" },
  { ts: "2026-05-08T10:01:30.000Z", event: "subagent.stopped", run_id: runId, subagent_session_id: "sa-2", agent_role: "backend" },
];
const tokens = [
  { ts: "2026-05-08T10:00:30.000Z", event: "subagent.tokens", run_id: runId, subagent_session_id: "sa-1", agent_role: "lead", tokens: { input: 50000, output: 10000, cache_read: 0, cache_create: 0, turns: 5 } },
  { ts: "2026-05-08T10:01:30.000Z", event: "subagent.tokens", run_id: runId, subagent_session_id: "sa-2", agent_role: "backend", tokens: { input: 100000, output: 25000, cache_read: 0, cache_create: 0, turns: 12 } },
];
const run = {
  run_id: runId,
  started_at: "2026-05-08T10:00:00.000Z",
  ended_at: "2026-05-08T10:02:00.000Z",
  duration_seconds: 120,
  status: "completed",
  agents_spawned: ["@lead", "@backend"],
  artifacts_produced: ["TDD-001.md", "openapi.yaml"],
  tokens: { input: 150000, output: 35000, cache_read: 0, cache_create: 0 },
  cost_usd: 4.875,
};

writeFileSync(join(metricsDir, "events.jsonl"), events.map(e => JSON.stringify(e)).join("\n") + "\n");
writeFileSync(join(metricsDir, "tokens.jsonl"), tokens.map(t => JSON.stringify(t)).join("\n") + "\n");
writeFileSync(join(metricsDir, "runs", `${runId}.json`), JSON.stringify(run, null, 2) + "\n");

const outDir = join(tmp, "out");
const r = spawnSync("node", [reporter, "--metrics-dir", metricsDir, "--out", outDir, "--run-id", runId], { encoding: "utf8" });

try {
  check(r.status === 0, `exit 0 (got ${r.status}; stderr: ${r.stderr})`);
  check(existsSync(join(outDir, "gantt.svg")), `gantt.svg created`);
  check(existsSync(join(outDir, "cost-by-role.json")), `cost-by-role.json created`);
  check(existsSync(join(outDir, "cost-by-phase.json")), `cost-by-phase.json created`);
  check(existsSync(join(outDir, "warnings.json")), `warnings.json created`);
  check(existsSync(join(outDir, "summary.json")), `summary.json created`);

  const role = JSON.parse(readFileSync(join(outDir, "cost-by-role.json"), "utf8"));
  check(Array.isArray(role) && role.length === 2, `cost-by-role has 2 entries (got ${role.length})`);
  const backend = role.find(r => r.agent_role === "backend");
  check(backend?.tokens?.input === 100000, `backend input tokens summed (got ${backend?.tokens?.input})`);
  check(typeof backend?.cost_usd === "number" && backend.cost_usd > 0, `backend cost_usd numeric and positive`);

  const phase = JSON.parse(readFileSync(join(outDir, "cost-by-phase.json"), "utf8"));
  check(Array.isArray(phase) && phase.length === 2, `cost-by-phase has 2 entries (got ${phase.length})`);
  const implBe = phase.find(p => p.phase === "implement-be");
  check(implBe?.tokens?.input === 100000, `phase implement-be lifted via sid join (got ${implBe?.tokens?.input})`);

  const warnings = JSON.parse(readFileSync(join(outDir, "warnings.json"), "utf8"));
  check(Array.isArray(warnings.readers_violations), `readers_violations array present`);
  check(Array.isArray(warnings.src_purity_violations), `src_purity_violations array present`);
  check(warnings.readers_violations.length === 0, `no readers warnings in synthetic input`);
  check(warnings.src_purity_violations.length === 0, `no src-purity warnings in synthetic input`);

  const gantt = readFileSync(join(outDir, "gantt.svg"), "utf8");
  check(gantt.startsWith("<?xml"), `gantt.svg is XML`);
  check(gantt.includes("lead"), `gantt rows include lead role`);
  check(gantt.includes("backend"), `gantt rows include backend role`);

  const stdoutText = r.stdout || "";
  check(stdoutText.includes(runId), `stdout summary mentions run id`);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}

if (failures) {
  console.error(`test-report.js: FAIL (${failures} of ${passes + failures} assertions)`);
  process.exit(1);
}
console.log(`test-report.js: OK (${passes} assertions passed)`);
