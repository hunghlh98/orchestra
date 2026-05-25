#!/usr/bin/env node
// scripts/tests/orchestra-preflight.test.js
// Contract: orchestra-preflight emits <orchestra-preflight> YAML to stdout
// when prompt starts with /orchestra; silent on non-matching prompts and
// when ORCHESTRA_HOOK_PREFLIGHT=off.

import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SCRIPT = resolve(root, "hooks/scripts/orchestra-preflight.js");

let failures = 0, passes = 0;
const check = (cond, msg) => cond ? passes++ : (failures++, console.error(`  FAIL: ${msg}`));

function setupSandbox(label) {
  const tmp = mkdtempSync(join(tmpdir(), `orchestra-preflight-${label}-`));
  const cwdDir = join(tmp, "project");
  mkdirSync(cwdDir, { recursive: true });
  return { tmp, cwdDir };
}

function runHook(input, env = {}) {
  return spawnSync("node", [SCRIPT], {
    input: JSON.stringify(input),
    encoding: "utf8",
    env: { ...process.env, ...env },
  });
}

// ---------- Opt-out ----------
console.log("orchestra-preflight — opt-out exits silently:");
{
  const r = runHook(
    { hook_event_name: "UserPromptSubmit", prompt: "/orchestra spec-to-code", cwd: "/tmp" },
    { ORCHESTRA_HOOK_PREFLIGHT: "off" },
  );
  check(r.status === 0, `opt-out exits 0`);
  check(r.stdout === "", `opt-out emits no stdout`);
}

// ---------- Non-matching prompt ----------
console.log("orchestra-preflight — non-/orchestra prompt is ignored:");
{
  const sb = setupSandbox("non-match");
  try {
    const r = runHook({
      hook_event_name: "UserPromptSubmit",
      prompt: "hello world",
      cwd: sb.cwdDir,
    });
    check(r.status === 0, `non-match exits 0`);
    check(!/<orchestra-preflight>/.test(r.stdout), `non-match emits no preflight block`);
  } finally { rmSync(sb.tmp, { recursive: true, force: true }); }
}

// ---------- /orchestra prompt emits block ----------
console.log("orchestra-preflight — /orchestra prompt emits <orchestra-preflight> block:");
{
  const sb = setupSandbox("match");
  try {
    const r = runHook({
      hook_event_name: "UserPromptSubmit",
      prompt: "/orchestra spec-to-code",
      cwd: sb.cwdDir,
    });
    check(r.status === 0, `matched prompt exits 0`);
    check(/<orchestra-preflight>/.test(r.stdout), `stdout contains <orchestra-preflight>`);
    check(/<\/orchestra-preflight>/.test(r.stdout), `block is closed`);
  } finally { rmSync(sb.tmp, { recursive: true, force: true }); }
}

if (failures > 0) {
  console.error(`orchestra-preflight.test.js: FAIL (${passes} passed, ${failures} failed)`);
  process.exit(1);
}
console.log(`orchestra-preflight.test.js: OK (${passes} assertions passed)`);
