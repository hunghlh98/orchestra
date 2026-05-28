#!/usr/bin/env node
// scripts/canonical-sync.js
// Dual-mode dev script for orchestra's canonical-registry + auto-render
// drift gate.
//
// Modes:
//   --render [--id <gen-id>] [--dry-run]
//     Walks manifests/render.json. For each generator, rebuilds content
//     between <!-- ORCHESTRA:GEN:<id>:START --> ... :END --> markers in
//     the declared target file. Also rewrites
//     <!-- ORCHESTRA:COUNT:<id> -->N<!-- ORCHESTRA:COUNT:<id>:END -->
//     placeholders with the row count.
//
//   --check [--strict]
//     (1) Validates manifests/canonical.json shape. (2) Confirms each
//     canonical file + anchor exists on disk. (3) Scans consumer surface
//     (agents/, skills/, commands/, schemas/, hooks/, README.md) for
//     restate-without-pointer. Default exit 0 (informational); --strict
//     exit 1 on any drift.
//
// Exit codes:
//   0  success / informational
//   1  --strict found drift OR unknown --id passed to --render
//   2  marker missing OR unknown shape
//   3  parse / write failed OR registry validation failed

import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { resolve, dirname, join, relative, basename } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const REGISTRY_PATH = resolve(ROOT, "manifests/canonical.json");
const RENDER_PATH = resolve(ROOT, "manifests/render.json");

function die(msg, code = 1) {
  process.stderr.write(`canonical-sync: ${msg}\n`);
  process.exit(code);
}
function info(msg) { console.log(`canonical-sync: ${msg}`); }
function escapeRegex(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

function parseArgs(argv) {
  const flags = { render: false, check: false, strict: false, dryRun: false, id: null };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--render") flags.render = true;
    else if (a === "--check") flags.check = true;
    else if (a === "--strict") flags.strict = true;
    else if (a === "--dry-run") flags.dryRun = true;
    else if (a === "--id") flags.id = argv[++i];
    else die(`unknown arg: ${a}`, 2);
  }
  if (!flags.render && !flags.check) die("must pass --render or --check", 2);
  if (flags.render && flags.check) die("--render and --check are mutually exclusive", 2);
  return flags;
}

// Minimal flat YAML frontmatter parser — handles `key: value` and
// `key: "value"` / `key: 'value'`. No nested structures, no lists.
function parseFrontmatter(content) {
  if (!content.startsWith("---")) return {};
  const end = content.indexOf("\n---", 3);
  if (end < 0) return {};
  const block = content.slice(3, end).trim();
  const out = {};
  for (const line of block.split("\n")) {
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_-]*):\s*(.*)$/);
    if (!m) continue;
    let val = m[2].trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    out[m[1]] = val;
  }
  return out;
}

function escapeCell(s) {
  return String(s ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ").trim();
}

// Glob over filesystem. Supports literal segments, `*` (whole-segment),
// and `*.foo` / `foo*.bar` prefix-suffix on the leaf. No recursive `**`.
function globSources(pattern) {
  const parts = pattern.split("/");
  let currents = [ROOT];
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    const isLeaf = i === parts.length - 1;
    const next = [];
    for (const cur of currents) {
      let entries;
      try { entries = readdirSync(cur); } catch { continue; }
      if (part === "*") {
        for (const e of entries.sort()) next.push(join(cur, e));
      } else if (part.includes("*")) {
        const reSrc = "^" + part.split("*").map(s => escapeRegex(s)).join(".*") + "$";
        const re = new RegExp(reSrc);
        for (const e of entries.sort()) if (re.test(e)) next.push(join(cur, e));
      } else {
        next.push(join(cur, part));
      }
    }
    currents = next.filter(p => {
      if (!existsSync(p)) return false;
      const st = statSync(p);
      return isLeaf ? st.isFile() : st.isDirectory();
    });
  }
  return currents;
}

function loadJson(path) {
  try { return JSON.parse(readFileSync(path, "utf8")); }
  catch (e) { die(`parse failed (${relative(ROOT, path)}): ${e.message}`, 3); }
}

// ===================================================================
// RENDER MODE
// ===================================================================

function renderFrontmatterTable(gen) {
  const sources = globSources(gen.source_glob);
  const rows = [];
  for (const src of sources) {
    const fm = parseFrontmatter(readFileSync(src, "utf8"));
    let name = fm[gen.fields[0]] || basename(src);
    if (gen.name_prefix && !name.startsWith(gen.name_prefix)) name = gen.name_prefix + name;
    const desc = fm[gen.fields[1]] || "";
    rows.push("| `" + escapeCell(name) + "` | " + escapeCell(desc) + " |");
  }
  return buildTable(gen.header, rows);
}

