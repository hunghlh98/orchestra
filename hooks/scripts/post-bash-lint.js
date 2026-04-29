#!/usr/bin/env node
// hooks/scripts/post-bash-lint.js
// Observer hook: detects source-modifying Bash commands and surfaces a
// stderr finding. Exits 0 always.
// See DESIGN-001-infra §3.4.

const NAME = "ORCHESTRA_HOOK_POST_BASH_LINT";

if (process.env[NAME] === "off") {
  process.exit(0);
}

const SOURCE_MODIFYING_PATTERNS = [
  { name: "npm-install",   re: /\bnpm\s+(install|i|ci|update|add)\b/ },
  { name: "yarn-install",  re: /\byarn\s+(install|add|upgrade)\b/ },
  { name: "pnpm-install",  re: /\bpnpm\s+(install|i|add|update)\b/ },
  { name: "sed-inplace",   re: /\bsed\s+-i\b/ },
  { name: "tee",           re: /\btee\b/ },
  { name: "redirect-src",  re: />\s*\S+\.(?:js|ts|tsx|jsx|java|py|kt|go|rs)\b/ },
];

main();

async function main() {
  let stdin = "";
  try {
    process.stdin.setEncoding("utf8");
    for await (const chunk of process.stdin) stdin += chunk;
    const input = JSON.parse(stdin);
    const cmd = input?.tool_input?.command;
    if (typeof cmd !== "string") { process.exit(0); }

    for (const { name, re } of SOURCE_MODIFYING_PATTERNS) {
      if (re.test(cmd)) {
        process.stderr.write(
          `post-bash-lint: source-modifying command detected (${name}): ${cmd}\n`
        );
        // Continue scanning for additional patterns; observer hook never blocks.
      }
    }
    process.exit(0);
  } catch (err) {
    process.stderr.write(`post-bash-lint crashed: ${err.message}\n`);
    process.exit(0);
  }
}
