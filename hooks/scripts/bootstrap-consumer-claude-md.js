#!/usr/bin/env node
// Bootstrap or update <consumer>/CLAUDE.md from the orchestra template.
// Invoked by commands/orchestra.md after .orchestra/local.yaml persists.
// Idempotent:
//   target missing        → write `# CLAUDE.md` + tagged orchestra section
//   target exists, no tag → append tagged orchestra section
//   target exists, tagged → splice between markers (re-renders if template drifted)
//   already up-to-date    → no write

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const START = "<!-- orchestra:start -->";
const END = "<!-- orchestra:end -->";
const TEMPLATE = resolve(__dirname, "..", "references", "consumer-claude-md.template.md");

function section(body) {
  return `${START}\n${body.trim()}\n${END}\n`;
}

function freshFile(body) {
  return `# CLAUDE.md\n\n${section(body)}`;
}

function splice(existing, body) {
  const s = existing.indexOf(START);
  const e = existing.indexOf(END);
  if (s === -1 || e === -1 || e < s) {
    const sep = existing.endsWith("\n") ? "\n" : "\n\n";
    return existing + sep + section(body);
  }
  const before = existing.slice(0, s);
  let after = existing.slice(e + END.length);
  // Consume one newline after END if present — section() emits its own,
  // so otherwise each run would grow the gap by one byte (loss of idempotency).
  if (after.startsWith("\n")) after = after.slice(1);
  return `${before}${section(body)}${after}`;
}

function main() {
  const root = process.argv[2] || process.cwd();
  const target = join(root, "CLAUDE.md");
  const body = readFileSync(TEMPLATE, "utf8");

  if (!existsSync(target)) {
    writeFileSync(target, freshFile(body));
    process.stdout.write(`bootstrap-consumer-claude-md: created ${target}\n`);
    return 0;
  }

  const existing = readFileSync(target, "utf8");
  const next = splice(existing, body);
  if (next === existing) {
    process.stdout.write(`bootstrap-consumer-claude-md: unchanged ${target}\n`);
    return 0;
  }
  writeFileSync(target, next);
  const action = existing.includes(START) ? "updated" : "appended";
  process.stdout.write(`bootstrap-consumer-claude-md: ${action} orchestra section in ${target}\n`);
  return 0;
}

process.exit(main());
