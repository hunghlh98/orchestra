#!/usr/bin/env node
// scripts/test-hooks.js
// Hook contract tests for v4.0:
//   - yaml-mini round-trip (frontmatter parser, formerly lockfile parser)
//   - pre-write-check.js: secrets matcher + 4 new gates
//       Gate-A — frontmatter status: locked rejects writes
//       Gate-B — frontmatter sections: all-locked rejects writes
//       Gate-C — frontmatter readers: emits non-blocking warning to stderr
//       Gate-D — §7.28 src/ cite denylist; exit 2 on hit when target is business src/
//   - post-bash-lint (Observer)
//   - val-calibration (Rewriter — calibration source at scripts/evaluator-tuning/)
//   - hooks.json matcher validation
//   - orchestra.md v4.0 decision-tree + chain-rigor + subcommand fixture

import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { parse, serialize } from "../hooks/lib/yaml-mini.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
let failures = 0;
let passes = 0;

function check(cond, msg) {
  if (cond) { passes++; }
  else { failures++; console.error(`  FAIL: ${msg}`); }
}

function runHook(scriptPath, input, env = {}) {
  return spawnSync("node", [scriptPath], {
    input: JSON.stringify(input),
    encoding: "utf8",
    env: { ...process.env, ...env },
  });
}

function withTmp(label, fn) {
  const tmp = mkdtempSync(join(tmpdir(), `orchestra-hooks-${label}-`));
  try { fn(tmp); }
  finally { rmSync(tmp, { recursive: true, force: true }); }
}

// ---------- yaml-mini round-trip (frontmatter shapes) ----------
console.log("yaml-mini:");
const ymCases = [
  `id: PRD-001\ntype: PRD\nrevision: 3\n`,
  `status: draft\nverdict: pending\nreaders:\n  - "@architect"\n  - "@lead"\n`,
  `sections:\n  S-VISION-001:\n    writer: "@product"\n    status: locked\n  S-NFR-001:\n    writer: "@product"\n    status: in_progress\n`,
  `id: SAD\ntype: SAD\nrevision: 1\nstatus: locked\nproject_mode: greenfield\nc4_levels_present:\n  - 1\n  - 2\n`,
];
for (const text of ymCases) {
  const a = parse(text);
  const reSerialized = serialize(a);
  const b = parse(reSerialized);
  check(JSON.stringify(a) === JSON.stringify(b),
    `round-trip stable [${text.split("\n")[0]}...]`);
}

// ---------- pre-write-check: secrets matcher (preserved from v3) ----------
console.log("pre-write-check secrets:");
{
  const script = resolve(root, "hooks/scripts/pre-write-check.js");

  const blockR = runHook(script, {
    session_id: "test", hook_event_name: "PreToolUse", tool_name: "Write",
    tool_input: { file_path: "/tmp/x.js", content: "const KEY = 'AKIAQWERTYUIOPASDFGH';" },
  });
  check(blockR.status === 2, `block on AWS-key fixture: exit 2 (got ${blockR.status})`);
  check(/aws-access-key/.test(blockR.stderr), `block: stderr names the secret kind`);

  const skipR = runHook(script, {
    session_id: "test", hook_event_name: "PreToolUse", tool_name: "Write",
    tool_input: { file_path: "/tmp/x.md", content: "// example AWS key: AKIAQWERTYUIOPASDFGH" },
  });
  check(skipR.status === 0, `'example' skip-pattern allows secret-shaped fixture`);

  const allowR = runHook(script, {
    session_id: "test", hook_event_name: "PreToolUse", tool_name: "Write",
    tool_input: { file_path: "/tmp/x.js", content: "const KEY = process.env.AWS_KEY;" },
  });
  check(allowR.status === 0, `process.env reference: allow`);

  const editR = runHook(script, {
    session_id: "test", hook_event_name: "PreToolUse", tool_name: "Edit",
    tool_input: { file_path: "/tmp/x.js", old_string: "old", new_string: "ghp_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA" },
  });
  check(editR.status === 2, `Edit: blocks on github PAT in new_string (got ${editR.status})`);

  const offR = runHook(script, {
    session_id: "test", hook_event_name: "PreToolUse", tool_name: "Write",
    tool_input: { file_path: "/tmp/x.js", content: "AKIAIOSFODNN7EXAMPLE_X" },
  }, { ORCHESTRA_HOOK_PRE_WRITE_CHECK: "off" });
  check(offR.status === 0, `pre-write-check opt-out: exits 0`);
}

