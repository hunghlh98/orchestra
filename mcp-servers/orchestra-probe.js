#!/usr/bin/env node
// mcp-servers/orchestra-probe.js
// MCP server: runtime probes for @evaluator. Two tools: http_probe, db_state.
//
// SSRF defense (http_probe): resolves the hostname to an IP, rejects any
// response whose first address falls inside the loopback / RFC1918 /
// link-local / metadata ranges, and pins the outbound socket to the
// validated address via a `lookup` shim so DNS rebinding cannot redirect
// after the validation pass. Opt in to localhost by setting
// ORCHESTRA_PROBE_ALLOW_LOCALHOST=1.
//
// DSN allowlist (db_state): sqlite3 paths must resolve under
// process.cwd() (the consumer's project root). Absolute paths outside the
// working tree are rejected; opt out with ORCHESTRA_PROBE_ALLOW_ABS_DSN=1.
//
// SQL backend support: sqlite3 only via the `sqlite3` CLI. The query passes
// a char-walker SELECT-only check that handles `--` line comments and
// `/* */` block comments INSIDE string-literal awareness (a stray `--` in
// a literal no longer truncates the query). The substitution layer is a
// client-side `?`-replacement with single-quote doubling — described as
// such in the tool schema (no claim of prepared statements).

import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolve, relative, isAbsolute } from "node:path";
import { lookup as dnsLookup } from "node:dns/promises";
import { isIP } from "node:net";

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

// === Header allowlist + size cap ===
// Limits caller-supplied headers to the small set legitimate probes need.
// Blocks Host overrides and any custom header outside this allowlist.
const HEADER_ALLOWLIST = new Set([
  "authorization",
  "content-type",
  "accept",
  "user-agent",
  "x-request-id",
]);
const MAX_HEADER_BYTES = 8 * 1024;

export function filterHeaders(headers) {
  if (!headers || typeof headers !== "object") return {};
  const filtered = {};
  let bytes = 0;
  for (const [key, value] of Object.entries(headers)) {
    const lower = String(key).toLowerCase();
    if (!HEADER_ALLOWLIST.has(lower)) {
      throw new Error(
        `http_probe: header '${key}' not in allowlist [${[...HEADER_ALLOWLIST].join(", ")}]`
      );
    }
    if (typeof value !== "string") {
      throw new Error(`http_probe: header '${key}' must be a string`);
    }
    bytes += Buffer.byteLength(lower, "utf8") + Buffer.byteLength(value, "utf8") + 4;
    if (bytes > MAX_HEADER_BYTES) {
      throw new Error(`http_probe: total header bytes exceed ${MAX_HEADER_BYTES}`);
    }
    filtered[lower] = value;
  }
  return filtered;
}

// === SSRF host validation ===
// Rejects loopback / RFC1918 / link-local / metadata addresses. Operates on
// the resolved IP, not the hostname, so DNS records pointing at private
// space cannot be reached.
export function isPrivateOrLoopbackIp(ip) {
  const family = isIP(ip);
  if (family === 0) return true;
  if (family === 4) {
    const [a, b] = ip.split(".").map(n => parseInt(n, 10));
    if (a === 127) return true;
    if (a === 10) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 169 && b === 254) return true; // link-local + AWS/GCP metadata
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
    if (a === 0) return true;
    if (a >= 224) return true; // multicast + reserved
    return false;
  }
  // IPv6
  const lower = ip.toLowerCase();
  if (lower === "::1") return true;
  if (lower === "::") return true;
  if (lower.startsWith("fe80:")) return true; // link-local
  if (lower.startsWith("fc") || lower.startsWith("fd")) return true; // ULA
  if (lower.startsWith("ff")) return true; // multicast
  if (lower.startsWith("::ffff:")) {
    return isPrivateOrLoopbackIp(lower.slice(7));
  }
  return false;
}

export async function resolveAndValidateHost(hostname) {
  const allowLocalhost = process.env.ORCHESTRA_PROBE_ALLOW_LOCALHOST === "1";
  // Literal IP — validate directly without resolving.
  const literalFamily = isIP(hostname);
  if (literalFamily !== 0) {
    if (!allowLocalhost && isPrivateOrLoopbackIp(hostname)) {
      throw new Error(`http_probe: host '${hostname}' resolves to a private/loopback/link-local address (denylisted)`);
    }
    return { address: hostname, family: literalFamily };
  }
  let resolved;
  try {
    resolved = await dnsLookup(hostname, { all: false, verbatim: true });
  } catch (e) {
    throw new Error(`http_probe: dns lookup failed for '${hostname}': ${e.message}`);
  }
  if (!allowLocalhost && isPrivateOrLoopbackIp(resolved.address)) {
    throw new Error(
      `http_probe: host '${hostname}' resolves to ${resolved.address} which is private/loopback/link-local (denylisted)`
    );
  }
  return resolved;
}

