#!/usr/bin/env node
// scripts/tests/post-write-puml.test.js
// Contract: post-write-puml is an observer (PostToolUse). It MUST NEVER
// block a write, regardless of plantuml binary state or render outcome.
// Opt-out exits silently; non-.puml writes are no-ops; missing plantuml
// surfaces a stderr warning but stdout stays empty.

import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SCRIPT = resolve(root, "hooks/scripts/post-write-puml.js");

let failures = 0, passes = 0;
const check = (cond, msg) => cond ? passes++ : (failures++, console.error(`  FAIL: ${msg}`));

function setupSandbox(label) {
  const tmp = mkdtempSync(join(tmpdir(), `orchestra-post-write-puml-${label}-`));
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
console.log("post-write-puml — opt-out exits silently:");
{
  const r = runHook(
    { hook_event_name: "PostToolUse", tool_name: "Write", tool_input: { file_path: "/tmp/x.puml" } },
    { ORCHESTRA_HOOK_POST_WRITE_PUML: "off" },
  );
  check(r.status === 0, `opt-out exits 0`);
  check(r.stdout === "", `opt-out emits no stdout`);
}

// ---------- Non-.puml ignored ----------
console.log("post-write-puml — non-.puml file is ignored:");
{
  const sb = setupSandbox("non-puml");
  try {
    const target = join(sb.cwdDir, "README.md");
    writeFileSync(target, "# readme\n");
    const r = runHook({
      hook_event_name: "PostToolUse",
      tool_name: "Write",
      tool_input: { file_path: target, content: "# readme\n" },
    });
    check(r.status === 0, `non-.puml exits 0`);
    check(r.stdout === "", `non-.puml emits no stdout`);
  } finally { rmSync(sb.tmp, { recursive: true, force: true }); }
}

// ---------- .puml write never blocks ----------
console.log("post-write-puml — .puml write never blocks (observer contract):");
{
  const sb = setupSandbox("puml");
  try {
    const target = join(sb.cwdDir, "diagram.puml");
    writeFileSync(target, "@startuml\nAlice -> Bob\n@enduml\n");
    const r = runHook({
      hook_event_name: "PostToolUse",
      tool_name: "Write",
      tool_input: { file_path: target, content: "@startuml\nAlice -> Bob\n@enduml\n" },
    });
    check(r.status === 0, `PostToolUse always exits 0 (observer)`);
    check(!/"decision":"block"/.test(r.stdout), `never emits decision:"block"`);
  } finally { rmSync(sb.tmp, { recursive: true, force: true }); }
}

if (failures > 0) {
  console.error(`post-write-puml.test.js: FAIL (${passes} passed, ${failures} failed)`);
  process.exit(1);
}
console.log(`post-write-puml.test.js: OK (${passes} assertions passed)`);
