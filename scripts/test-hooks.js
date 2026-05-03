#!/usr/bin/env node
// scripts/test-hooks.js
// Hook contract tests. PR #2 covers: yaml-mini round-trip, section-hash
// regression, hash-stamper end-to-end stamp test, and hash-equality between
// hash-stamper output and validate-drift recompute.

import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { parse, serialize } from "../hooks/lib/yaml-mini.js";
import { hashSections, computeHash } from "../hooks/lib/section-hash.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
let failures = 0;
let passes = 0;

function check(cond, msg) {
  if (cond) { passes++; }
  else { failures++; console.error(`  FAIL: ${msg}`); }
}

// ---------- yaml-mini round-trip ----------
console.log("yaml-mini:");
const ymCases = [
  `id: PRD-001\ntype: PRD\nrevision: 3\n`,
  `sections:\n  S-USAGE-001:\n    hash: "TBD"\n    confirmed: true\n  S-VISION-001:\n    hash: "sha256:abc123"\n    inferred: true\n`,
  `references:\n  - type: sad\n    id: ""\n    section: S-CONTAINER-001\n    hash-at-write: "sha256:def456"\n  - type: frs\n    id: "001"\n    section: S-API-001\n    hash-at-write: "TBD"\n`,
  `id: SAD\ntype: SAD\nrevision: 1\nsections:\n  S-CONTEXT-001:\n    hash: "TBD"\n    confirmed: true\nreferences:\n  - type: prd\n    id: "001"\n    section: S-INVARIANTS-001\n    hash-at-write: "TBD"\n`,
];
for (const text of ymCases) {
  const a = parse(text);
  const reSerialized = serialize(a);
  const b = parse(reSerialized);
  check(JSON.stringify(a) === JSON.stringify(b),
    `round-trip stable: parse(serialize(parse(text))) deep-equals parse(text) [${text.split("\n")[0]}...]`);
}

// ---------- section-hash regression ----------
console.log("section-hash:");
const body1 = `## §1 Title <a id="S-FOO-001"></a>\n\nSome content here.\n\n## §2 Other <a id="S-BAR-001"></a>\n\nMore content.\n`;
const sections = hashSections(body1);
check(sections.length === 2, `hashSections yields 2 sections (got ${sections.length})`);
check(sections[0]?.id === "S-FOO-001", `first section id is S-FOO-001`);
check(sections[1]?.id === "S-BAR-001", `second section id is S-BAR-001`);
check(/^sha256:[a-f0-9]{64}$/.test(sections[0]?.hash), `section 0 hash format`);
check(/^sha256:[a-f0-9]{64}$/.test(sections[1]?.hash), `section 1 hash format`);

// Determinism
const sections2 = hashSections(body1);
check(sections2[0].hash === sections[0].hash, `deterministic`);

// CRLF normalization
const bodyCrlf = body1.replace(/\n/g, "\r\n");
const sectionsCrlf = hashSections(bodyCrlf);
check(sectionsCrlf[0].hash === sections[0].hash, `CRLF normalizes to LF`);

// Trailing-whitespace stripping
const bodyTrailing = body1.replace(/Some content here\./, "Some content here.   ");
const sectionsTrailing = hashSections(bodyTrailing);
check(sectionsTrailing[0].hash === sections[0].hash, `trailing whitespace stripped`);