// === DSN path allowlist ===
// sqlite3 DSNs must reference a file under process.cwd() unless opted out
// via ORCHESTRA_PROBE_ALLOW_ABS_DSN. Blocks reads of arbitrary on-disk
// SQLite files (browser histories, native-app caches, secrets DBs).
export function validateDsnPath(dsn) {
  if (!dsn.startsWith("sqlite3://")) return; // only sqlite3 is implemented
  if (process.env.ORCHESTRA_PROBE_ALLOW_ABS_DSN === "1") return;
  const raw = dsn.replace(/^sqlite3:\/\//, "");
  const cwd = process.cwd();
  const abs = isAbsolute(raw) ? resolve(raw) : resolve(cwd, raw);
  const rel = relative(cwd, abs);
  if (rel.startsWith("..") || isAbsolute(rel)) {
    throw new Error(
      `db_state: dsn path '${raw}' is outside the working tree (${cwd}). ` +
      `Opt-in via ORCHESTRA_PROBE_ALLOW_ABS_DSN=1.`
    );
  }
}

// === MCP tool schemas ===
export const TOOLS = [
  {
    name: "http_probe",
    description: "Make an HTTP request and return status, filtered headers, and (truncated) body. Resolves the hostname and rejects private / loopback / link-local / metadata addresses (SSRF guard). Caller-supplied headers are filtered through an allowlist. Response body passes through secret-redaction before being returned.",
    inputSchema: {
      type: "object",
      required: ["method", "url"],
      properties: {
        method: { type: "string", enum: ["GET", "POST", "PUT", "DELETE", "PATCH", "HEAD"] },
        url: { type: "string", format: "uri" },
        headers: {
          type: "object",
          description: "Allowlist: Authorization, Content-Type, Accept, User-Agent, X-Request-Id (case-insensitive). Total header bytes capped at 8 KiB.",
          additionalProperties: { type: "string" },
        },
        body: { type: "string" },
        timeout_ms: { type: "integer", default: 5000, maximum: 30000 },
        follow_redirects: { type: "boolean", default: false },
        max_body_bytes: { type: "integer", default: 65536 },
      },
    },
  },
  {
    name: "db_state",
    description: "Run a client-side ?-substituted SELECT against sqlite3 (postgres/mysql deferred). Single quotes in string params are doubled; this is NOT a prepared-statement binding — the substitution happens before sqlite parses the query. Read-only; SELECT-only enforced server-side with literal-aware comment parsing. DSN sqlite paths are restricted to the working tree unless ORCHESTRA_PROBE_ALLOW_ABS_DSN=1. Response body passes through secret-redaction.",
    inputSchema: {
      type: "object",
      required: ["dsn", "query"],
      properties: {
        dsn: { type: "string", description: "sqlite3:///path | postgres://... | mysql://... (sqlite path must be under process.cwd() by default)" },
        query: { type: "string", description: "SQL with ?-style placeholders. Single-quote doubling applied to string params before substitution; NOT a prepared statement." },
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
  if (u.protocol !== "http:" && u.protocol !== "https:") {
    throw new Error(`http_probe: protocol '${u.protocol}' not supported (http/https only)`);
  }
  const lib = u.protocol === "https:" ? httpsRequest : httpRequest;

  const resolved = await resolveAndValidateHost(u.hostname);
  const safeHeaders = filterHeaders(headers);

  // Pin the outbound socket to the validated IP via a `lookup` override so a
  // second DNS resolution (DNS rebinding) cannot redirect the request after
  // the validation pass.
  const pinnedLookup = (_host, _opts, cb) => {
    cb(null, resolved.address, resolved.family || (isIP(resolved.address) || 4));
  };

  return new Promise((resolveP, rejectP) => {
    const req = lib({
      method,
      hostname: u.hostname,
      port: u.port,
      path: u.pathname + u.search,
      headers: safeHeaders,
      timeout: timeout_ms,
      lookup: pinnedLookup,
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
  validateDsnPath(dsn);
  if (!isSelectOnly(query)) {
    throw new Error("db_state: SELECT-only enforced. WITH/CTE, INSERT, UPDATE, DELETE, DROP rejected; CTE support deferred.");
  }
  const cap = Math.min(Math.max(row_cap | 0, 1), 1000);
  const t = Math.min(Math.max(timeout_ms | 0, 100), 30000);

  const driver = dsnDriver(dsn);
  if (driver === "sqlite3") return sqliteRun(dsn, query, params, t, cap);
  if (driver === "postgres") {
    throw new Error("db_state: postgres DSN deferred (sqlite3 only).");
  }
  if (driver === "mysql") {
    throw new Error("db_state: mysql DSN deferred (sqlite3 only).");
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

// SELECT-only check with literal-aware comment handling.
// `--` and `/* */` are stripped ONLY outside string/identifier/backtick/
// bracket literals. Single-quote doubling (`''`) keeps the parser inside
// the literal. Multi-statement bypass (any non-trailing `;` outside a
// literal) is rejected.
export function isSelectOnly(query) {
  let inSingle = false, inDouble = false, inBacktick = false, inBracket = false;
  let stripped = "";
  for (let i = 0; i < query.length; i++) {
    const c = query[i];
    const inAnyLiteral = inSingle || inDouble || inBacktick || inBracket;

    if (!inAnyLiteral) {
      // Line comment `--` runs to end of line.
      if (c === "-" && query[i + 1] === "-") {
        while (i < query.length && query[i] !== "\n") i++;
        continue;
      }
      // Block comment `/* ... */` runs to first `*/`.
      if (c === "/" && query[i + 1] === "*") {
        i += 2;
        while (i < query.length - 1 && !(query[i] === "*" && query[i + 1] === "/")) i++;
        i += 1; // land on `/`, loop increment moves past it
        continue;
      }
    }

    // Literal state transitions.
    if (!inDouble && !inBacktick && !inBracket && c === "'") {
      if (inSingle && query[i + 1] === "'") {
        stripped += "''";
        i++;
        continue;
      }
      inSingle = !inSingle;
    } else if (!inSingle && !inBacktick && !inBracket && c === '"') {
      inDouble = !inDouble;
    } else if (!inSingle && !inDouble && !inBracket && c === "`") {
      inBacktick = !inBacktick;
    } else if (!inSingle && !inDouble && !inBacktick && !inBracket && c === "[") {
      inBracket = true;
    } else if (inBracket && c === "]") {
      inBracket = false;
    } else if (!inSingle && !inDouble && !inBacktick && !inBracket && c === ";") {
      const rest = query.slice(i + 1).replace(/--.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "").trim();
      if (rest.length > 0) return false;
    }
    stripped += c;
  }
  const trimmed = stripped.trim();
  const first = trimmed.split(/\s+/)[0]?.toUpperCase() || "";
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
  // as CLI options. SIGKILL on timeout because sqlite3 may ignore SIGTERM
  // mid-query and leave the parent blocked.
  const result = spawnSync("sqlite3", ["-readonly", "-json", path], {
    input: finalQuery,
    timeout: timeout_ms,
    killSignal: "SIGKILL",
    encoding: "utf8",
  });
  if (result.signal === "SIGKILL" || result.signal === "SIGTERM" || result.error?.code === "ETIMEDOUT") {
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
if (isEntryPoint()) {
  startServer();
}

function isEntryPoint() {
  if (!process.argv[1]) return false;
  const here = fileURLToPath(import.meta.url);
  const there = resolve(process.argv[1]);
  // path.relative returns "" when both paths point at the same file, even
  // across casing/separator quirks that string-compare would miss.
  return relative(here, there) === "";
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
  const isNotification = id === undefined || id === null;
  if (method === "initialize") {
    if (isNotification) return; // notifications get no reply
    reply(id, {
      result: {
        protocolVersion: "2024-11-05",
        capabilities: { tools: {} },
        serverInfo: { name: "orchestra-probe", version: "1.0.0" },
      },
    });
  } else if (method === "tools/list") {
    if (isNotification) return;
    reply(id, { result: { tools: TOOLS } });
  } else if (method === "tools/call") {
    if (isNotification) return;
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
  } else if (typeof method === "string" && method.startsWith("notifications/")) {
    // JSON-RPC 2.0 §4.1 — notifications (id-less) get NO reply.
    return;
  } else if (isNotification) {
    // Any other id-less call — silently drop per JSON-RPC 2.0 §4.1.
    return;
  } else {
    reply(id, { error: { code: -32601, message: `Method not found: ${method}` } });
  }
}

function reply(id, payload) {
  const msg = { jsonrpc: "2.0", id, ...payload };
  process.stdout.write(JSON.stringify(msg) + "\n");
}