// ---------- pre-write-check Gate-A: status: locked ----------
console.log("pre-write-check Gate-A (status: locked):");
{
  const script = resolve(root, "hooks/scripts/pre-write-check.js");
  withTmp("gate-a", (tmp) => {
    const lockedPath = join(tmp, "PRD-001.md");
    writeFileSync(lockedPath, `---
id: PRD-001
type: PRD
status: locked
verdict: pending
---
# PRD body
`);
    const blockR = runHook(script, {
      session_id: "test", hook_event_name: "PreToolUse", tool_name: "Edit",
      tool_input: { file_path: lockedPath, old_string: "PRD body", new_string: "modified body" },
    });
    check(blockR.status === 2, `Gate-A: rejects Edit on status:locked file (got ${blockR.status})`);
    check(/gate-A/i.test(blockR.stderr) && /locked/.test(blockR.stderr), `Gate-A: stderr names gate + locked status`);

    // Inverse: status: draft permits Edit.
    const draftPath = join(tmp, "PRD-002.md");
    writeFileSync(draftPath, `---
id: PRD-002
type: PRD
status: draft
verdict: pending
---
# Draft PRD
`);
    const allowR = runHook(script, {
      session_id: "test", hook_event_name: "PreToolUse", tool_name: "Edit",
      tool_input: { file_path: draftPath, old_string: "Draft PRD", new_string: "Iterating draft" },
    });
    check(allowR.status === 0, `inverse: status:draft permits Edit`);

    // Override: ORCHESTRA_HOOK_PRE_WRITE_CHECK=off allows write to locked file.
    const overrideR = runHook(script, {
      session_id: "test", hook_event_name: "PreToolUse", tool_name: "Edit",
      tool_input: { file_path: lockedPath, old_string: "PRD body", new_string: "force-unlocked" },
    }, { ORCHESTRA_HOOK_PRE_WRITE_CHECK: "off" });
    check(overrideR.status === 0, `Gate-A override: env=off bypasses lock`);
  });
}

// ---------- pre-write-check Gate-B: sections all locked ----------
console.log("pre-write-check Gate-B (sections all-locked):");
{
  const script = resolve(root, "hooks/scripts/pre-write-check.js");
  withTmp("gate-b", (tmp) => {
    // All sections locked → reject.
    const allLockedPath = join(tmp, "TSR-001.md");
    writeFileSync(allLockedPath, `---
id: TSR-001
type: TSR
status: draft
verdict: pending
sections:
  S-TEST-PLAN-001:
    writer: "@test"
    status: locked
  S-VERDICT-EVAL-001:
    writer: "@evaluator"
    status: locked
  S-VERDICT-REVIEW-001:
    writer: "@reviewer"
    status: locked
---
# TSR body
`);
    const blockR = runHook(script, {
      session_id: "test", hook_event_name: "PreToolUse", tool_name: "Edit",
      tool_input: { file_path: allLockedPath, old_string: "TSR body", new_string: "trying to amend" },
    });
    check(blockR.status === 2, `Gate-B: rejects when all sections locked (got ${blockR.status})`);
    check(/gate-B/i.test(blockR.stderr), `Gate-B: stderr names the gate`);

    // Mixed-state sections → allow (trust-frontmatter).
    const mixedPath = join(tmp, "TSR-002.md");
    writeFileSync(mixedPath, `---
id: TSR-002
type: TSR
status: draft
verdict: pending
sections:
  S-TEST-PLAN-001:
    writer: "@test"
    status: locked
  S-VERDICT-EVAL-001:
    writer: "@evaluator"
    status: in_progress
  S-VERDICT-REVIEW-001:
    writer: "@reviewer"
    status: pending
---
# TSR body
`);
    const allowR = runHook(script, {
      session_id: "test", hook_event_name: "PreToolUse", tool_name: "Edit",
      tool_input: { file_path: mixedPath, old_string: "TSR body", new_string: "evaluator amends" },
    });
    check(allowR.status === 0, `Gate-B inverse: at least one open section permits Edit`);

    // No sections block → allow.
    const noSectionsPath = join(tmp, "PRD-003.md");
    writeFileSync(noSectionsPath, `---
id: PRD-003
type: PRD
status: draft
---
# PRD body
`);
    const noSectionsR = runHook(script, {
      session_id: "test", hook_event_name: "PreToolUse", tool_name: "Edit",
      tool_input: { file_path: noSectionsPath, old_string: "PRD body", new_string: "edited" },
    });
    check(noSectionsR.status === 0, `Gate-B: file without sections: block is allowed`);
  });
}

