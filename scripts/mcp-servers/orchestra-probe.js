#!/usr/bin/env node
// scripts/mcp-servers/orchestra-probe.js
// MCP server: runtime probes for @evaluator. Two tools: http_probe, db_state.
// See PRD §9.10 / DESIGN-001-infra §4.2.
//
// SQL backend support (v1.0.0): sqlite3 only via the `sqlite3` CLI.
// postgres / mysql DSN schemes are stubbed with a clear "deferred to v1.1+"
// message — full CLI dispatch with parameter binding is non-trivial enough
// to warrant its own design pass. The MCP API surface (DSN format, tool
// schema) is locked now so v1.1 only adds the implementations.

import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

// === Secret patterns for response-body redaction ===
// Mirrors pre-write-check.js's pattern set. Drift is monitored by code review;
// extracting to a shared lib is a future refactor (PR #5+ if needed).
const REDACT_PATTERNS = [
  { name: "aws-key",         re: /AKIA[0-9A-Z]{16}/g },
  { name: "github-pat",      re: /\bghp_[A-Za-z0-9]{36}\b/g },
  { name: "github-pat-fine", re: /\bgithub_pat_[A-Za-z0-9_]{82}\b/g },
  { name: "jwt",             re: /\beyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g },
  { name: "rsa-private-key", re: /-----BEGIN (?:RSA |EC )?PRIVATE KEY-----/g },
  { name: "slack-token",     re: /\bxox[baprs]-[A-Za-z0-9-]+/g },
  { name: "google-api-key",  re: /\bAIza[A-Za-z0-9_-]{35}\b/g },
  { name: "bearer-auth",     re: /\b(?:Bearer|Basic)\s+[A-Za-z0-9+/=._-]{12,}/g },
];

export function redact(text) {
  if (typeof text !== "string") return text;
  let out = text;
  for (const { name, re } of REDACT_PATTERNS) {
    out = out.replace(re, `[REDACTED:${name}]`);
  }
  return out;
}

// === MCP tool schemas ===
export const TOOLS = [
  {
    name: "http_probe",
    description: "Make an HTTP request and return status, filtered headers, and (truncated) body. Response body passes through secret-redaction before being returned.",
    inputSchema: {
      type: "object",
      required: ["method", "url"],
      properties: {
        method: { type: "string", enum: ["GET", "POST", "PUT", "DELETE", "PATCH", "HEAD"] },
        url: { type: "string", format: "uri" },
        headers: { type: "object", additionalProperties: { type: "string" } },
        body: { type: "string" },
        timeout_ms: { type: "integer", default: 5000, maximum: 30000 },
        follow_redirects: { type: "boolean", default: false },
        max_body_bytes: { type: "integer", default: 65536 },
      },
    },
  },
  {
    name: "db_state",
    description: "Run a parameterized SELECT against sqlite3 (postgres/mysql deferred to v1.1+). Read-only; SELECT-only enforced server-side. Response body passes through secret-redaction.",
    inputSchema: {
      type: "object",
      required: ["dsn", "query"],
      properties: {
        dsn: { type: "string", description: "sqlite3:///path | postgres://... | mysql://..." },
        query: { type: "string", description: "SQL with ?-style placeholders." },
        params: { type: "array", items: { type: ["string", "number", "boolean", "null"] }, default: [] },
        timeout_ms: { type: "integer", default: 5000, maximum: 30000 },
        row_cap: { type: "integer", default: 100, maximum: 1000 },
      },
    },
  },
];

// === http_probe impl ===
export async function httpProbeImpl({
  method, url, headers = {}, body,
  timeout_ms = 5000, follow_redirects = false, max_body_bytes = 65536,
} = {}) {
  if (!method || !url) throw new Error("http_probe: method and url are required");
  const u = new URL(url);
  const lib = u.protocol === "https:" ? httpsRequest : httpRequest;

  return new Promise((resolveP, rejectP) => {
    const req = lib({
      method, hostname: u.hostname, port: u.port,
      path: u.pathname + u.search, headers,
      timeout: timeout_ms,
    }, res => {
      const chunks = [];
      let total = 0;
      let truncated = false;
      res.on("data", chunk => {
        if (total + chunk.length > max_body_bytes) {
          chunks.push(chunk.slice(0, max_body_bytes - total));
          total = max_body_bytes;
          truncated = true;
          res.destroy();
        } else {
          chunks.push(chunk);
          total += chunk.length;
        }
      });
      res.on("end", () => finalize(res, chunks, truncated, resolveP));
      res.on("close", () => finalize(res, chunks, truncated, resolveP));
    });
    req.on("timeout", () => { req.destroy(new Error("timeout")); });
    req.on("error", err => rejectP(err));
    if (body) req.write(body);
    req.end();
  });
}

function finalize(res, chunks, truncated, resolveP) {
  if (res._orchestraDone) return;
  res._orchestraDone = true;
  const body = Buffer.concat(chunks).toString("utf8");
  const filteredHeaders = Object.fromEntries(
    Object.entries(res.headers).filter(([k]) => !/^(set-cookie|authorization)$/i.test(k))
  );
  resolveP({
    status: res.statusCode,
    headers: filteredHeaders,
    body: redact(body),
    body_bytes: body.length,
    truncated,
  });
}

