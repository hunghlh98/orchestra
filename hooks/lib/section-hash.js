// hooks/lib/section-hash.js
// Canonical SHA256 over normalized section content.
// Shared by hash-stamper.js and validate-drift.js — they MUST produce
// identical hashes for identical inputs. See PRD §8.13.

import { createHash } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";

const ANCHOR_RE = /^##\s+.*<a id="(S-[A-Z]+-\d{3})"><\/a>/;

// Walk a markdown body and return [{ id, content }, ...] for each anchored section.
// Section content = bytes from the anchor heading line (exclusive) to the next
// anchor heading line (exclusive) or EOF. Normalization: CRLF -> LF;
// trailing whitespace stripped per line; the anchor heading line itself excluded.
export function parseSections(body) {
  const lines = body.replace(/\r\n/g, "\n").split("\n");
  const sections = [];
  let current = null;
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(ANCHOR_RE);
    if (m) {
      if (current) sections.push(finalize(current));
      current = { id: m[1], lines: [] };
    } else if (current) {
      current.lines.push(lines[i]);
    }
  }
  if (current) sections.push(finalize(current));
  return sections;
}

function finalize(s) {
  return { id: s.id, content: normalize(s.lines) };
}

function normalize(lines) {
  return lines.map(l => l.replace(/\s+$/, "")).join("\n");
}

export function computeHash(content) {
  return "sha256:" + createHash("sha256").update(content, "utf8").digest("hex");
}

export function hashSections(body) {
  return parseSections(body).map(s => ({ id: s.id, hash: computeHash(s.content) }));
}

// Whole-file hash. Used for `.puml` source and `.svg` rendered diagram tracking
// in v2 lockfiles (DESIGN-005 §S-HASHSTAMPER-001). Returns `null` when the file
// does not exist; callers decide whether to record `"sha256:UNRENDERED"` etc.
// CRLF→LF normalization matches hashSections so a Windows-edited .puml hashes
// the same as a Unix-edited one.
export function hashFile(absPath) {
  if (!existsSync(absPath)) return null;
  const raw = readFileSync(absPath, "utf8");
  const normalized = raw.replace(/\r\n/g, "\n");
  return computeHash(normalized);
}