function renderSchemasTable(gen) {
  const sources = globSources(gen.source_glob);
  const extras = (gen.extra_files || []).map(f => resolve(ROOT, f)).filter(existsSync);
  const all = [...sources, ...extras].sort((a, b) => basename(a).localeCompare(basename(b)));
  const rows = [];
  for (const src of all) {
    const name = basename(src);
    let desc = "";
    if (src.endsWith(".json")) {
      try {
        const parsed = JSON.parse(readFileSync(src, "utf8"));
        desc = parsed.description || "";
      } catch { desc = ""; }
    } else {
      const fm = parseFrontmatter(readFileSync(src, "utf8"));
      desc = fm.description || fm.scope || "";
    }
    rows.push("| `" + escapeCell(name) + "` | " + escapeCell(desc) + " |");
  }
  return buildTable(gen.header, rows);
}

function renderEnvTable(gen) {
  const src = resolve(ROOT, gen.source);
  const parsed = loadJson(src);
  let entries;
  if (Array.isArray(parsed.toggles)) {
    entries = parsed.toggles.map(t => [t.envVar, t.description || t.effect || ""]);
  } else {
    const toggles = parsed.toggles || parsed;
    entries = Object.entries(toggles)
      .filter(([k]) => k.startsWith("ORCHESTRA_"))
      .map(([k, v]) => [k, (v && typeof v === "object") ? (v.effect || v.description || "") : String(v)]);
  }
  entries.sort(([a], [b]) => a.localeCompare(b));
  const rows = entries.map(([k, eff]) => "| `" + escapeCell(k) + "` | " + escapeCell(eff) + " |");
  return buildTable(gen.header, rows);
}

function buildTable(header, rows) {
  const head = "| " + header.join(" | ") + " |";
  const sep = "| " + header.map(() => "---").join(" | ") + " |";
  return [head, sep, ...rows].join("\n");
}

function countRows(rendered) {
  return rendered.split("\n").length - 2;
}

function modeRender(flags) {
  const renderManifest = loadJson(RENDER_PATH);
  const generators = flags.id
    ? renderManifest.generators.filter(g => g.id === flags.id)
    : renderManifest.generators;
  if (flags.id && generators.length === 0) die(`unknown generator id: ${flags.id}`, 1);
  const targets = new Map();
  for (const gen of generators) {
    let rendered;
    if (gen.shape === "frontmatter-table") rendered = renderFrontmatterTable(gen);
    else if (gen.shape === "schemas-table") rendered = renderSchemasTable(gen);
    else if (gen.shape === "env-table") rendered = renderEnvTable(gen);
    else die(`unknown generator shape: ${gen.shape}`, 2);
    const count = countRows(rendered);
    const targetPath = resolve(ROOT, gen.target);
    let content = targets.get(targetPath) ?? readFileSync(targetPath, "utf8");
    const startMarker = `<!-- ORCHESTRA:GEN:${gen.id}:START -->`;
    const endMarker = `<!-- ORCHESTRA:GEN:${gen.id}:END -->`;
    const sIdx = content.indexOf(startMarker);
    const eIdx = content.indexOf(endMarker);
    if (sIdx < 0 || eIdx < 0) {
      die(`marker missing in ${relative(ROOT, targetPath)}: ${gen.id}`, 2);
    }
    const sLineEnd = content.indexOf("\n", sIdx) + 1;
    const before = content.slice(0, sLineEnd);
    const after = content.slice(eIdx);
    content = before + "\n" + rendered + "\n\n" + after;
    const countRe = new RegExp(`<!-- ORCHESTRA:COUNT:${gen.id} -->[^<]*<!-- ORCHESTRA:COUNT:${gen.id}:END -->`, "g");
    content = content.replace(countRe, `<!-- ORCHESTRA:COUNT:${gen.id} -->${count}<!-- ORCHESTRA:COUNT:${gen.id}:END -->`);
    targets.set(targetPath, content);
    info(`rendered ${gen.id} (${count} rows) in ${relative(ROOT, targetPath)}`);
  }
  for (const [path, content] of targets) {
    const original = readFileSync(path, "utf8");
    if (content === original) {
      info(`no change: ${relative(ROOT, path)}`);
      continue;
    }
    if (flags.dryRun) {
      info(`(dry-run) would write ${relative(ROOT, path)}`);
    } else {
      writeFileSync(path, content);
      info(`wrote ${relative(ROOT, path)}`);
    }
  }
}

