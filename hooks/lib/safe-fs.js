// Defensive fs primitives. lstat + O_NOFOLLOW reject symlinks so an
// attacker-planted link at a hook target path can't redirect writes.

import {
  lstatSync, statSync, openSync, closeSync, writeSync, readSync,
  renameSync, unlinkSync, constants,
} from "node:fs";
import { dirname, basename, join } from "node:path";
import { randomBytes } from "node:crypto";

const { O_APPEND, O_CREAT, O_WRONLY, O_RDONLY, O_EXCL } = constants;
// O_NOFOLLOW is POSIX-only; Windows lacks it. Fall back to 0 there.
const O_NOFOLLOW = constants.O_NOFOLLOW || 0;

function posixOwnership() {
  return typeof process.geteuid === "function";
}

function rejectSymlink(path) {
  let lst;
  try { lst = lstatSync(path); }
  catch (e) {
    if (e.code === "ENOENT") return null;
    throw e;
  }
  if (lst.isSymbolicLink()) {
    const err = new Error(`safe-fs: refusing to operate on symlink ${path}`);
    err.code = "ESYMLINK";
    throw err;
  }
  return lst;
}

function assertParentOwnedByEuid(path) {
  if (!posixOwnership()) return;
  const parent = dirname(path);
  let st;
  try { st = statSync(parent); }
  catch (e) {
    const err = new Error(`safe-fs: parent ${parent} unreadable: ${e.message}`);
    err.code = "EPARENT";
    throw err;
  }
  const euid = process.geteuid();
  if (st.uid !== euid) {
    const err = new Error(`safe-fs: parent ${parent} owned by uid ${st.uid}, expected euid ${euid}`);
    err.code = "EOWNER";
    throw err;
  }
}

export function safeAppend(path, line) {
  assertParentOwnedByEuid(path);
  rejectSymlink(path);
  const fd = openSync(path, O_APPEND | O_CREAT | O_WRONLY | O_NOFOLLOW, 0o600);
  try {
    const text = line.endsWith("\n") ? line : line + "\n";
    const buf = Buffer.from(text, "utf8");
    let off = 0;
    while (off < buf.length) {
      const n = writeSync(fd, buf, off, buf.length - off);
      if (n <= 0) break;
      off += n;
    }
  } finally {
    closeSync(fd);
  }
}

export function safeRead(path, maxBytes) {
  let lst;
  try { lst = rejectSymlink(path); }
  catch (e) {
    if (e.code === "ESYMLINK") return null;
    throw e;
  }
  if (!lst) return null;
  if (!lst.isFile()) return null;
  if (typeof maxBytes === "number" && lst.size > maxBytes) return null;
  const fd = openSync(path, O_RDONLY | O_NOFOLLOW);
  try {
    const buf = Buffer.alloc(lst.size);
    let off = 0;
    while (off < lst.size) {
      const n = readSync(fd, buf, off, lst.size - off, off);
      if (n <= 0) break;
      off += n;
    }
    return buf;
  } finally {
    closeSync(fd);
  }
}

export function safeWrite(path, content, mode = 0o600) {
  assertParentOwnedByEuid(path);
  rejectSymlink(path);
  const parent = dirname(path);
  const tempName = `.${basename(path)}.tmp.${process.pid}.${randomBytes(6).toString("hex")}`;
  const tempPath = join(parent, tempName);
  const fd = openSync(tempPath, O_WRONLY | O_CREAT | O_EXCL | O_NOFOLLOW, mode);
  try {
    const buf = Buffer.isBuffer(content) ? content : Buffer.from(content, "utf8");
    let off = 0;
    while (off < buf.length) {
      const n = writeSync(fd, buf, off, buf.length - off);
      if (n <= 0) break;
      off += n;
    }
  } catch (e) {
    closeSync(fd);
    try { unlinkSync(tempPath); } catch {}
    throw e;
  }
  closeSync(fd);
  try {
    renameSync(tempPath, path);
  } catch (e) {
    try { unlinkSync(tempPath); } catch {}
    throw e;
  }
}
