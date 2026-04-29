// hooks/lib/yaml-mini.js
// Frozen-grammar YAML parser/serializer for orchestra artifact frontmatter.
// See PRD §8.13 ("Frozen frontmatter grammar") for the full spec.
// Stdlib-only; no external deps.

const KEY_RE = /^([a-zA-Z][a-zA-Z0-9_-]*):(?:\s+(.*))?$/;

export function parse(text) {
  const lines = text.replace(/\r\n/g, "\n").split("\n").map(stripComment);
  const ctx = { lines, pos: 0 };
  skipBlanks(ctx);
  if (ctx.pos >= ctx.lines.length) return {};
  return parseValue(ctx, 0);
}

function stripComment(line) {
  let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"' && line[i - 1] !== "\\") inQuote = !inQuote;
    if (!inQuote && ch === "#" && (i === 0 || /\s/.test(line[i - 1]))) {
      return line.slice(0, i).replace(/\s+$/, "");
    }
  }
  return line.replace(/\s+$/, "");
}

function skipBlanks(ctx) {
  while (ctx.pos < ctx.lines.length && ctx.lines[ctx.pos] === "") ctx.pos++;
}

function countIndent(line) {
  let i = 0;
  while (i < line.length && line[i] === " ") i++;
  return i;
}

function parseValue(ctx, indent) {
  skipBlanks(ctx);
  if (ctx.pos >= ctx.lines.length) return null;
  const line = ctx.lines[ctx.pos];
  const lineIndent = countIndent(line);
  if (lineIndent !== indent) return null;
  const stripped = line.slice(indent);
  if (stripped.startsWith("- ") || stripped === "-") return parseList(ctx, indent);
  return parseMap(ctx, indent);
}

function parseMap(ctx, indent) {
  const result = {};
  while (ctx.pos < ctx.lines.length) {
    skipBlanks(ctx);
    if (ctx.pos >= ctx.lines.length) break;
    const line = ctx.lines[ctx.pos];
    const lineIndent = countIndent(line);
    if (lineIndent < indent) break;
    if (lineIndent > indent) throw new Error(`yaml-mini: unexpected indent at line ${ctx.pos + 1}`);
    const stripped = line.slice(indent);
    if (stripped.startsWith("- ") || stripped === "-") break;
    const m = stripped.match(KEY_RE);
    if (!m) throw new Error(`yaml-mini: invalid map entry at line ${ctx.pos + 1}: '${stripped}'`);
    const key = m[1];
    const inlineValue = m[2];
    ctx.pos++;
    if (inlineValue === undefined || inlineValue === "") {
      // Look ahead for nested block (deeper indent) or treat as null
      skipBlanks(ctx);
      if (ctx.pos < ctx.lines.length) {
        const nextIndent = countIndent(ctx.lines[ctx.pos]);
        if (nextIndent > indent) {
          result[key] = parseValue(ctx, nextIndent);
          continue;
        }
      }
      result[key] = null;
    } else {
      result[key] = parseScalar(inlineValue);
    }
  }
  return result;
}

function parseList(ctx, indent) {
  const result = [];
  while (ctx.pos < ctx.lines.length) {
    skipBlanks(ctx);
    if (ctx.pos >= ctx.lines.length) break;
    const line = ctx.lines[ctx.pos];
    const lineIndent = countIndent(line);
    if (lineIndent !== indent) break;
    const stripped = line.slice(indent);
    if (!(stripped.startsWith("- ") || stripped === "-")) break;
    const itemContent = stripped === "-" ? "" : stripped.slice(2);
    const m = itemContent.match(KEY_RE);
    if (m) {
      // List item is the start of a map
      const item = {};
      const firstKey = m[1];
      const firstVal = m[2];
      ctx.pos++;
      if (firstVal === undefined || firstVal === "") {
        skipBlanks(ctx);
        if (ctx.pos < ctx.lines.length) {
          const ni = countIndent(ctx.lines[ctx.pos]);
          if (ni > indent + 2) {
            item[firstKey] = parseValue(ctx, ni);
          } else {
            item[firstKey] = null;
          }
        } else {
          item[firstKey] = null;
        }
      } else {
        item[firstKey] = parseScalar(firstVal);
      }
      // Continue reading sibling keys at indent + 2
      while (ctx.pos < ctx.lines.length) {
        skipBlanks(ctx);
        if (ctx.pos >= ctx.lines.length) break;
        const nl = ctx.lines[ctx.pos];
        const ni = countIndent(nl);
        if (ni !== indent + 2) break;
        const ns = nl.slice(indent + 2);
        if (ns.startsWith("- ") || ns === "-") break;
        const nm = ns.match(KEY_RE);
        if (!nm) throw new Error(`yaml-mini: invalid map entry in list at line ${ctx.pos + 1}: '${ns}'`);
        const k = nm[1];
        const v = nm[2];
        ctx.pos++;
        if (v === undefined || v === "") {
          skipBlanks(ctx);
          if (ctx.pos < ctx.lines.length) {
            const nni = countIndent(ctx.lines[ctx.pos]);
            if (nni > indent + 2) {
              item[k] = parseValue(ctx, nni);
              continue;
            }
          }
          item[k] = null;
        } else {
          item[k] = parseScalar(v);
        }
      }
      result.push(item);
    } else {
      // Scalar list item
      result.push(parseScalar(itemContent));
      ctx.pos++;
    }
  }
  return result;
}

