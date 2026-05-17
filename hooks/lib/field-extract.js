// hooks/lib/field-extract.js
// Best-effort YAML field extraction without invoking a full YAML parser
// (keeps hook code stdlib-only + crash-resistant). For Write tool calls
// the proposed content lands in `content`; for Edit/MultiEdit in
// `new_string` (single) or `edits[].new_string` (multi).
//
// All extractors return a plain object; absent fields are undefined rather
// than null so the caller can use a simple "if (fields.x)" guard.

export function matchField(text, re) {
  const m = text.match(re);
  return m ? m[1] : undefined;
}

function joinCandidates(toolInput) {
  if (!toolInput) return "";
  const candidates = [];
  if (typeof toolInput.content === "string") candidates.push(toolInput.content);
  if (typeof toolInput.new_string === "string") candidates.push(toolInput.new_string);
  if (Array.isArray(toolInput.edits)) {
    for (const e of toolInput.edits) {
      if (typeof e?.new_string === "string") candidates.push(e.new_string);
    }
  }
  return candidates.join("\n");
}

export function extractBootstrapFields(toolInput) {
  const text = joinCandidates(toolInput);
  return {
    mode: matchField(text, /^mode:\s*([a-z]+)/m),
    primary_language: matchField(text, /^primary_language:\s*([a-z0-9_-]+)/m),
    framework: matchField(text, /^framework:\s*([a-z0-9_-]+)/m),
  };
}

// intent.yaml: routing decision fields. `pattern:` value can be quoted
// ("Pattern A") or bare (Pattern A); regex tolerates both.
export function extractIntentFields(toolInput) {
  const text = joinCandidates(toolInput);
  return {
    intent: matchField(text, /^intent:\s*"?([a-z-]+)"?/m),
    confidence: matchField(text, /^confidence:\s*"?([A-Z]+)"?/m),
    pattern: matchField(text, /^pattern:\s*"?([A-Za-z0-9 _-]+?)"?\s*$/m),
    autonomy_level: matchField(text, /^autonomy_level:\s*"?([A-Z_]+)"?/m),
  };
}

// SUMMARY-*.md: closure fields lifted onto artifact.written event.
export function extractSummaryFields(toolInput) {
  const text = joinCandidates(toolInput);
  return {
    team_name: matchField(text, /^team_name:\s*"?([A-Za-z0-9_-]+?)"?\s*$/m),
    terminal_state: matchField(text, /^terminal_state:\s*"?([a-z]+)"?/m),
    duration_seconds: matchField(text, /^duration_seconds:\s*(\d+)/m),
  };
}