// === db_state impl ===
export function dbStateImpl({ dsn, query, params = [], timeout_ms = 5000, row_cap = 100 } = {}) {
  if (!dsn || !query) throw new Error("db_state: dsn and query are required");
  if (!isSelectOnly(query)) {
    throw new Error("db_state: SELECT-only enforced. WITH/CTE, INSERT, UPDATE, DELETE, DROP rejected (v1.0.0; CTE support deferred to v1.1+).");
  }
  const cap = Math.min(Math.max(row_cap | 0, 1), 1000);
  const t = Math.min(Math.max(timeout_ms | 0, 100), 30000);

  const driver = dsnDriver(dsn);
  if (driver === "sqlite3") return sqliteRun(dsn, query, params, t, cap);
  if (driver === "postgres") {
    throw new Error("db_state: postgres DSN deferred to v1.1+ (sqlite3 only in v1.0.0).");
  }
  if (driver === "mysql") {
    throw new Error("db_state: mysql DSN deferred to v1.1+ (sqlite3 only in v1.0.0).");
  }
  throw new Error(`db_state: unrecognized DSN scheme in '${maskDsn(dsn)}'`);
}

function dsnDriver(dsn) {
  if (dsn.startsWith("sqlite3://")) return "sqlite3";
  if (dsn.startsWith("postgres://") || dsn.startsWith("postgresql://")) return "postgres";
  if (dsn.startsWith("mysql://")) return "mysql";
  return null;
}

function maskDsn(dsn) {
  // Replace any user:pass@ with ***
  return dsn.replace(/\/\/[^@/]+@/, "//***@");
}

function isSelectOnly(query) {
  const stripped = query
    .replace(/--.*$/gm, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .trim();
  const first = stripped.split(/\s+/)[0]?.toUpperCase() || "";
  return first === "SELECT";
}

function quoteValue(v) {
  if (v === null || v === undefined) return "NULL";
  if (typeof v === "number") return String(v);
  if (typeof v === "boolean") return v ? "1" : "0";
  if (typeof v === "string") return "'" + v.replace(/'/g, "''") + "'";
  return "NULL";
}

function substituteParams(query, params) {
  let i = 0;
  return query.replace(/\?/g, () => {
    const v = params[i++];
    return quoteValue(v);
  });
}

function sqliteRun(dsn, query, params, timeout_ms, row_cap) {
  // dsn = "sqlite3:///path/to/db.sqlite" or "sqlite3://./relative.db"
  const path = dsn.replace(/^sqlite3:\/\//, "");
  const finalQuery = substituteParams(query, params);
  // Pipe via stdin so sqlite3 does not parse leading `--`/`-` (SQL comments)
  // as CLI options.
  const result = spawnSync("sqlite3", ["-json", path], {
    input: finalQuery,
    timeout: timeout_ms,
    encoding: "utf8",
  });
  if (result.signal === "SIGTERM" || result.error?.code === "ETIMEDOUT") {
    throw new Error(`db_state: query timed out after ${timeout_ms}ms`);
  }
  if (result.error?.code === "ENOENT") {
    throw new Error("db_state: sqlite3 CLI not on PATH");
  }
  if (result.status !== 0) {
    throw new Error(`db_state: sqlite3 failed (${result.stderr?.trim() || "no stderr"})`);
  }
  let rows;
  try { rows = result.stdout.trim() ? JSON.parse(result.stdout) : []; }
  catch { rows = []; }
  const capped = rows.slice(0, row_cap);
  return capped.map(row =>
    Object.fromEntries(
      Object.entries(row).map(([k, v]) => [k, typeof v === "string" ? redact(v) : v])
    )
  );
}

// === MCP server (run only when this file is the entry point) ===
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  startServer();
}

function startServer() {
  if (process.env.ORCHESTRA_MCP_ORCHESTRA_PROBE === "off") {
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

async function handleMessage(line) {
  let msg;
  try { msg = JSON.parse(line); }
  catch { return reply(null, { error: { code: -32700, message: "Parse error" } }); }
  const { id, method, params } = msg;
  if (method === "initialize") {
    reply(id, {
      result: {
        protocolVersion: "2024-11-05",
        capabilities: { tools: {} },
        serverInfo: { name: "orchestra-probe", version: "1.0.0" },
      },
    });
  } else if (method === "tools/list") {
    reply(id, { result: { tools: TOOLS } });
  } else if (method === "tools/call") {
    try {
      const name = params?.name;
      const args = params?.arguments || {};
      let out;
      if (name === "http_probe") out = await httpProbeImpl(args);
      else if (name === "db_state") out = dbStateImpl(args);
      else throw new Error(`Unknown tool: ${name}`);
      reply(id, { result: { content: [{ type: "text", text: JSON.stringify(out) }] } });
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