function parseScalar(s) {
  s = s.trim();
  if (s === "" || s === "null" || s === "~") return null;
  if (s === "true") return true;
  if (s === "false") return false;
  if (/^-?\d+$/.test(s)) return parseInt(s, 10);
  if (s.startsWith('"') && s.endsWith('"') && s.length >= 2) {
    try { return JSON.parse(s); } catch { /* fall through */ }
  }
  return s;
}

// === Serialize ===

export function serialize(obj) {
  const lines = [];
  if (Array.isArray(obj)) {
    serializeList(obj, 0, lines);
  } else if (obj && typeof obj === "object") {
    serializeMap(obj, 0, lines);
  }
  return lines.join("\n");
}

function serializeMap(obj, indent, lines) {
  const pad = " ".repeat(indent);
  for (const [k, v] of Object.entries(obj)) {
    if (v === null || v === undefined) {
      lines.push(`${pad}${k}: null`);
    } else if (Array.isArray(v)) {
      if (v.length === 0) continue; // omit empty arrays (flow style forbidden)
      lines.push(`${pad}${k}:`);
      serializeList(v, indent + 2, lines);
    } else if (typeof v === "object") {
      const entries = Object.entries(v);
      if (entries.length === 0) continue;
      lines.push(`${pad}${k}:`);
      serializeMap(v, indent + 2, lines);
    } else {
      lines.push(`${pad}${k}: ${serializeScalar(v)}`);
    }
  }
}

function serializeList(list, indent, lines) {
  const pad = " ".repeat(indent);
  const subPad = " ".repeat(indent + 2);
  for (const item of list) {
    if (item !== null && typeof item === "object" && !Array.isArray(item)) {
      const entries = Object.entries(item);
      if (entries.length === 0) {
        lines.push(`${pad}- null`);
        continue;
      }
      const [firstK, firstV] = entries[0];
      if (firstV === null || firstV === undefined) {
        lines.push(`${pad}- ${firstK}: null`);
      } else if (Array.isArray(firstV)) {
        if (firstV.length === 0) {
          lines.push(`${pad}- ${firstK}: null`);
        } else {
          lines.push(`${pad}- ${firstK}:`);
          serializeList(firstV, indent + 4, lines);
        }
      } else if (typeof firstV === "object") {
        lines.push(`${pad}- ${firstK}:`);
        serializeMap(firstV, indent + 4, lines);
      } else {
        lines.push(`${pad}- ${firstK}: ${serializeScalar(firstV)}`);
      }
      for (let i = 1; i < entries.length; i++) {
        const [k, v] = entries[i];
        if (v === null || v === undefined) {
          lines.push(`${subPad}${k}: null`);
        } else if (Array.isArray(v)) {
          if (v.length === 0) {
            lines.push(`${subPad}${k}: null`);
          } else {
            lines.push(`${subPad}${k}:`);
            serializeList(v, indent + 4, lines);
          }
        } else if (typeof v === "object") {
          lines.push(`${subPad}${k}:`);
          serializeMap(v, indent + 4, lines);
        } else {
          lines.push(`${subPad}${k}: ${serializeScalar(v)}`);
        }
      }
    } else {
      lines.push(`${pad}- ${serializeScalar(item)}`);
    }
  }
}

function serializeScalar(v) {
  if (v === null || v === undefined) return "null";
  if (typeof v === "boolean") return v ? "true" : "false";
  if (typeof v === "number") return String(v);
  if (typeof v === "string") {
    if (needsQuoting(v)) return JSON.stringify(v);
    return v;
  }
  return JSON.stringify(v);
}

function needsQuoting(s) {
  if (s === "") return true;
  if (/^(null|true|false|~)$/.test(s)) return true;
  if (/^-?\d+$/.test(s)) return true;
  if (/^[#&*!|>'"%@`]/.test(s)) return true;
  if (/[:#"\\]/.test(s)) return true;
  if (/^\s|\s$/.test(s)) return true;
  return false;
}
