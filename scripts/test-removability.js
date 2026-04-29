#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const errors = [];

const im = JSON.parse(readFileSync(resolve(root, "manifests/install-modules.json"), "utf8"));
const rt = JSON.parse(readFileSync(resolve(root, "manifests/runtime-toggles.json"), "utf8"));

const toggleableKinds = new Set(["hook", "skill", "mcp"]);
const togglesByModule = new Map(rt.toggles.map(t => [t.module, t]));
const moduleNames = new Set(im.modules.map(m => m.name));

for (const m of im.modules) {
  if (!toggleableKinds.has(m.kind)) continue;
  if (!togglesByModule.has(m.name)) {
    errors.push(`install-modules entry '${m.name}' (kind=${m.kind}) has no toggle in runtime-toggles.json`);
  }
}

for (const t of rt.toggles) {
  if (!moduleNames.has(t.module)) {
    errors.push(`runtime-toggles entry '${t.module}' has no matching install-modules entry`);
  }
}

if (errors.length) {
  console.error("test-removability.js: FAIL");
  for (const e of errors) console.error("  - " + e);
  process.exit(1);
}
console.log(`test-removability.js: OK (${im.modules.length} modules, ${rt.toggles.length} toggles)`);
