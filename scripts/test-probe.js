#!/usr/bin/env node
// scripts/test-probe.js
// MCP probe contract tests: http_probe round-trip, db_state SELECT-only +
// secret redaction + timeout + row_cap. orchestra-fs treeImpl path-escape +
// stdlib walker.

import { createServer } from "node:http";
import { mkdtempSync, writeFileSync, readFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

import { httpProbeImpl, dbStateImpl, redact } from "../scripts/mcp-servers/orchestra-probe.js";
import { treeImpl } from "../scripts/mcp-servers/orchestra-fs.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
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
    const r1 = await httpProbeImpl({ method: "GET", url: `http://127.0.0.1:${port}/echo` });
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

      // Postgres DSN: deferred-stub message
      let pgDeferred = false;
      try { dbStateImpl({ dsn: "postgres://x:y@h/db", query: "SELECT 1" }); }
      catch (e) {
        pgDeferred = /deferred to v1.1/.test(e.message);
      }
      check(pgDeferred, `postgres DSN: deferred-to-v1.1 message`);

      // MySQL DSN: deferred-stub message
      let myDeferred = false;
      try { dbStateImpl({ dsn: "mysql://x:y@h/db", query: "SELECT 1" }); }
      catch (e) {
        myDeferred = /deferred to v1.1/.test(e.message);
      }
      check(myDeferred, `mysql DSN: deferred-to-v1.1 message`);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  }
}

// ---------- orchestra-fs treeImpl ----------
console.log("orchestra-fs treeImpl:");
{
  // Path escape rejection
  let escaped = false;
  try { treeImpl({ path: "../etc" }); }
  catch (e) { escaped = /escapes cwd/.test(e.message); }
  check(escaped, `'..' escape rejected`);

  // Walks repo root
  const out = treeImpl({ path: "scripts", depth: 1 });
  check(typeof out === "string" && out.length > 0, `tree('scripts', depth=1) returns text`);
  check(out.includes("validate.js"), `tree includes validate.js`);
}

// ---------- MCP smoke: tools/list over JSON-RPC stdio ----------
console.log("MCP protocol smoke:");
{
  const probeServer = resolve(root, "scripts/mcp-servers/orchestra-probe.js");
  const fsServer = resolve(root, "scripts/mcp-servers/orchestra-fs.js");
  for (const [name, server] of [["probe", probeServer], ["fs", fsServer]]) {
    const r = spawnSync("node", [server], {
      input: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }) + "\n",
      encoding: "utf8",
      timeout: 3000,
    });
    check(r.status === 0 || r.signal === "SIGTERM" || r.stdout.length > 0, `${name}: server responds`);
    const lines = (r.stdout || "").split("\n").filter(Boolean);
    let parsed;
    try { parsed = JSON.parse(lines[0] || "{}"); }
    catch { parsed = {}; }
    check(Array.isArray(parsed?.result?.tools), `${name}: tools/list returns array`);
  }
}

// ---------- env-var opt-out ----------
console.log("MCP env-var opt-out:");
{
  const r = spawnSync("node", [resolve(root, "scripts/mcp-servers/orchestra-fs.js")], {
    encoding: "utf8",
    env: { ...process.env, ORCHESTRA_MCP_ORCHESTRA_FS: "off" },
    timeout: 1000,
  });
  check(r.status === 0, `orchestra-fs opt-out: exits 0 (got ${r.status})`);
}

if (failures > 0) {
  console.error(`test-probe.js: FAIL (${passes} passed, ${failures} failed)`);
  process.exit(1);
}
console.log(`test-probe.js: OK (${passes} assertions passed)`);
