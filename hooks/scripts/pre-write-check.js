#!/usr/bin/env node
// hooks/scripts/pre-write-check.js
// Blocker hook: detects secrets in Write/Edit/MultiEdit content. exit 2 on hit.
// See DESIGN-001-infra §3.2 / PRD §9.9.

const NAME = "ORCHESTRA_HOOK_PRE_WRITE_CHECK";

if (process.env[NAME] === "off") {
  process.exit(0);
}

const PATTERNS = [
  { name: "aws-access-key",  re: /AKIA[0-9A-Z]{16}/ },
  { name: "github-pat",      re: /\bghp_[A-Za-z0-9]{36}\b/ },
  { name: "github-pat-fine", re: /\bgithub_pat_[A-Za-z0-9_]{82}\b/ },
  { name: "jwt",             re: /\beyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/ },
  { name: "rsa-private-key", re: /-----BEGIN (?:RSA |EC )?PRIVATE KEY-----/ },
  { name: "slack-token",     re: /\bxox[baprs]-[A-Za-z0-9-]+/ },
  { name: "google-api-key",  re: /\bAIza[A-Za-z0-9_-]{35}\b/ },
  { name: "bearer-auth",     re: /\b(?:Bearer|Basic)\s+[A-Za-z0-9+/=._-]{12,}/ },
];

const SKIP_PATTERNS = [
  /process\.env\./,
  /\$\{/,
  /placeholder/i,
  /<your-/i,
  /example/i,
  /test-fixture/i,
];

main();

async function main() {
  let stdin = "";
  try {
    process.stdin.setEncoding("utf8");
    for await (const chunk of process.stdin) stdin += chunk;
    const input = JSON.parse(stdin);
    const content = extractContent(input.tool_name, input.tool_input);
    if (!content) { process.exit(0); }

    const lines = content.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (SKIP_PATTERNS.some(rx => rx.test(line))) continue;
      for (const { name, re } of PATTERNS) {
        if (re.test(line)) {
          process.stderr.write(
            `pre-write-check: detected ${name} at line ${i + 1}. Use process.env or a placeholder.\n`
          );
          process.exit(2);
        }
      }
    }
    process.exit(0);
  } catch (err) {
    // Crash semantics: never block on our own bug.
    process.stderr.write(`pre-write-check crashed: ${err.message}\n`);
    process.exit(0);
  }
}

function extractContent(toolName, toolInput) {
  if (!toolInput) return "";
  if (toolName === "Write") return toolInput.content || "";
  if (toolName === "Edit") return toolInput.new_string || "";
  if (toolName === "MultiEdit") {
    return (toolInput.edits || []).map(e => e?.new_string || "").join("\n");
  }
  return "";
}