// ===================================================================
// CHECK MODE
// ===================================================================

function walkDir(dir, cb) {
  let entries;
  try { entries = readdirSync(dir); } catch { return; }
  for (const e of entries) {
    if (e === "node_modules" || e.startsWith(".")) continue;
    const full = join(dir, e);
    let st;
    try { st = statSync(full); } catch { continue; }
    if (st.isDirectory()) walkDir(full, cb);
    else if (st.isFile()) cb(full);
  }
}

function modeCheck(flags) {
  const registry = loadJson(REGISTRY_PATH);
  if (!registry.canonicals || !Array.isArray(registry.canonicals)) {
    die("canonical.json: missing canonicals array", 3);
  }
  const idSeen = new Set();
  for (const c of registry.canonicals) {
    if (!c.id || !c.file || !c.anchor || !c.purpose) {
      die(`canonical.json: incomplete entry: ${JSON.stringify(c)}`, 3);
    }
    if (idSeen.has(c.id)) die(`canonical.json: duplicate id "${c.id}"`, 3);
    idSeen.add(c.id);
  }
  info(`registry: ${registry.canonicals.length} canonicals`);
  // Anchor presence.
  const anchorMissing = [];
  for (const c of registry.canonicals) {
    const filePath = resolve(ROOT, c.file);
    if (!existsSync(filePath)) {
      anchorMissing.push(`${c.id}: file ${c.file} not found`);
      continue;
    }
    const content = readFileSync(filePath, "utf8");
    const anchorRe = new RegExp(`<a\\s+id=["']${escapeRegex(c.anchor)}["']\\s*></a>`);
    if (!anchorRe.test(content)) {
      anchorMissing.push(`${c.id}: anchor "${c.anchor}" not in ${c.file}`);
    }
  }
  if (anchorMissing.length) {
    for (const m of anchorMissing) process.stderr.write(`  anchor-missing: ${m}\n`);
  }
  // Consumer-surface scan.
  const consumerRoots = ["agents", "skills", "commands", "schemas", "hooks"];
  const consumerFiles = [];
  for (const root of consumerRoots) {
    walkDir(resolve(ROOT, root), p => {
      if (p.endsWith(".md") || p.endsWith(".json") || p.endsWith(".js")) consumerFiles.push(p);
    });
  }
  const readmePath = resolve(ROOT, "README.md");
  if (existsSync(readmePath)) consumerFiles.push(readmePath);

  const driftFlags = [];
  for (const c of registry.canonicals) {
    const canonicalPath = resolve(ROOT, c.file);
    const linkRe = new RegExp(`\\([^)]*${escapeRegex(basename(c.file))}\\s*#\\s*${escapeRegex(c.anchor)}\\s*\\)`);
    const tokens = [c.id];
    if (c.anchor !== c.id && /-/.test(c.anchor)) tokens.push(c.anchor);
    for (const file of consumerFiles) {
      if (file === canonicalPath) continue;
      const content = readFileSync(file, "utf8");
      let body = content;
      if (content.startsWith("---")) {
        const fmEnd = content.indexOf("\n---", 3);
        if (fmEnd >= 0) body = content.slice(fmEnd + 4);
      }
      let mentioned = false;
      for (const tok of tokens) {
        const tre = new RegExp("(?<![A-Za-z0-9-])" + escapeRegex(tok) + "(?![A-Za-z0-9-])");
        if (tre.test(body)) { mentioned = true; break; }
      }
      if (mentioned && !linkRe.test(body)) {
        driftFlags.push({ canonical: c.id, file: relative(ROOT, file) });
      }
    }
  }

  const hardFail = anchorMissing.length > 0;
  if (driftFlags.length === 0 && !hardFail) {
    info(`check clean: no restate-without-pointer detected`);
    return;
  }
  if (driftFlags.length > 0) {
    info(`drift detected: ${driftFlags.length} flag(s)`);
    const byCanonical = new Map();
    for (const f of driftFlags) {
      if (!byCanonical.has(f.canonical)) byCanonical.set(f.canonical, []);
      byCanonical.get(f.canonical).push(f.file);
    }
    for (const [c, files] of byCanonical) {
      process.stderr.write(`  [${c}] restated without pointer in:\n`);
      for (const f of files) process.stderr.write(`    - ${f}\n`);
    }
  }
  if (flags.strict && (hardFail || driftFlags.length > 0)) process.exit(1);
}

// ===================================================================
// MAIN
// ===================================================================

const flags = parseArgs(process.argv);
if (flags.render) modeRender(flags);
else if (flags.check) modeCheck(flags);
