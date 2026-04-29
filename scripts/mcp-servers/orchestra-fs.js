#!/usr/bin/env node
// scripts/mcp-servers/orchestra-fs.js
// MCP server: filesystem exploration with auditable tool calls.
// One tool: `tree`. See PRD §9.10 / DESIGN-001-infra §4.1.
//
// Stdlib-only Node. Wraps a stdlib fs.readdir walker that produces
// tree-style output. The system `tree` CLI dependency was deferred —
// the stdlib walker is portable across all consumer platforms.

import { readdirSync } from "node:fs";
import { resolve, relative, basename } from "node:path";
import { fileURLToPath } from "node:url";

export const TOOLS = [
  {
    name: "tree",
    description: "Recursively list directory contents in a tree-like format. Wraps the system tree CLI as a named, trackable MCP tool so exploration is auditable.",
    inputSchema: {
      type: "object",
      required: ["path"],
      properties: {
        path: { type: "string", description: "Directory to walk (relative to cwd; '..' escape rejected)." },
        depth: { type: "integer", default: 3, minimum: 1, maximum: 8 },
        ignore_globs: {
          type: "array",
          items: { type: "string" },
          default: ["node_modules", ".git", ".venv"],
        },
      },
    },
  },
];

export function treeImpl({ path, depth = 3, ignore_globs = ["node_modules", ".git", ".venv"] } = {}) {
  if (typeof path !== "string" || path === "") throw new Error("tree: path is required");
  const cwd = process.cwd();
  const resolved = resolve(cwd, path);
  const rel = relative(cwd, resolved);
  if (rel.startsWith("..") || resolved.split("/").includes("..")) {
    throw new Error(`tree: path escapes cwd: ${path}`);
  }
  const lines = [basename(resolved) + "/"];
  walk(resolved, "", depth, new Set(ignore_globs), lines);
  return lines.join("\n");
}

function walk(dir, prefix, depth, ignore, lines) {
  if (depth <= 0) return;
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true }); }
  catch { return; }
  const filtered = entries.filter(e => !ignore.has(e.name)).sort((a, b) => {
    if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  for (let i = 0; i < filtered.length; i++) {
    const entry = filtered[i];
    const isLast = i === filtered.length - 1;
    const branch = isLast ? "└── " : "├── ";
    const subPrefix = isLast ? "    " : "│   ";
    if (entry.isDirectory()) {
      lines.push(prefix + branch + entry.name + "/");
      walk(resolve(dir, entry.name), prefix + subPrefix, depth - 1, ignore, lines);
    } else {
      lines.push(prefix + branch + entry.name);
    }
  }
}

// === MCP server (run only when this file is the entry point) ===
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  startServer();
}

function startServer() {
  if (process.env.ORCHESTRA_MCP_ORCHESTRA_FS === "off") {
    process.exit(0);
  }
  let buf = "";
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", chunk => {
    buf += chunk;
    let nl;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (line) handleMessage(line);
    }
  });
}

function handleMessage(line) {
  let msg;
  try { msg = JSON.parse(line); }
  catch { return reply(null, { error: { code: -32700, message: "Parse error" } }); }
  const { id, method, params } = msg;
  if (method === "initialize") {
    reply(id, {
      result: {
        protocolVersion: "2024-11-05",
        capabilities: { tools: {} },
        serverInfo: { name: "orchestra-fs", version: "1.0.0" },
      },
    });
  } else if (method === "tools/list") {
    reply(id, { result: { tools: TOOLS } });
  } else if (method === "tools/call") {
    try {
      const out = treeImpl(params?.arguments || {});
      reply(id, { result: { content: [{ type: "text", text: out }] } });
    } catch (err) {
      reply(id, { result: { isError: true, content: [{ type: "text", text: String(err.message || err) }] } });
    }
  } else if (method === "notifications/initialized") {
    // no-op
  } else {
    reply(id, { error: { code: -32601, message: `Method not found: ${method}` } });
  }
}

function reply(id, payload) {
  const msg = { jsonrpc: "2.0", id, ...payload };
  process.stdout.write(JSON.stringify(msg) + "\n");
}
