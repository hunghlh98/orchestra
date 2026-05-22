#!/usr/bin/env node
// scripts/tests/marketplace-parity.test.js
// Drift guard between .claude-plugin/plugin.json and .claude-plugin/marketplace.json.
//
// marketplace.json's plugins[0] mirrors metadata that plugin.json already
// carries (description, version, homepage, license, keywords). The mirror is
// load-bearing — marketplace UI renders the catalog row from marketplace.json,
// not from plugin.json — but nothing prevents either file from drifting.
// bump-version.js keeps `version` + `source.ref` in lockstep; this test
// covers the fields the bump script does not touch.

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const PLUGIN = resolve(root, ".claude-plugin/plugin.json");
const MARKET = resolve(root, ".claude-plugin/marketplace.json");

const PARITY_FIELDS = ["description", "homepage", "license"];

let passes = 0;
let failures = 0;

function check(cond, msg) {
  if (cond) { passes++; }
  else { failures++; console.error(`  FAIL: ${msg}`); }
}

const plugin = JSON.parse(readFileSync(PLUGIN, "utf8"));
const market = JSON.parse(readFileSync(MARKET, "utf8"));

check(Array.isArray(market.plugins) && market.plugins.length >= 1,
  `marketplace.json: plugins[] must contain at least one entry`);

const entry = market.plugins[0];
check(entry?.name === plugin.name,
  `name mismatch: plugin.json "${plugin.name}" vs marketplace.plugins[0] "${entry?.name}"`);

for (const field of PARITY_FIELDS) {
  check(entry?.[field] === plugin[field],
    `${field} mismatch: plugin.json "${plugin[field]}" vs marketplace.plugins[0] "${entry?.[field]}"`);
}

check(entry?.version === plugin.version,
  `version mismatch: plugin.json "${plugin.version}" vs marketplace.plugins[0] "${entry?.version}" (bump-version.js should keep these synced)`);

// keywords: order-independent set comparison
const pkSet = new Set(plugin.keywords || []);
const mkSet = new Set(entry?.keywords || []);
const missing = [...pkSet].filter(k => !mkSet.has(k));
const extra = [...mkSet].filter(k => !pkSet.has(k));
check(missing.length === 0 && extra.length === 0,
  `keywords drift: plugin-only=${JSON.stringify(missing)} marketplace-only=${JSON.stringify(extra)}`);

// repository: plugin.json carries object form, marketplace.json carries string form (per CC docs).
const pluginRepoUrl = typeof plugin.repository === "string"
  ? plugin.repository
  : plugin.repository?.url;
check(typeof entry?.repository === "string" && entry.repository === pluginRepoUrl,
  `repository mismatch: plugin.json url "${pluginRepoUrl}" vs marketplace.plugins[0].repository "${entry?.repository}"`);

// source.ref must match the current version (bump-version.js invariant; verified here too).
const ref = entry?.source?.ref;
check(ref === `v${plugin.version}`,
  `source.ref drift: plugins[0].source.ref "${ref}" != "v${plugin.version}"`);

if (failures > 0) {
  console.error(`marketplace-parity: ${failures} failure(s), ${passes} pass(es)`);
  process.exit(1);
}
console.log(`marketplace-parity: OK (${passes} checks)`);
