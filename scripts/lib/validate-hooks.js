// scripts/lib/validate-hooks.js
// Hook ↔ install-modules manifest parity. Every hooks/scripts/*.js must have
// a kind:'hook' entry in manifests/install-modules.json. The failure mode:
// a hook ships and runs via hooks/hooks.json, but the registry doesn't list
// it — toggle invisible, silent enforcement.

import { existsSync, readdirSync } from "node:fs";
import { basename, resolve } from "node:path";

export function findHookManifestParity(hookScriptBasenames, installModulesEntries) {
  const errs = [];
  const registered = new Set(
    (installModulesEntries || [])
      .filter(m => m && m.kind === "hook" && typeof m.path === "string")
      .map(m => basename(m.path))
  );
  const scripts = new Set(hookScriptBasenames || []);
  for (const script of scripts) {
    if (!registered.has(script)) {
      errs.push(`hooks/scripts/${script}: not registered in manifests/install-modules.json (kind: 'hook')`);
    }
  }
  for (const reg of registered) {
    if (!scripts.has(reg)) {
      errs.push(`manifests/install-modules.json: registered hook '${reg}' has no corresponding hooks/scripts/${reg}`);
    }
  }
  return errs;
}

export function runHookManifestCheck(root, installModules, errs) {
  const hooksDir = resolve(root, "hooks/scripts");
  if (!existsSync(hooksDir) || !installModules || !Array.isArray(installModules.modules)) return;
  const scripts = readdirSync(hooksDir).filter(f => f.endsWith(".js"));
  for (const e of findHookManifestParity(scripts, installModules.modules)) errs.push(e);
}