// ---------- hash-stamper integration ----------
console.log("hash-stamper integration:");
{
  const tmp = mkdtempSync(join(tmpdir(), "orchestra-stamper-"));
  try {
    const archDir = join(tmp, ".claude/.orchestra/architecture");
    mkdirSync(archDir, { recursive: true });
    const sadPath = join(archDir, "SAD.md");
    const sadContent =
`---
id: SAD
type: SAD
revision: 1
sections:
  S-CONTEXT-001:
    hash: "TBD"
    confirmed: true
  S-CONTAINER-001:
    hash: "TBD"
    confirmed: true
---
## §1 System Context <a id="S-CONTEXT-001"></a>

Context content.

## §2 Container Decomposition <a id="S-CONTAINER-001"></a>

Container content.
`;

    const result = spawnSync("node", [resolve(root, "hooks/scripts/hash-stamper.js")], {
      input: JSON.stringify({
        session_id: "test", hook_event_name: "PreToolUse", tool_name: "Write",
        tool_input: { file_path: sadPath, content: sadContent },
      }),
      encoding: "utf8",
    });

    check(result.status === 0, `hash-stamper exits 0 (got ${result.status}; stderr: ${result.stderr})`);
    check(result.stdout.length > 0, `hash-stamper produces stdout`);

    let output;
    try { output = JSON.parse(result.stdout); }
    catch (e) { check(false, `hash-stamper stdout is JSON (parse error: ${e.message})`); output = {}; }

    check(output.hookSpecificOutput?.hookEventName === "PreToolUse", `output.hookSpecificOutput.hookEventName === "PreToolUse"`);
    check(output.hookSpecificOutput?.permissionDecision === "allow", `output.hookSpecificOutput.permissionDecision === "allow"`);

    const updated = output.hookSpecificOutput?.updatedInput;
    check(updated?.file_path === sadPath, `updatedInput preserves file_path`);
    check(typeof updated?.content === "string", `updatedInput.content is string`);

    if (typeof updated?.content === "string") {
      const stampedContent = updated.content;
      // Re-parse stamped frontmatter
      const fmEnd = stampedContent.indexOf("\n---\n", 4);
      const stampedFm = parse(stampedContent.slice(4, fmEnd));
      const stampedBody = stampedContent.slice(fmEnd + 5);
      const expected = hashSections(stampedBody);

      // hash-equality between stamper output and independent recompute
      for (const { id, hash } of expected) {
        const stampedHash = stampedFm.sections?.[id]?.hash;
        check(stampedHash === hash, `${id}: stamped hash matches recomputed`);
      }
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

// ---------- validate-drift fixture cases ----------
console.log("validate-drift fixtures:");
const driftScript = resolve(root, "scripts/validate-drift.js");

// Case 1: clean (recorded hash matches body)
{
  const tmp = mkdtempSync(join(tmpdir(), "orchestra-drift-clean-"));
  try {
    const orchDir = join(tmp, ".claude/.orchestra");
    const archDir = join(orchDir, "architecture");
    mkdirSync(archDir, { recursive: true });
    const body = `## §1 Title <a id="S-FOO-001"></a>\n\nContent.\n`;
    const correct = hashSections(body)[0].hash;
    writeFileSync(join(archDir, "SAD.md"),
`---
id: SAD
type: SAD
revision: 1
sections:
  S-FOO-001:
    hash: "${correct}"
    confirmed: true
---
${body}`);
    const r = spawnSync("node", [driftScript, orchDir], { encoding: "utf8" });
    check(r.status === 0, `clean fixture: exits 0`);
    const report = readFileSync(join(orchDir, "DRIFT-REPORT.md"), "utf8");
    check(report.includes("fail_count: 0"), `clean fixture: 0 fail`);
    check(report.includes("warn_count: 0"), `clean fixture: 0 warn`);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

// Case 2: drift-on-confirmed (downstream references upstream with stale hash)
{
  const tmp = mkdtempSync(join(tmpdir(), "orchestra-drift-confirmed-"));
  try {
    const orchDir = join(tmp, ".claude/.orchestra");
    const archDir = join(orchDir, "architecture");
    const pipeDir = join(orchDir, "pipeline/001");
    mkdirSync(archDir, { recursive: true });
    mkdirSync(pipeDir, { recursive: true });

    const sadBody = `## §1 Context <a id="S-CONTEXT-001"></a>\n\nUpdated content.\n`;
    const sadHash = hashSections(sadBody)[0].hash;
    writeFileSync(join(archDir, "SAD.md"),
`---
id: SAD
type: SAD
revision: 1
sections:
  S-CONTEXT-001:
    hash: "${sadHash}"
    confirmed: true
---
${sadBody}`);

    // PRD-001 downstream references SAD with a STALE hash
    const prdBody = `## §1 Vision <a id="S-VISION-001"></a>\n\nVision text.\n`;
    const prdHash = hashSections(prdBody)[0].hash;
    writeFileSync(join(pipeDir, "PRD-001.md"),
`---
id: PRD-001
type: PRD
revision: 1
sections:
  S-VISION-001:
    hash: "${prdHash}"
    confirmed: true
references:
  - type: sad
    id: ""
    section: S-CONTEXT-001
    hash-at-write: "sha256:0000000000000000000000000000000000000000000000000000000000000000"
---
${prdBody}`);

    const r = spawnSync("node", [driftScript, orchDir], { encoding: "utf8" });
    check(r.status === 0, `drift-on-confirmed: exits 0`);
    const report = readFileSync(join(orchDir, "DRIFT-REPORT.md"), "utf8");
    check(report.includes("drift-on-confirmed"), `drift-on-confirmed: report contains type`);
    check(/fail_count: [1-9]/.test(report), `drift-on-confirmed: fail_count >= 1`);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

// Case 3: drift-on-inferred (same setup but upstream is inferred)
{
  const tmp = mkdtempSync(join(tmpdir(), "orchestra-drift-inferred-"));
  try {
    const orchDir = join(tmp, ".claude/.orchestra");
    const archDir = join(orchDir, "architecture");
    const pipeDir = join(orchDir, "pipeline/001");
    mkdirSync(archDir, { recursive: true });
    mkdirSync(pipeDir, { recursive: true });

    const sadBody = `## §1 Context <a id="S-CONTEXT-001"></a>\n\nUpdated content.\n`;
    const sadHash = hashSections(sadBody)[0].hash;
    writeFileSync(join(archDir, "SAD.md"),
`---
id: SAD
type: SAD
revision: 1
sections:
  S-CONTEXT-001:
    hash: "${sadHash}"
    inferred: true
---
${sadBody}`);

    const prdBody = `## §1 Vision <a id="S-VISION-001"></a>\n\nVision text.\n`;
    const prdHash = hashSections(prdBody)[0].hash;
    writeFileSync(join(pipeDir, "PRD-001.md"),
`---
id: PRD-001
type: PRD
revision: 1
sections:
  S-VISION-001:
    hash: "${prdHash}"
    confirmed: true
references:
  - type: sad
    id: ""
    section: S-CONTEXT-001
    hash-at-write: "sha256:0000000000000000000000000000000000000000000000000000000000000000"
---
${prdBody}`);

    const r = spawnSync("node", [driftScript, orchDir], { encoding: "utf8" });
    check(r.status === 0, `drift-on-inferred: exits 0`);
    const report = readFileSync(join(orchDir, "DRIFT-REPORT.md"), "utf8");
    check(report.includes("drift-on-inferred"), `drift-on-inferred: report contains type`);
    check(/warn_count: [1-9]/.test(report), `drift-on-inferred: warn_count >= 1`);
    check(report.includes("fail_count: 0"), `drift-on-inferred: fail_count is 0`);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

// ---------- env-var opt-out ----------
console.log("env-var opt-out:");
{
  const r = spawnSync("node", [resolve(root, "hooks/scripts/hash-stamper.js")], {
    input: JSON.stringify({
      session_id: "test", hook_event_name: "PreToolUse", tool_name: "Write",
      tool_input: { file_path: "/tmp/x.md", content: "hello" },
    }),
    encoding: "utf8",
    env: { ...process.env, ORCHESTRA_HOOK_HASH_STAMPER: "off" },
  });
  check(r.status === 0, `hash-stamper opt-out: exits 0`);
  const out = JSON.parse(r.stdout || "{}");
  check(out.hookSpecificOutput?.permissionDecision === "allow", `hash-stamper opt-out: emits allow`);
  check(!out.hookSpecificOutput?.updatedInput, `hash-stamper opt-out: no updatedInput`);
}

// ---------- pre-write-check (Blocker) ----------
console.log("pre-write-check:");
{
  const script = resolve(root, "hooks/scripts/pre-write-check.js");

  // Block on AWS key. NOTE: secret-shaped string deliberately avoids the substring
  // "example" so the skip-pattern doesn't fire on this fixture line.
  const blockR = spawnSync("node", [script], {
    input: JSON.stringify({
      session_id: "test", hook_event_name: "PreToolUse", tool_name: "Write",
      tool_input: { file_path: "/tmp/x.js", content: "const KEY = 'AKIAQWERTYUIOPASDFGH';" },
    }),
    encoding: "utf8",
  });
  check(blockR.status === 2, `block on AWS-key fixture: exit 2 (got ${blockR.status})`);
  check(/aws-access-key/.test(blockR.stderr), `block: stderr names the secret kind`);

  // Inverse sanity: an AWS-key-shaped value tagged with "example" SHOULD pass
  // (the skip pattern is part of the spec — see PRD §9.9).
  const skipR = spawnSync("node", [script], {
    input: JSON.stringify({
      session_id: "test", hook_event_name: "PreToolUse", tool_name: "Write",
      tool_input: { file_path: "/tmp/x.md", content: "// example AWS key: AKIAQWERTYUIOPASDFGH" },
    }),
    encoding: "utf8",
  });
  check(skipR.status === 0, `'example' marker on AWS-key-shaped line is skipped (allow)`);

  // Allow when behind process.env
  const allowR = spawnSync("node", [script], {
    input: JSON.stringify({
      session_id: "test", hook_event_name: "PreToolUse", tool_name: "Write",
      tool_input: { file_path: "/tmp/x.js", content: "const KEY = process.env.AWS_KEY;" },
    }),
    encoding: "utf8",
  });
  check(allowR.status === 0, `allow when process.env reference present`);

  // Allow JWT-shaped value tagged "example"
  const exR = spawnSync("node", [script], {
    input: JSON.stringify({
      session_id: "test", hook_event_name: "PreToolUse", tool_name: "Write",
      tool_input: { file_path: "/tmp/x.md", content: "// example: eyJabc.eyJdef.ghi (skipped)" },
    }),
    encoding: "utf8",
  });
  check(exR.status === 0, `allow when 'example' marker present (skip pattern)`);

  // Edit tool: scan new_string
  const editR = spawnSync("node", [script], {
    input: JSON.stringify({
      session_id: "test", hook_event_name: "PreToolUse", tool_name: "Edit",
      tool_input: { file_path: "/tmp/x.js", old_string: "old", new_string: "ghp_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA" },
    }),
    encoding: "utf8",
  });
  check(editR.status === 2, `Edit: blocks on github PAT in new_string (got ${editR.status})`);

  // Opt-out
  const offR = spawnSync("node", [script], {
    input: JSON.stringify({
      session_id: "test", hook_event_name: "PreToolUse", tool_name: "Write",
      tool_input: { file_path: "/tmp/x.js", content: "AKIAIOSFODNN7EXAMPLE_X" },
    }),
    encoding: "utf8",
    env: { ...process.env, ORCHESTRA_HOOK_PRE_WRITE_CHECK: "off" },
  });
  check(offR.status === 0, `pre-write-check opt-out: exits 0 even with secret-shaped content`);
}

// ---------- post-bash-lint (Observer) ----------
console.log("post-bash-lint:");
{
  const script = resolve(root, "hooks/scripts/post-bash-lint.js");

  const npmR = spawnSync("node", [script], {
    input: JSON.stringify({
      session_id: "test", hook_event_name: "PostToolUse", tool_name: "Bash",
      tool_input: { command: "npm install lodash" },
    }),
    encoding: "utf8",
  });
  check(npmR.status === 0, `post-bash-lint: exits 0 on npm install`);
  check(/source-modifying/.test(npmR.stderr), `post-bash-lint: emits stderr finding for npm install`);

  const benignR = spawnSync("node", [script], {
    input: JSON.stringify({
      session_id: "test", hook_event_name: "PostToolUse", tool_name: "Bash",
      tool_input: { command: "ls -la" },
    }),
    encoding: "utf8",
  });
  check(benignR.status === 0, `post-bash-lint: exits 0 on benign command`);
  check(benignR.stderr === "", `post-bash-lint: no stderr on benign command`);

  const offR = spawnSync("node", [script], {
    input: JSON.stringify({
      session_id: "test", hook_event_name: "PostToolUse", tool_name: "Bash",
      tool_input: { command: "npm install" },
    }),
    encoding: "utf8",
    env: { ...process.env, ORCHESTRA_HOOK_POST_BASH_LINT: "off" },
  });
  check(offR.status === 0 && offR.stderr === "", `post-bash-lint opt-out: exits 0, no stderr`);
}

// ---------- val-calibration (Rewriter) ----------
console.log("val-calibration:");
{
  const script = resolve(root, "hooks/scripts/val-calibration.js");
  const calibrationPath = resolve(root, "skills/evaluator-tuning/references/calibration-examples.md");

  // Triggered with evaluator subagent — PR #5 ships the calibration source,
  // so val-calibration MUST inject <calibration-anchor> into the prompt.
  // (PR #3 asserted graceful no-op; this assertion replaces that.)
  const evalR = spawnSync("node", [script], {
    input: JSON.stringify({
      session_id: "test", hook_event_name: "PreToolUse", tool_name: "Task",
      tool_input: { subagent_type: "evaluator", prompt: "evaluate fixture" },
    }),
    encoding: "utf8",
  });
  check(evalR.status === 0, `val-calibration: exits 0 (got ${evalR.status})`);
  const evalOut = JSON.parse(evalR.stdout || "{}");
  check(evalOut.hookSpecificOutput?.permissionDecision === "allow", `val-calibration: emits allow`);
  check(existsSync(calibrationPath), `val-calibration: calibration source ships in PR #5`);
  const evalUpdated = evalOut.hookSpecificOutput?.updatedInput;
  check(!!evalUpdated, `val-calibration: emits updatedInput when calibration file present`);
  check(typeof evalUpdated?.prompt === "string" && evalUpdated.prompt.includes("<calibration-anchor>"),
    `val-calibration: prompt contains <calibration-anchor> block`);
  check(typeof evalUpdated?.prompt === "string" && evalUpdated.prompt.includes("</calibration-anchor>"),
    `val-calibration: prompt contains </calibration-anchor> close tag`);
  check(typeof evalUpdated?.prompt === "string" && evalUpdated.prompt.endsWith("evaluate fixture"),
    `val-calibration: original prompt preserved at end`);

  // Non-evaluator subagent: passthrough
  const otherR = spawnSync("node", [script], {
    input: JSON.stringify({
      session_id: "test", hook_event_name: "PreToolUse", tool_name: "Task",
      tool_input: { subagent_type: "general-purpose", prompt: "research" },
    }),
    encoding: "utf8",
  });
  check(otherR.status === 0, `val-calibration: exits 0 for non-evaluator`);
  const otherOut = JSON.parse(otherR.stdout || "{}");
  check(!otherOut.hookSpecificOutput?.updatedInput, `val-calibration: no updatedInput for non-evaluator`);

  // Opt-out
  const offR = spawnSync("node", [script], {
    input: JSON.stringify({
      session_id: "test", hook_event_name: "PreToolUse", tool_name: "Task",
      tool_input: { subagent_type: "evaluator", prompt: "x" },
    }),
    encoding: "utf8",
    env: { ...process.env, ORCHESTRA_HOOK_VAL_CALIBRATION: "off" },
  });
  check(offR.status === 0, `val-calibration opt-out: exits 0`);
  const offOut = JSON.parse(offR.stdout || "{}");
  check(offOut.hookSpecificOutput?.permissionDecision === "allow", `val-calibration opt-out: emits allow`);

  // Tool-name agnostic: works the same when Claude Code dispatches via "Agent"
  // (canonical) instead of legacy "Task". The matcher in hooks.json is now
  // "Task|Agent", so the script must accept both tool_name values.
  const agentR = spawnSync("node", [script], {
    input: JSON.stringify({
      session_id: "test", hook_event_name: "PreToolUse", tool_name: "Agent",
      tool_input: { subagent_type: "evaluator", prompt: "Grade CONTRACT-001" },
    }),
    encoding: "utf8",
  });
  check(agentR.status === 0, `val-calibration: exits 0 for tool_name=Agent`);
  const agentOut = JSON.parse(agentR.stdout || "{}");
  check(
    typeof agentOut.hookSpecificOutput?.updatedInput?.prompt === "string" &&
      agentOut.hookSpecificOutput.updatedInput.prompt.includes("<calibration-anchor>"),
    `val-calibration: injects calibration-anchor on tool_name=Agent`,
  );
}

// ---------- hooks.json matcher validation ----------
// Smoke #3 surfaced that hooks.json had matcher: "Task" but Claude Code's
// subagent-spawn tool is now "Agent" — the hook never fired on real runs,
// silently breaking val-calibration. Tests didn't catch it because they call
// hook scripts directly (synthesizing stdin), bypassing the matcher routing.
// This validator closes that gap: every PreToolUse matcher's atoms must be
// either a known Claude Code tool name or a recognized MCP regex pattern.
console.log("hooks.json matcher validation:");
{
  const KNOWN_TOOLS = new Set([
    "Bash", "Read", "Write", "Edit", "MultiEdit",
    "Glob", "Grep", "NotebookEdit",
    "WebFetch", "WebSearch",
    "Agent", "Task",       // Agent canonical; Task legacy alias retained for older Claude Code
    "TodoWrite", "TeamCreate",
    "Skill",               // user/agent skill invocations
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
      return { ok: false, reason: `atom "${atom}" is neither a known tool nor mcp__*.*`};
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

  // Real hooks.json passes
  const hooksPath = resolve(root, "hooks/hooks.json");
  const hooksJson = JSON.parse(readFileSync(hooksPath, "utf8")).hooks;
  const findings = validateHooksMatchers(hooksJson);
  check(findings.length === 0, `hooks.json: every PreToolUse matcher is known (got: ${findings.join("; ")})`);

  // Mutation: synthetic FakeTool atom must fail red
  const bad1 = validateHooksMatchers({ PreToolUse: [{ matcher: "FakeTool", hooks: [] }] });
  check(bad1.length === 1, `mutation: matcher="FakeTool" produces 1 finding (got ${bad1.length})`);

  // Mutation: alternation with one bad atom must fail
  const bad2 = validateHooksMatchers({ PreToolUse: [{ matcher: "Write|MadeUpTool|Edit", hooks: [] }] });
  check(bad2.length === 1, `mutation: matcher="Write|MadeUpTool|Edit" produces 1 finding (got ${bad2.length})`);

  // Mutation: missing matcher key must fail
  const bad3 = validateHooksMatchers({ PreToolUse: [{ hooks: [] }] });
  check(bad3.length === 1, `mutation: missing matcher key produces 1 finding (got ${bad3.length})`);

  // Inverse sanity: typical alternations must pass
  const ok1 = validateHooksMatchers({ PreToolUse: [{ matcher: "Write|Edit|MultiEdit", hooks: [] }] });
  check(ok1.length === 0, `inverse: matcher="Write|Edit|MultiEdit" passes clean`);
  const ok2 = validateHooksMatchers({ PreToolUse: [{ matcher: "Task|Agent", hooks: [] }] });
  check(ok2.length === 0, `inverse: matcher="Task|Agent" passes clean`);
  const ok3 = validateHooksMatchers({ PreToolUse: [{ matcher: "mcp__orchestra-.*", hooks: [] }] });
  check(ok3.length === 0, `inverse: matcher="mcp__orchestra-.*" passes clean`);
  const ok4 = validateHooksMatchers({ PreToolUse: [{ matcher: "TeamCreate", hooks: [] }] });
  check(ok4.length === 0, `inverse: matcher="TeamCreate" passes clean`);
}

if (failures > 0) {
  console.error(`test-hooks.js: FAIL (${passes} passed, ${failures} failed)`);
  process.exit(1);
}
console.log(`test-hooks.js: OK (${passes} assertions passed)`);