// ---------- pre-write-check Gate-C: readers warning, non-blocking ----------
console.log("pre-write-check Gate-C (readers, non-blocking):");
{
  const script = resolve(root, "hooks/scripts/pre-write-check.js");
  withTmp("gate-c", (tmp) => {
    const filePath = join(tmp, "PRD-001.md");
    writeFileSync(filePath, `---
id: PRD-001
type: PRD
status: draft
readers:
  - "@architect"
  - "@lead"
---
# PRD body
`);
    const r = runHook(script, {
      session_id: "test", hook_event_name: "PreToolUse", tool_name: "Edit",
      tool_input: { file_path: filePath, old_string: "PRD body", new_string: "edited" },
    });
    check(r.status === 0, `Gate-C: non-blocking; exit 0 even with readers set (got ${r.status})`);
    check(/gate-C/i.test(r.stderr) && /readers-scope/.test(r.stderr), `Gate-C: stderr emits readers-scope warning`);
  });
}

// ---------- pre-write-check Gate-D: src/ cite denylist ----------
console.log("pre-write-check Gate-D (§7.28 src/ purity):");
{
  const script = resolve(root, "hooks/scripts/pre-write-check.js");
  withTmp("gate-d", (tmp) => {
    const javaPath = join(tmp, "src/main/java/com/example/UserService.java");
    mkdirSync(dirname(javaPath), { recursive: true });

    // Block: PRD §-cite in business src/
    const blockR1 = runHook(script, {
      session_id: "test", hook_event_name: "PreToolUse", tool_name: "Write",
      tool_input: { file_path: javaPath, content: `// implements user creation per PRD §3.2\npublic class UserService {}` },
    });
    check(blockR1.status === 2, `Gate-D: PRD §3.2 cite in src/main/ rejected`);
    check(/gate-D/i.test(blockR1.stderr), `Gate-D: stderr names gate`);

    // Block: FR-NN cite
    const blockR2 = runHook(script, {
      session_id: "test", hook_event_name: "PreToolUse", tool_name: "Write",
      tool_input: { file_path: javaPath, content: `// satisfies FR-12\npublic class UserService {}` },
    });
    check(blockR2.status === 2, `Gate-D: FR-12 cite in src/main/ rejected`);

    // Block: S-XXX-NNN anchor cite
    const blockR3 = runHook(script, {
      session_id: "test", hook_event_name: "PreToolUse", tool_name: "Write",
      tool_input: { file_path: javaPath, content: `// per S-VALIDATION-002\npublic class UserService {}` },
    });
    check(blockR3.status === 2, `Gate-D: S-VALIDATION-002 anchor cite in src/main/ rejected`);

    // Block: openapi.yaml#/paths/ cite
    const blockR4 = runHook(script, {
      session_id: "test", hook_event_name: "PreToolUse", tool_name: "Write",
      tool_input: { file_path: javaPath, content: `// openapi.yaml#/paths/users\npublic class UserService {}` },
    });
    check(blockR4.status === 2, `Gate-D: openapi.yaml#/paths/ cite rejected`);

    // Allow: domain comment with no cites.
    const allowR = runHook(script, {
      session_id: "test", hook_event_name: "PreToolUse", tool_name: "Write",
      tool_input: { file_path: javaPath, content: `// Validates user input before persistence.\npublic class UserService {}` },
    });
    check(allowR.status === 0, `Gate-D: domain-only comment is allowed`);

    // Allow: same cite outside of src/ (e.g., docs/<feature>/PRD-001.md)
    const docsPath = join(tmp, "docs/001/PRD-001.md");
    mkdirSync(dirname(docsPath), { recursive: true });
    const docsR = runHook(script, {
      session_id: "test", hook_event_name: "PreToolUse", tool_name: "Write",
      tool_input: { file_path: docsPath, content: `cross-cite per FR-12 holds.\n` },
    });
    check(docsR.status === 0, `Gate-D: cite in docs/ (non-src/) is allowed`);

    // Allow: README.md inside src/ is exempted by extension allowlist.
    const readmePath = join(tmp, "src/main/README.md");
    const readmeR = runHook(script, {
      session_id: "test", hook_event_name: "PreToolUse", tool_name: "Write",
      tool_input: { file_path: readmePath, content: `# Module docs\nSee FR-12 in upstream.\n` },
    });
    check(readmeR.status === 0, `Gate-D: README.md under src/ is exempted`);
  });
}

