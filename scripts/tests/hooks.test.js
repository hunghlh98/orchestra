#!/usr/bin/env node
// scripts/tests/hooks.test.js
// Hook contract tests:
//   - yaml-mini round-trip (frontmatter parser, formerly lockfile parser)
//   - pre-write-check.js: secrets matcher + 4 frontmatter / cite gates
//       locked-status-reject     — frontmatter status: locked rejects writes
//       all-sections-locked-reject — frontmatter sections: all-locked rejects writes
//       readers-scope-warning    — frontmatter readers: emits non-blocking warning
//       chain-cite-reject        — src/ cite denylist; exit 2 on hit under business src/
//   - post-bash-lint (Observer)
//   - val-calibration (Rewriter — calibration source at scripts/evaluator-tuning/)
//   - hooks.json matcher validation
//   - orchestra.md subcommand surface fixture

import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { parse, serialize } from "../../hooks/lib/yaml-mini.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
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
  `status: draft\nverdict: PENDING\nreaders:\n  - "@architect"\n  - "@lead"\n`,
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

// ---------- pre-write-check locked-status-reject ----------
console.log("pre-write-check locked-status-reject (status: locked):");
{
  const script = resolve(root, "hooks/scripts/pre-write-check.js");
  withTmp("locked-status-reject", (tmp) => {
    const lockedPath = join(tmp, "PRD-001.md");
    writeFileSync(lockedPath, `---
id: PRD-001
type: PRD
status: locked
verdict: PENDING
---
# PRD body
`);
    const blockR = runHook(script, {
      session_id: "test", hook_event_name: "PreToolUse", tool_name: "Edit",
      tool_input: { file_path: lockedPath, old_string: "PRD body", new_string: "modified body" },
    });
    check(blockR.status === 2, `locked-status-reject: rejects Edit on status:locked file (got ${blockR.status})`);
    check(/locked-status-reject/i.test(blockR.stderr) && /locked/.test(blockR.stderr), `locked-status-reject: stderr names gate + locked status`);

    // Inverse: status: draft permits Edit.
    const draftPath = join(tmp, "PRD-002.md");
    writeFileSync(draftPath, `---
id: PRD-002
type: PRD
status: draft
verdict: PENDING
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
    check(overrideR.status === 0, `locked-status-reject override: env=off bypasses lock`);
  });
}

// ---------- pre-write-check all-sections-locked-reject ----------
console.log("pre-write-check all-sections-locked-reject:");
{
  const script = resolve(root, "hooks/scripts/pre-write-check.js");
  withTmp("all-sections-locked-reject", (tmp) => {
    // All sections locked → reject.
    const allLockedPath = join(tmp, "TSR-001.md");
    writeFileSync(allLockedPath, `---
id: TSR-001
type: TSR
status: draft
verdict: PENDING
sections:
  S-TEST-001:
    writer: "@test-author"
    status: locked
  S-EVAL-001:
    writer: "@evaluator"
    status: locked
  S-REVIEW-001:
    writer: "@reviewer"
    status: locked
---
# TSR body
`);
    const blockR = runHook(script, {
      session_id: "test", hook_event_name: "PreToolUse", tool_name: "Edit",
      tool_input: { file_path: allLockedPath, old_string: "TSR body", new_string: "trying to amend" },
    });
    check(blockR.status === 2, `all-sections-locked-reject: rejects when all sections locked (got ${blockR.status})`);
    check(/all-sections-locked-reject/i.test(blockR.stderr), `all-sections-locked-reject: stderr names the gate`);

    // Mixed-state sections → allow (trust-frontmatter).
    const mixedPath = join(tmp, "TSR-002.md");
    writeFileSync(mixedPath, `---
id: TSR-002
type: TSR
status: draft
verdict: PENDING
sections:
  S-TEST-001:
    writer: "@test-author"
    status: locked
  S-EVAL-001:
    writer: "@evaluator"
    status: in_progress
  S-REVIEW-001:
    writer: "@reviewer"
    status: pending
---
# TSR body
`);
    const allowR = runHook(script, {
      session_id: "test", hook_event_name: "PreToolUse", tool_name: "Edit",
      tool_input: { file_path: mixedPath, old_string: "TSR body", new_string: "evaluator amends" },
    });
    check(allowR.status === 0, `all-sections-locked-reject inverse: at least one open section permits Edit`);

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
    check(noSectionsR.status === 0, `all-sections-locked-reject: file without sections: block is allowed`);
  });
}

// ---------- pre-write-check readers-scope-warning (non-blocking) ----------
console.log("pre-write-check readers-scope-warning:");
{
  const script = resolve(root, "hooks/scripts/pre-write-check.js");
  withTmp("readers-scope-warning", (tmp) => {
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
    check(r.status === 0, `readers-scope-warning: non-blocking; exit 0 even with readers set (got ${r.status})`);
    check(/readers-scope-warning/i.test(r.stderr), `readers-scope-warning: stderr emits warning`);
  });
}

// ---------- pre-write-check chain-cite-reject: src/ cite denylist ----------
console.log("pre-write-check chain-cite-reject (src/ purity):");
{
  const script = resolve(root, "hooks/scripts/pre-write-check.js");
  withTmp("chain-cite-reject", (tmp) => {
    const javaPath = join(tmp, "src/main/java/com/example/UserService.java");
    mkdirSync(dirname(javaPath), { recursive: true });

    // Block: PRD §-cite in business src/
    const blockR1 = runHook(script, {
      session_id: "test", hook_event_name: "PreToolUse", tool_name: "Write",
      tool_input: { file_path: javaPath, content: `// implements user creation per PRD §3.2\npublic class UserService {}` },
    });
    check(blockR1.status === 2, `chain-cite-reject: PRD §3.2 cite in src/main/ rejected`);
    check(/chain-cite-reject/i.test(blockR1.stderr), `chain-cite-reject: stderr names gate`);

    // Block: FR-NN cite
    const blockR2 = runHook(script, {
      session_id: "test", hook_event_name: "PreToolUse", tool_name: "Write",
      tool_input: { file_path: javaPath, content: `// satisfies FR-12\npublic class UserService {}` },
    });
    check(blockR2.status === 2, `chain-cite-reject: FR-12 cite in src/main/ rejected`);

    // Block: S-XXX-NNN anchor cite
    const blockR3 = runHook(script, {
      session_id: "test", hook_event_name: "PreToolUse", tool_name: "Write",
      tool_input: { file_path: javaPath, content: `// per S-VALIDATION-002\npublic class UserService {}` },
    });
    check(blockR3.status === 2, `chain-cite-reject: S-VALIDATION-002 anchor cite in src/main/ rejected`);

    // Block: openapi.yaml#/paths/ cite
    const blockR4 = runHook(script, {
      session_id: "test", hook_event_name: "PreToolUse", tool_name: "Write",
      tool_input: { file_path: javaPath, content: `// openapi.yaml#/paths/users\npublic class UserService {}` },
    });
    check(blockR4.status === 2, `chain-cite-reject: openapi.yaml#/paths/ cite rejected`);

    // Allow: domain comment with no cites.
    const allowR = runHook(script, {
      session_id: "test", hook_event_name: "PreToolUse", tool_name: "Write",
      tool_input: { file_path: javaPath, content: `// Validates user input before persistence.\npublic class UserService {}` },
    });
    check(allowR.status === 0, `chain-cite-reject: domain-only comment is allowed`);

    // Allow: same cite outside of src/ (e.g., docs/<feature>/PRD-001.md)
    const docsPath = join(tmp, "docs/001/PRD-001.md");
    mkdirSync(dirname(docsPath), { recursive: true });
    const docsR = runHook(script, {
      session_id: "test", hook_event_name: "PreToolUse", tool_name: "Write",
      tool_input: { file_path: docsPath, content: `cross-cite per FR-12 holds.\n` },
    });
    check(docsR.status === 0, `chain-cite-reject: cite in docs/ (non-src/) is allowed`);

    // Allow: README.md inside src/ is exempted by extension allowlist.
    const readmePath = join(tmp, "src/main/README.md");
    const readmeR = runHook(script, {
      session_id: "test", hook_event_name: "PreToolUse", tool_name: "Write",
      tool_input: { file_path: readmePath, content: `# Module docs\nSee FR-12 in upstream.\n` },
    });
    check(readmeR.status === 0, `chain-cite-reject: README.md under src/ is exempted`);
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
    "TaskCreate", "TaskUpdate", "TaskList", "TaskGet", "TaskOutput", "TaskStop",
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

// ---------- orchestra.md 4-subcommand surface fixture ----------
// Pins the dispatcher surface: 4 subcommand shapes (empty / spec-to-code /
// code-to-spec / <intent>), preflight hook contract, 3-question floor in the
// intent router. Negative assertions guard against legacy shapes being pasted
// back: chain-rigor presets, ship/report/resume/help subcommands, mode/depth/
// chain_rigor decision-tree.
console.log("orchestra.md 4-subcommand surface fixture:");
{
  const orchestraPath = resolve(root, "commands/orchestra.md");
  const body = readFileSync(orchestraPath, "utf8");

  // Subcommand surface (must contain).
  for (const sub of ["spec-to-code", "code-to-spec", "<intent>"]) {
    check(body.includes(sub), `commands/orchestra.md documents subcommand surface: ${sub}`);
  }
  check(/AskUserQuestion/.test(body), `commands/orchestra.md references AskUserQuestion primitive`);
  check(/local\.yaml/.test(body), `commands/orchestra.md references local.yaml`);
  check(/system\.yaml/.test(body), `commands/orchestra.md references system.yaml`);
  check(/orchestra-preflight/.test(body), `commands/orchestra.md references the orchestra-preflight hook`);
  check(/<orchestra-preflight>/.test(body), `commands/orchestra.md describes the preflight block contract`);
  check(/reverse_authoring_mode/.test(body), `commands/orchestra.md documents reverse_authoring_mode field`);
  for (const mode of ["cite-as-is", "copy-and-modify", "re-author"]) {
    check(body.includes(mode), `commands/orchestra.md enumerates reverse_authoring_mode value: ${mode}`);
  }
  check(/3.*AskUserQuestion|three.*AskUserQuestion|at least three|minimum of three/i.test(body),
    `commands/orchestra.md documents intent-router 3-question floor`);
  check(/BR-AC|business-invariants\.md/.test(body),
    `commands/orchestra.md references BR-AC and/or business-invariants.md`);

  // Legacy surface (must NOT contain — guard against paste-back).
  for (const dead of ["chain_rigor", "/orchestra ship", "/orchestra report", "/orchestra resume", "/orchestra help",
                       "tsr_gate_mode", "test_depth", "CSD"]) {
    check(!body.includes(dead), `commands/orchestra.md MUST NOT reference legacy token: ${dead}`);
  }
  for (const rigor of ["Full chain", "Standard chain", "Light chain"]) {
    check(!body.includes(rigor), `commands/orchestra.md MUST NOT enumerate chain-rigor preset: ${rigor}`);
  }

  // Workspace + scope enums (must enumerate new binary shape).
  for (const wk of ["single-repo", "multi-repo"]) {
    check(body.includes(wk), `commands/orchestra.md enumerates workspace_kind: ${wk}`);
  }
  for (const sl of ["system-wide", "per-service"]) {
    check(body.includes(sl), `commands/orchestra.md enumerates scope_level: ${sl}`);
  }
  for (const dead of ["multi-service", "scope_level: service", "scope_level: container", "scope_level: capability"]) {
    check(!body.includes(dead), `commands/orchestra.md MUST NOT reference dropped enum: ${dead}`);
  }

  // Autonomy + spawn_mode surface (CLI override flags + 5 enum tags).
  check(/--autonomy/.test(body), `commands/orchestra.md documents --autonomy CLI flag`);
  check(/--spawn-mode/.test(body), `commands/orchestra.md documents --spawn-mode CLI flag`);
  for (const tag of ["EXECUTION_ONLY", "JOINT_PROCESSING", "OPTION_SYNTHESIS", "DRAFT_AND_GATE", "FULL_AUTONOMY"]) {
    check(body.includes(tag), `commands/orchestra.md enumerates autonomy tag: ${tag}`);
  }
  check(/spawn_mode/.test(body), `commands/orchestra.md references spawn_mode`);
  check(/autonomy\.level|autonomy:\s*\n\s*level/.test(body), `commands/orchestra.md references autonomy.level`);

  // Coordination + diagram surface.
  check(/Coordination protocol/i.test(body), `commands/orchestra.md has Coordination protocol section`);
  check(/diagrams:/.test(body), `commands/orchestra.md references diagrams: [...] relations array`);
}

// v4.2 — c4-architecture skill enforces consistent noun-based naming (layer prefix dropped).
console.log("c4-architecture skill enumerates Levels 1–4:");
{
  const skillPath = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "skills", "c4-architecture", "SKILL.md");
  const body = readFileSync(skillPath, "utf8");
  for (const lvl of ["c4-context", "c4-container", "c4-component", "c4-code"]) {
    check(body.includes(lvl), `skills/c4-architecture/SKILL.md documents diagram-name shape: ${lvl}`);
  }
  check(/Level 4 — Code/i.test(body), `skills/c4-architecture/SKILL.md has Level 4 — Code section`);
  check(/clean-architecture/.test(body), `skills/c4-architecture/SKILL.md cross-references clean-architecture skill for L4 layering`);
  check(/UpdateElementStyle/.test(body), `skills/c4-architecture/SKILL.md teaches the highlight protocol for per-feature copies`);
}

// v4.0.3 — clean-architecture + clean-code skills are vendored and load-cleanly.
console.log("vendored skills present + frontmatter shape:");
for (const skill of ["clean-architecture", "clean-code"]) {
  const skillPath = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "skills", skill, "SKILL.md");
  check(existsSync(skillPath), `skills/${skill}/SKILL.md exists`);
  const body = readFileSync(skillPath, "utf8");
  check(/origin:\s*vendored/i.test(body), `skills/${skill}/SKILL.md frontmatter declares vendored origin`);
  check(/license:\s*MIT/i.test(body), `skills/${skill}/SKILL.md frontmatter declares MIT license`);
  const licensePath = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "skills", skill, "LICENSE");
  check(existsSync(licensePath), `skills/${skill}/LICENSE present (upstream attribution)`);
}

if (failures > 0) {
  console.error(`test-hooks.js: FAIL (${passes} passed, ${failures} failed)`);
  process.exit(1);
}
console.log(`test-hooks.js: OK (${passes} assertions passed)`);
