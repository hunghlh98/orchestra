#!/usr/bin/env node
// scripts/tests/probe.test.js
// MCP probe contract tests: http_probe round-trip, db_state SELECT-only +
// secret redaction + timeout + row_cap. orchestra-utils coverage lives in
// scripts/tests/orchestra-utils.test.js.
//
// Server source lives at mcp-servers/orchestra-probe.js (plugin-root sibling
// to agents/, commands/, hooks/, skills/). Tests import via ../../mcp-servers/.

import { createServer } from "node:http";
import { mkdtempSync, writeFileSync, readFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

import {
  httpProbeImpl, dbStateImpl, redact,
  filterHeaders, resolveAndValidateHost, isPrivateOrLoopbackIp, validateDsnPath,
  isSelectOnly,
} from "../../mcp-servers/orchestra-probe.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
let passes = 0, failures = 0;

function check(cond, msg) {
  if (cond) passes++;
  else { failures++; console.error(`  FAIL: ${msg}`); }
}

// ---------- redaction unit ----------
console.log("redact():");
{
  check(redact("foo AKIAQWERTYUIOPASDFGH bar") === "foo [REDACTED:aws-key] bar", `redact AWS key`);
  check(redact("ghp_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA") === "[REDACTED:github-pat]", `redact github PAT`);
  check(redact("clean text") === "clean text", `non-secret text unchanged`);
}

// ---------- http_probe round-trip ----------
console.log("http_probe round-trip:");
{
  // Opt in to localhost for the loopback round-trip server; SSRF guard
  // denies 127.0.0.1 by default.
  process.env.ORCHESTRA_PROBE_ALLOW_LOCALHOST = "1";
  const server = createServer((req, res) => {
    if (req.url === "/echo") {
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end("hello world");
    } else if (req.url === "/secret") {
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end("token=ghp_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA done");
    } else if (req.url === "/slow") {
      // Hold for longer than test timeout
      setTimeout(() => { res.writeHead(200); res.end("late"); }, 2000);
    } else {
      res.writeHead(404); res.end();
    }
  });
  await new Promise(r => server.listen(0, "127.0.0.1", r));
  const port = server.address().port;
  try {
    const r1 = await httpProbeImpl({ method: "GET", url: `http://127.0.0.1:${port}/echo`, headers: { "User-Agent": "orchestra-probe-test" } });
    check(r1.status === 200, `GET /echo: status 200 (got ${r1.status})`);
    check(r1.body === "hello world", `GET /echo: body matches`);

    const r2 = await httpProbeImpl({ method: "GET", url: `http://127.0.0.1:${port}/secret` });
    check(r2.status === 200, `GET /secret: status 200`);
    check(/\[REDACTED:github-pat\]/.test(r2.body), `GET /secret: body redacted (got: ${r2.body})`);
    check(!/ghp_AAAA/.test(r2.body), `GET /secret: original token not in redacted body`);

    let timedOut = false;
    try {
      await httpProbeImpl({ method: "GET", url: `http://127.0.0.1:${port}/slow`, timeout_ms: 200 });
    } catch (e) {
      timedOut = true;
    }
    check(timedOut, `GET /slow: throws on timeout (200ms < 2000ms)`);

    const r3 = await httpProbeImpl({ method: "GET", url: `http://127.0.0.1:${port}/echo`, max_body_bytes: 5 });
    check(r3.body.length <= 5, `max_body_bytes truncates body (got length ${r3.body.length})`);
    check(r3.truncated === true, `truncated flag set`);
  } finally {
    await new Promise(r => server.close(r));
    delete process.env.ORCHESTRA_PROBE_ALLOW_LOCALHOST;
  }
}

// ---------- db_state SELECT-only + sqlite3 round-trip ----------
console.log("db_state sqlite3 + SELECT-only:");
{
  // Skip db tests if sqlite3 CLI missing.
  const sqliteCheck = spawnSync("sqlite3", ["--version"], { encoding: "utf8" });
  if (sqliteCheck.status !== 0) {
    console.log("  SKIP: sqlite3 CLI not on PATH");
  } else {
    const tmp = mkdtempSync(join(tmpdir(), "orchestra-probe-"));
    // /tmp lies outside cwd; opt in to abs DSN paths for the duration of
    // the test. Restored in finally.
    process.env.ORCHESTRA_PROBE_ALLOW_ABS_DSN = "1";
    try {
      const dbPath = join(tmp, "test.db");
      // Seed db
      const seedQ = `
        CREATE TABLE users (id INTEGER, name TEXT, secret TEXT);
        INSERT INTO users VALUES (1, 'alice', 'AKIAQWERTYUIOPASDFGH');
        INSERT INTO users VALUES (2, 'bob', 'safe');
        INSERT INTO users VALUES (3, 'charlie', 'safe');
      `;
      const seed = spawnSync("sqlite3", [dbPath, seedQ], { encoding: "utf8" });
      check(seed.status === 0, `seed db: exit 0 (stderr: ${seed.stderr})`);

      const dsn = `sqlite3://${dbPath}`;

      // Basic SELECT
      const r1 = dbStateImpl({ dsn, query: "SELECT id, name FROM users WHERE id = ?", params: [1] });
      check(Array.isArray(r1), `SELECT returns array`);
      check(r1.length === 1, `parameterized SELECT returns 1 row (got ${r1.length})`);
      check(r1[0]?.name === "alice", `SELECT WHERE id=1 returns alice`);

      // Redaction in result body
      const r2 = dbStateImpl({ dsn, query: "SELECT secret FROM users WHERE id = 1" });
      check(r2[0]?.secret === "[REDACTED:aws-key]", `db_state redacts AWS-key in result (got: ${JSON.stringify(r2[0])})`);

      // Row cap
      const r3 = dbStateImpl({ dsn, query: "SELECT * FROM users", row_cap: 2 });
      check(r3.length === 2, `row_cap=2 caps to 2 rows (got ${r3.length})`);

      // SELECT-only: INSERT rejected
      let insertBlocked = false;
      try { dbStateImpl({ dsn, query: "INSERT INTO users VALUES (4, 'eve', 'x')" }); }
      catch (e) {
        insertBlocked = /SELECT-only/.test(e.message);
      }
      check(insertBlocked, `INSERT rejected with SELECT-only message`);

      // SELECT-only: WITH (CTE) rejected per R4 v1.0.0 policy
      let withBlocked = false;
      try { dbStateImpl({ dsn, query: "WITH t AS (SELECT * FROM users) SELECT * FROM t" }); }
      catch (e) {
        withBlocked = /SELECT-only/.test(e.message);
      }
      check(withBlocked, `WITH (CTE) rejected per R4 v1.0.0 policy`);

      // SELECT-only: comment before SELECT still allowed
      const r4 = dbStateImpl({ dsn, query: "-- comment\n/* block */ SELECT id FROM users WHERE id = 1" });
      check(r4.length === 1, `comments before SELECT allowed`);

      // SELECT-only: multi-statement bypass rejected (first-token-only check would have passed this)
      let multiBlocked = false;
      try { dbStateImpl({ dsn, query: "SELECT 1; DROP TABLE users" }); }
      catch (e) {
        multiBlocked = /SELECT-only/.test(e.message);
      }
      check(multiBlocked, `multi-statement (SELECT;DROP) rejected with SELECT-only message`);

      // SELECT-only: trailing semicolon allowed (no statement after the `;`)
      const r5 = dbStateImpl({ dsn, query: "SELECT id FROM users WHERE id = 1;" });
      check(r5.length === 1, `trailing-semicolon SELECT allowed (got ${r5.length} rows)`);

      // SELECT-only: semicolon inside string literal allowed (not a statement separator)
      const r6 = dbStateImpl({ dsn, query: "SELECT 'a;b' AS payload FROM users WHERE id = 1" });
      check(r6[0]?.payload === "a;b", `semicolon inside string literal allowed (got ${JSON.stringify(r6[0])})`);

      // Postgres DSN: deferred-stub message
      let pgDeferred = false;
      try { dbStateImpl({ dsn: "postgres://x:y@h/db", query: "SELECT 1" }); }
      catch (e) {
        pgDeferred = /postgres DSN deferred/.test(e.message);
      }
      check(pgDeferred, `postgres DSN: deferred-stub message`);

      // MySQL DSN: deferred-stub message
      let myDeferred = false;
      try { dbStateImpl({ dsn: "mysql://x:y@h/db", query: "SELECT 1" }); }
      catch (e) {
        myDeferred = /mysql DSN deferred/.test(e.message);
      }
      check(myDeferred, `mysql DSN: deferred-stub message`);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
      delete process.env.ORCHESTRA_PROBE_ALLOW_ABS_DSN;
    }
  }
}

// ---------- SSRF guard ----------
console.log("SSRF guard:");
{
  check(isPrivateOrLoopbackIp("127.0.0.1") === true, `127.0.0.1 denied`);
  check(isPrivateOrLoopbackIp("169.254.169.254") === true, `AWS/GCP metadata 169.254.169.254 denied`);
  check(isPrivateOrLoopbackIp("10.0.0.1") === true, `10/8 RFC1918 denied`);
  check(isPrivateOrLoopbackIp("172.16.0.1") === true, `172.16/12 RFC1918 denied`);
  check(isPrivateOrLoopbackIp("172.31.255.255") === true, `172.31 RFC1918 denied`);
  check(isPrivateOrLoopbackIp("172.32.0.1") === false, `172.32 is public`);
  check(isPrivateOrLoopbackIp("192.168.1.1") === true, `192.168/16 RFC1918 denied`);
  check(isPrivateOrLoopbackIp("::1") === true, `IPv6 loopback denied`);
  check(isPrivateOrLoopbackIp("fe80::1") === true, `IPv6 link-local denied`);
  check(isPrivateOrLoopbackIp("8.8.8.8") === false, `8.8.8.8 is public`);

  let rejected = false;
  try { await resolveAndValidateHost("127.0.0.1"); }
  catch (e) { rejected = /denylisted/.test(e.message); }
  check(rejected, `http_probe rejects literal 127.0.0.1`);

  let metaRejected = false;
  try { await httpProbeImpl({ method: "GET", url: "http://169.254.169.254/latest/meta-data/" }); }
  catch (e) { metaRejected = /denylisted/.test(e.message); }
  check(metaRejected, `http_probe rejects AWS metadata endpoint`);
}

// ---------- Header allowlist ----------
console.log("Header allowlist:");
{
  const ok = filterHeaders({ Authorization: "Bearer x", Accept: "application/json" });
  check(ok.authorization === "Bearer x" && ok.accept === "application/json", `allowed headers pass through (lowercased)`);

  let hostBlocked = false;
  try { filterHeaders({ Host: "evil.example.com" }); }
  catch (e) { hostBlocked = /not in allowlist/.test(e.message); }
  check(hostBlocked, `Host header rejected`);

  let customBlocked = false;
  try { filterHeaders({ "X-Forwarded-For": "10.0.0.1" }); }
  catch (e) { customBlocked = /not in allowlist/.test(e.message); }
  check(customBlocked, `arbitrary X-* header rejected`);

  let overBlocked = false;
  try { filterHeaders({ Authorization: "x".repeat(10_000) }); }
  catch (e) { overBlocked = /header bytes exceed/.test(e.message); }
  check(overBlocked, `oversized header rejected`);
}

// ---------- DSN allowlist ----------
console.log("DSN allowlist:");
{
  let absBlocked = false;
  try { validateDsnPath("sqlite3:///etc/passwd"); }
  catch (e) { absBlocked = /outside the working tree/.test(e.message); }
  check(absBlocked, `sqlite3:///etc/passwd rejected outside cwd`);

  let homeBlocked = false;
  try { validateDsnPath("sqlite3:///Users/attacker/.zsh_history"); }
  catch (e) { homeBlocked = /outside the working tree/.test(e.message); }
  check(homeBlocked, `home-dir sqlite path rejected`);

  // Relative path resolves inside cwd — should pass.
  let relOk = true;
  try { validateDsnPath("sqlite3://./test.db"); }
  catch { relOk = false; }
  check(relOk, `relative sqlite path under cwd allowed`);
}

// ---------- isSelectOnly comment-in-literal regression ----------
console.log("isSelectOnly comment-in-literal regression:");
{
  check(isSelectOnly("SELECT 'a--b' FROM t") === true, `'a--b' literal not truncated`);
  check(isSelectOnly("SELECT '/*x*/' FROM t") === true, `'/*x*/' literal not stripped`);
  check(isSelectOnly("SELECT 'a;b' FROM t") === true, `';' inside literal not a separator`);
  check(isSelectOnly("SELECT 1; DROP TABLE t") === false, `multi-statement still rejected`);
  check(isSelectOnly("-- pre\nSELECT 1") === true, `leading -- comment still allowed`);
  check(isSelectOnly("/* block */ SELECT 1") === true, `leading /* */ comment still allowed`);
  check(isSelectOnly("INSERT INTO t VALUES (1)") === false, `INSERT still rejected`);
  check(isSelectOnly("DROP TABLE t") === false, `DROP still rejected`);
}

// ---------- MCP smoke: probe tools/list over JSON-RPC stdio ----------
console.log("MCP protocol smoke:");
{
  const probeServer = resolve(root, "mcp-servers/orchestra-probe.js");
  const r = spawnSync("node", [probeServer], {
    input: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }) + "\n",
    encoding: "utf8",
    timeout: 3000,
  });
  check(r.status === 0 || r.signal === "SIGTERM" || r.stdout.length > 0, `probe: server responds`);
  const lines = (r.stdout || "").split("\n").filter(Boolean);
  let parsed;
  try { parsed = JSON.parse(lines[0] || "{}"); }
  catch { parsed = {}; }
  check(Array.isArray(parsed?.result?.tools), `probe: tools/list returns array`);
}