// ---------- post-bash-lint (Observer) ----------
console.log("post-bash-lint:");
{
  const script = resolve(root, "hooks/scripts/post-bash-lint.js");

  const npmR = runHook(script, {
    session_id: "test", hook_event_name: "PostToolUse", tool_name: "Bash",
    tool_input: { command: "npm install lodash" },
  });
  check(npmR.status === 0, `post-bash-lint: exits 0 on npm install`);
  check(/source-modifying/.test(npmR.stderr), `post-bash-lint: stderr finding for npm install`);

  const benignR = runHook(script, {
    session_id: "test", hook_event_name: "PostToolUse", tool_name: "Bash",
    tool_input: { command: "ls -la" },
  });
  check(benignR.status === 0, `post-bash-lint: exits 0 on benign command`);
  check(benignR.stderr === "", `post-bash-lint: no stderr on benign command`);

  const offR = runHook(script, {
    session_id: "test", hook_event_name: "PostToolUse", tool_name: "Bash",
    tool_input: { command: "npm install" },
  }, { ORCHESTRA_HOOK_POST_BASH_LINT: "off" });
  check(offR.status === 0 && offR.stderr === "", `post-bash-lint opt-out: exits 0, no stderr`);
}

// ---------- val-calibration (Rewriter) ----------
// Calibration source lives at hooks/calibration/calibration-examples.md
// (consumer-shipping placement next to the hook that reads it; relocated
// from the deleted evaluator-tuning skill folder in Stream 4).
console.log("val-calibration:");
{
  const script = resolve(root, "hooks/scripts/val-calibration.js");
  const calibrationPath = resolve(root, "hooks/calibration/calibration-examples.md");

  const evalR = runHook(script, {
    session_id: "test", hook_event_name: "PreToolUse", tool_name: "Task",
    tool_input: { subagent_type: "evaluator", prompt: "evaluate fixture" },
  });
  check(evalR.status === 0, `val-calibration: exits 0`);
  const evalOut = JSON.parse(evalR.stdout || "{}");
  check(evalOut.hookSpecificOutput?.permissionDecision === "allow", `val-calibration: emits allow`);
  if (existsSync(calibrationPath)) {
    const evalUpdated = evalOut.hookSpecificOutput?.updatedInput;
    check(!!evalUpdated, `val-calibration: emits updatedInput when calibration file present`);
    check(typeof evalUpdated?.prompt === "string" && evalUpdated.prompt.includes("<calibration-anchor>"),
      `val-calibration: prompt contains <calibration-anchor>`);
  }

  const otherR = runHook(script, {
    session_id: "test", hook_event_name: "PreToolUse", tool_name: "Task",
    tool_input: { subagent_type: "general-purpose", prompt: "research" },
  });
  check(otherR.status === 0, `val-calibration: exits 0 for non-evaluator`);
  const otherOut = JSON.parse(otherR.stdout || "{}");
  check(!otherOut.hookSpecificOutput?.updatedInput, `val-calibration: no updatedInput for non-evaluator`);

  const offR = runHook(script, {
    session_id: "test", hook_event_name: "PreToolUse", tool_name: "Task",
    tool_input: { subagent_type: "evaluator", prompt: "x" },
  }, { ORCHESTRA_HOOK_VAL_CALIBRATION: "off" });
  check(offR.status === 0, `val-calibration opt-out: exits 0`);

  // tool_name="Agent" parity (canonical)
  const agentR = runHook(script, {
    session_id: "test", hook_event_name: "PreToolUse", tool_name: "Agent",
    tool_input: { subagent_type: "evaluator", prompt: "evaluate" },
  });
  check(agentR.status === 0, `val-calibration: exits 0 for tool_name=Agent`);
}

