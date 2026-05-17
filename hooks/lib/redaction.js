// hooks/lib/redaction.js
// Manifest + redaction policy for metrics emission. Manifest carries the
// consumer's privacy posture; redaction enforces it on each event row.
//
// Two redaction axes are independent:
//   redact_prompts:true       — scrub raw user input (prompt_summary,
//                               description, args_summary) before writing
//   capture_insight_text:true — keep ★ Insight bodies in insights.jsonl
//                               (model-emitted prose, primary obs signal)
//
// The manifest is the harvest unit's privacy policy: plugin authors
// aggregating consumer data inspect this file to confirm what's redacted.

import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { safeWrite } from "./safe-fs.js";

export function readPluginVersion() {
  try {
    const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT || join(dirname(import.meta.url.replace("file://", "")), "..", "..");
    const pkgPath = join(pluginRoot, "package.json");
    if (existsSync(pkgPath)) {
      const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
      return pkg.version || "unknown";
    }
  } catch {}
  return "unknown";
}

export function ensureManifest(metricsDir) {
  const manifestPath = join(metricsDir, "manifest.json");
  const defaults = {
    schema_version: 1,
    plugin_version: readPluginVersion(),
    redact_prompts: true,
    capture_insight_text: true,
    telemetry_optin: "explicit",
    created_at: new Date().toISOString(),
  };
  if (!existsSync(manifestPath)) {
    try { safeWrite(manifestPath, JSON.stringify(defaults, null, 2) + "\n"); }
    catch {}
    return defaults;
  }
  try {
    const raw = JSON.parse(readFileSync(manifestPath, "utf8"));
    return { ...defaults, ...raw };
  } catch {
    return defaults;
  }
}

// Replaces user-content fields with "<redacted, len=N>" placeholders.
// Three known fields carry user prompts at this point:
//   prompt_summary  (task.subagent.invoked)
//   description     (team.created)
//   args_summary    (skill.invoked)
// Other event fields (file_name, agent_name, intent, etc.) are derived
// classifications, not raw user text — left intact.
export function applyRedaction(event) {
  for (const key of ["prompt_summary", "description", "args_summary"]) {
    if (typeof event[key] === "string" && event[key].length > 0) {
      event[key] = `<redacted, len=${event[key].length}>`;
    }
  }
}