// ---------- JSON-RPC notification handling (no reply for id-less calls) ----------
console.log("JSON-RPC notification handling:");
{
  const probeServer = resolve(root, "mcp-servers/orchestra-probe.js");

  // Notification (no id) — server must NOT reply at all.
  const note = spawnSync("node", [probeServer], {
    input: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) + "\n",
    encoding: "utf8",
    timeout: 2000,
  });
  const noteLines = (note.stdout || "").split("\n").filter(Boolean);
  check(noteLines.length === 0, `notifications/initialized produces no reply (got ${noteLines.length} lines)`);

  // Unknown method WITH id → -32601 reply.
  const unknown = spawnSync("node", [probeServer], {
    input: JSON.stringify({ jsonrpc: "2.0", id: 7, method: "tools/does-not-exist" }) + "\n",
    encoding: "utf8",
    timeout: 2000,
  });
  const unkLines = (unknown.stdout || "").split("\n").filter(Boolean);
  let unkParsed;
  try { unkParsed = JSON.parse(unkLines[0] || "{}"); }
  catch { unkParsed = {}; }
  check(unkParsed?.error?.code === -32601, `unknown method with id returns -32601`);

  // Unknown method WITHOUT id → no reply (notification semantics).
  const unkNote = spawnSync("node", [probeServer], {
    input: JSON.stringify({ jsonrpc: "2.0", method: "tools/does-not-exist" }) + "\n",
    encoding: "utf8",
    timeout: 2000,
  });
  const unkNoteLines = (unkNote.stdout || "").split("\n").filter(Boolean);
  check(unkNoteLines.length === 0, `unknown method without id produces no reply`);
}

if (failures > 0) {
  console.error(`test-probe.js: FAIL (${passes} passed, ${failures} failed)`);
  process.exit(1);
}
console.log(`test-probe.js: OK (${passes} assertions passed)`);