// ---------- post-write-puml (Renderer; PostToolUse) ----------
// Stream 9 R9.5 — render-enforcement on .puml writes.
// CI doesn't have plantuml.jar; the hook must exit 0 with a stderr warning
// (graceful degradation) rather than blocking the write.
console.log("post-write-puml:");
{
  const script = resolve(root, "hooks/scripts/post-write-puml.js");
  const tmp = mkdtempSync(join(tmpdir(), "orchestra-puml-"));
  try {
    // Write a .puml fixture so the hook has a real file to act on.
    const pumlPath = join(tmp, "diagrams", "c4-context.puml");
    mkdirSync(dirname(pumlPath), { recursive: true });
    writeFileSync(pumlPath, "@startuml\nactor User\n@enduml\n");

    // 1. Non-puml file path: hook is no-op.
    const nonPuml = runHook(script, {
      session_id: "test", hook_event_name: "PostToolUse", tool_name: "Write",
      tool_input: { file_path: join(tmp, "README.md") },
    });
    check(nonPuml.status === 0, `post-write-puml: exits 0 on non-puml path`);
    check(nonPuml.stderr === "", `post-write-puml: silent on non-puml path`);

    // 2. .puml file: hook never blocks. With PLANTUML_JAR forced to a
    // nonexistent path, the jar branch is skipped; the PATH fallback may
    // succeed or fail depending on the host (some dev machines have
    // `plantuml` installed) — but EITHER WAY the hook must exit 0.
    const pumlR = runHook(script, {
      session_id: "test", hook_event_name: "PostToolUse", tool_name: "Write",
      tool_input: { file_path: pumlPath },
    }, { PLANTUML_JAR: "/nonexistent/plantuml.jar" });
    check(pumlR.status === 0, `post-write-puml: exits 0 on .puml write (PostToolUse never blocks regardless of render outcome)`);

    // 3. Opt-out via env var.
    const offR = runHook(script, {
      session_id: "test", hook_event_name: "PostToolUse", tool_name: "Write",
      tool_input: { file_path: pumlPath },
    }, { ORCHESTRA_HOOK_POST_WRITE_PUML: "off" });
    check(offR.status === 0 && offR.stderr === "", `post-write-puml opt-out: exits 0, no stderr`);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

// ---------- hooks.json matcher validation ----------
console.log("hooks.json matcher validation:");
{
  const KNOWN_TOOLS = new Set([
    "Bash", "Read", "Write", "Edit", "MultiEdit",
    "Glob", "Grep", "NotebookEdit",
    "WebFetch", "WebSearch",
    "Agent", "Task",
    "TodoWrite", "TeamCreate", "TeamDelete",
    "Skill",
  ]);
  const MCP_REGEX_ATOM = /^mcp__[a-zA-Z0-9_-]*\.\*$/;

  function validateMatcher(matcher) {
    if (typeof matcher !== "string" || matcher.length === 0) {
      return { ok: false, reason: "matcher is not a non-empty string" };
    }
    const atoms = matcher.split("|");
    for (const atom of atoms) {
      if (KNOWN_TOOLS.has(atom)) continue;
      if (MCP_REGEX_ATOM.test(atom)) continue;
      return { ok: false, reason: `atom "${atom}" is neither a known tool nor mcp__*.*` };
    }
    return { ok: true };
  }

  function validateHooksMatchers(hooks) {
    const findings = [];
    const preToolUse = hooks?.PreToolUse || [];
    for (let i = 0; i < preToolUse.length; i++) {
      const entry = preToolUse[i];
      if (!Object.hasOwn(entry, "matcher")) {
        findings.push(`PreToolUse[${i}] missing matcher key`);
        continue;
      }
      const r = validateMatcher(entry.matcher);
      if (!r.ok) findings.push(`PreToolUse[${i}] matcher="${entry.matcher}": ${r.reason}`);
    }
    return findings;
  }

  const hooksPath = resolve(root, "hooks/hooks.json");
  const hooksJson = JSON.parse(readFileSync(hooksPath, "utf8")).hooks;
  const findings = validateHooksMatchers(hooksJson);
  check(findings.length === 0, `hooks.json: every PreToolUse matcher is known (got: ${findings.join("; ")})`);

  const bad1 = validateHooksMatchers({ PreToolUse: [{ matcher: "FakeTool", hooks: [] }] });
  check(bad1.length === 1, `mutation: matcher="FakeTool" produces 1 finding (got ${bad1.length})`);

  const bad2 = validateHooksMatchers({ PreToolUse: [{ matcher: "Write|MadeUpTool|Edit", hooks: [] }] });
  check(bad2.length === 1, `mutation: matcher="Write|MadeUpTool|Edit" produces 1 finding (got ${bad2.length})`);

  const bad3 = validateHooksMatchers({ PreToolUse: [{ hooks: [] }] });
  check(bad3.length === 1, `mutation: missing matcher key produces 1 finding (got ${bad3.length})`);

  const ok1 = validateHooksMatchers({ PreToolUse: [{ matcher: "Write|Edit|MultiEdit", hooks: [] }] });
  check(ok1.length === 0, `inverse: matcher="Write|Edit|MultiEdit" passes clean`);
  const ok2 = validateHooksMatchers({ PreToolUse: [{ matcher: "Task|Agent", hooks: [] }] });
  check(ok2.length === 0, `inverse: matcher="Task|Agent" passes clean`);
  const ok3 = validateHooksMatchers({ PreToolUse: [{ matcher: "mcp__orchestra-.*", hooks: [] }] });
  check(ok3.length === 0, `inverse: matcher="mcp__orchestra-.*" passes clean`);
}

// ---------- orchestra.md v4.0 decision-tree + chain-rigor + subcommand fixture ----------
// Pins v4.0 surface: 4 locked decisions, chain-rigor presets, ship/report/resume
// subcommands. Negative assertions guard against v3 vestiges being pasted back.
console.log("orchestra.md v4.0 surface fixture:");
{
  const orchestraPath = resolve(root, "commands/orchestra.md");
  const body = readFileSync(orchestraPath, "utf8");

  // v4.0 surface (must contain)
  check(/Decision tree/i.test(body), `commands/orchestra.md has Decision tree section`);
  for (const decision of ["mode", "depth", "chain_rigor", "language"]) {
    check(new RegExp(`\\b${decision}\\b`).test(body),
      `commands/orchestra.md mentions locked decision: ${decision}`);
  }
  for (const rigor of ["Full", "Standard", "Light"]) {
    check(body.includes(rigor), `commands/orchestra.md enumerates chain-rigor preset: ${rigor}`);
  }
  check(/AskUserQuestion/.test(body), `commands/orchestra.md references AskUserQuestion primitive`);
  check(/local\.yaml/.test(body), `commands/orchestra.md documents local.yaml schema`);
  check(/chain_rigor/.test(body), `commands/orchestra.md persists chain_rigor in local.yaml`);
  for (const sub of ["/orchestra ship", "/orchestra report", "/orchestra resume", "/orchestra help"]) {
    check(body.includes(sub), `commands/orchestra.md documents subcommand: ${sub}`);
  }
  check(/Coordination protocol/i.test(body), `commands/orchestra.md has Coordination protocol section`);

  // v3 vestiges (must NOT contain — prevent regression)
  for (let i = 1; i <= 4; i++) {
    check(!body.includes(`PAUSE-${i}`), `commands/orchestra.md MUST NOT reference v3 PAUSE-${i}`);
  }
  check(!/--autonomy/.test(body), `commands/orchestra.md MUST NOT mention v3 --autonomy flag`);
  for (const tag of ["EXECUTION_ONLY", "JOINT_PROCESSING", "OPTION_SYNTHESIS", "DRAFT_AND_GATE", "FULL_AUTONOMY"]) {
    check(!body.includes(tag), `commands/orchestra.md MUST NOT enumerate v3 autonomy tag: ${tag}`);
  }
}

if (failures > 0) {
  console.error(`test-hooks.js: FAIL (${passes} passed, ${failures} failed)`);
  process.exit(1);
}
console.log(`test-hooks.js: OK (${passes} assertions passed)`);
