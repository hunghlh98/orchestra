#!/usr/bin/env node
// Deterministic Java code-graph extractor (sole structural path; no hand-rolled fallback).
// Parses Java sources via vendored web-tree-sitter + tree-sitter-java grammar, emits a
// node/edge graph with stable IDs. Semantics (summaries, feature boundaries) are the LLM's
// job downstream — this script never infers intent, only structure.
//
// Usage: node extract-java-graph.mjs <input.json> <output.json>
//   input.json:  { "projectRoot": "<abs>", "files": [{ "path": "<rel-or-abs .java>" }] }
//   output.json: { "version", "nodes": [...], "edges": [...], "unresolved": [...] }
//
// Exit non-zero on hard failure (grammar load, no input). Per-file parse errors are
// recorded, not fatal — a malformed file must not sink the batch.

import { createRequire } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';

const require = createRequire(import.meta.url);

const HTTP_MAPPING = {
  GetMapping: 'GET', PostMapping: 'POST', PutMapping: 'PUT',
  DeleteMapping: 'DELETE', PatchMapping: 'PATCH',
};
const STEREOTYPE = {
  RestController: 'rest-controller', Controller: 'rest-controller',
  Service: 'service', Repository: 'repository', Entity: 'entity',
  Configuration: 'config', Component: 'component',
};

function fail(msg) { process.stderr.write(`extract-java-graph: ${msg}\n`); process.exit(1); }

// ── tree-sitter bootstrap (native node-gyp bindings) ─────────────────────
// Provisioned on-demand by the java-development skill preflight
// (npm install in the skill dir). Resolved via upward node_modules walk.
function loadParser() {
  let Parser, Java;
  try {
    Parser = require('tree-sitter');
    Java = require('tree-sitter-java');
  } catch (e) {
    fail(`tree-sitter native bindings unavailable (${e.code || e.message}). `
      + `Run the java-development skill preflight: `
      + `npm install --prefix <plugin>/skills/java-development. `
      + `Requires Node ≥ 18, npm, and a C toolchain (node-gyp / python3 / compiler).`);
  }
  const parser = new Parser();
  parser.setLanguage(Java);
  return parser;
}

// ── small AST helpers ────────────────────────────────────────────────────
const field = (n, f) => (n ? n.childForFieldName(f) : null);
const txt = (n) => (n ? n.text : '');
const named = (n) => (n ? n.namedChildren : []);

function unquote(s) {
  if (!s) return s;
  return s.replace(/^["']/, '').replace(/["']$/, '');
}

// modifiers node sits as the first child of a declaration; collect annotation names + keywords
function readModifiers(decl) {
  const out = { annotations: [], anns: [], keywords: [] };
  for (const c of named(decl)) {
    if (c.type !== 'modifiers') continue;
    for (const m of named(c)) {
      if (m.type === 'marker_annotation' || m.type === 'annotation') {
        const nameNode = field(m, 'name');
        const name = txt(nameNode).split('.').pop();
        out.annotations.push(name);
        out.anns.push(m);
      } else {
        out.keywords.push(m.type.replace('_', ''));
      }
    }
  }
  return out;
}

// first string-literal argument of an annotation, or value= pair
function annotationStringValue(annNode) {
  if (!annNode || annNode.type !== 'annotation') return null;
  const args = field(annNode, 'arguments');
  if (!args) return null;
  // element_value_pair with key value/path, else first bare string literal
  for (const pair of named(args)) {
    if (pair.type === 'element_value_pair') {
      const key = txt(field(pair, 'key'));
      if (key === 'value' || key === 'path') {
        const lit = pair.descendantsOfType('string_literal')[0];
        if (lit) return unquote(txt(lit));
      }
    }
  }
  const lit = args.descendantsOfType('string_literal')[0];
  return lit ? unquote(txt(lit)) : null;
}

function annNamed(anns, simpleName) {
  return anns.find((a) => txt(field(a, 'name')).split('.').pop() === simpleName) || null;
}

function joinPath(base, sub) {
  const a = (base || '').replace(/\/$/, '');
  const b = (sub || '');
  if (!a) return b || '/';
  if (!b) return a || '/';
  return `${a}/${b.replace(/^\//, '')}`;
}

// ── per-file extraction ──────────────────────────────────────────────────
function extractFile(tree, relPath, ctx) {
  const root = tree.rootNode;
  const pkgDecl = root.descendantsOfType('package_declaration')[0];
  const pkg = pkgDecl ? txt(named(pkgDecl)[0]) : '';

  // imports: simpleName -> fqcn (for same-file resolution)
  const importMap = {};
  for (const imp of root.descendantsOfType('import_declaration')) {
    const fqcn = txt(named(imp).find((c) => c.type === 'scoped_identifier' || c.type === 'identifier'));
    if (!fqcn || fqcn.endsWith('*')) continue;
    const simple = fqcn.split('.').pop();
    importMap[simple] = fqcn;
    ctx.edges.push({ source: `file:${relPath}`, target: fqcn, type: 'imports', evidence: `import ${fqcn}`, _kind: 'import' });
  }

  const declTypes = ['class_declaration', 'interface_declaration', 'enum_declaration'];
  for (const decl of root.descendantsOfType(declTypes)) {
    extractType(decl, pkg, relPath, importMap, ctx);
  }
}

function extractType(decl, pkg, relPath, importMap, ctx) {
  const name = txt(field(decl, 'name'));
  if (!name) return;
  const fqcn = pkg ? `${pkg}.${name}` : name;
  const kind = decl.type === 'interface_declaration' ? 'interface'
    : decl.type === 'enum_declaration' ? 'enum' : 'class';
  const mods = readModifiers(decl);
  const stereotype = mods.annotations.map((a) => STEREOTYPE[a]).find(Boolean) || null;
  const id = `${kind}:${fqcn}`;

  ctx.nodes.push({
    id, kind, name, fqcn, file: relPath,
    range: [decl.startPosition.row + 1, decl.endPosition.row + 1],
    stereotype, annotations: mods.annotations, modifiers: mods.keywords,
  });
  ctx.declared[name] = fqcn; // same-run simple-name resolution

  // extends / implements
  const sup = field(decl, 'superclass');
  if (sup) ctx.edges.push({ source: id, target: resolveType(txt(sup).replace(/^extends\s+/, ''), pkg, importMap), type: 'extends', evidence: txt(sup), _kind: 'ref' });
  const ifaces = field(decl, 'interfaces');
  if (ifaces) for (const t of ifaces.descendantsOfType('type_identifier')) {
    ctx.edges.push({ source: id, target: resolveType(txt(t), pkg, importMap), type: 'implements', evidence: txt(t), _kind: 'ref' });
  }

  // entity -> table
  if (stereotype === 'entity') {
    const tableAnn = annNamed(mods.anns, 'Table');
    const table = (tableAnn && annotationStringValue(tableAnn)) || name;
    ctx.nodes.push({ id: `table:${table}`, kind: 'table', name: table, file: relPath, range: [decl.startPosition.row + 1, decl.startPosition.row + 1] });
    ctx.edges.push({ source: id, target: `table:${table}`, type: 'persists', evidence: `@Entity ${name}`, _kind: 'final' });
  }

  // class-level base path for endpoints
  const reqAnn = annNamed(mods.anns, 'RequestMapping');
  const basePath = reqAnn ? annotationStringValue(reqAnn) : '';

  const injected = {}; // fieldName -> resolved type id (for calls heuristic)
  const body = field(decl, 'body');
  if (!body) return;
  for (const member of named(body)) {
    if (member.type === 'field_declaration') extractField(member, id, pkg, importMap, injected, ctx);
    else if (member.type === 'constructor_declaration') extractCtorInjection(member, pkg, importMap, injected, ctx, id);
    else if (member.type === 'method_declaration') extractMethod(member, id, fqcn, basePath, stereotype, pkg, importMap, injected, ctx);
  }
}

function extractField(member, ownerId, pkg, importMap, injected, ctx) {
  const mods = readModifiers(member);
  const typeNode = field(member, 'type');
  const declor = member.descendantsOfType('variable_declarator')[0];
  const fname = txt(field(declor, 'name'));
  if (!fname) return;
  ctx.nodes.push({ id: `field:${ownerId.split(':')[1]}#${fname}`, kind: 'field', name: fname, file: ctx.relPath, range: [member.startPosition.row + 1, member.startPosition.row + 1], annotations: mods.annotations });
  ctx.edges.push({ source: ownerId, target: `field:${ownerId.split(':')[1]}#${fname}`, type: 'contains', evidence: fname, _kind: 'final' });
  // DI: @Autowired field, or any field whose type resolves to a project type (Spring constructor-less)
  const typeSimple = txt(typeNode).replace(/<.*>$/, '');
  const target = resolveType(typeSimple, pkg, importMap);
  if (mods.annotations.includes('Autowired') || mods.annotations.includes('Inject') || mods.annotations.includes('Resource')) {
    ctx.edges.push({ source: ownerId, target, type: 'injects', evidence: `@Autowired ${typeSimple} ${fname}`, _kind: 'ref' });
  }
  injected[fname] = target; // remember for calls heuristic regardless of annotation
}

function extractCtorInjection(member, pkg, importMap, injected, ctx, ownerId) {
  const params = field(member, 'parameters');
  if (!params) return;
  for (const p of named(params)) {
    if (p.type !== 'formal_parameter') continue;
    const typeSimple = txt(field(p, 'type')).replace(/<.*>$/, '');
    const pname = txt(field(p, 'name'));
    const target = resolveType(typeSimple, pkg, importMap);
    ctx.edges.push({ source: ownerId, target, type: 'injects', evidence: `ctor ${typeSimple} ${pname}`, _kind: 'ref' });
    if (pname) injected[pname] = target;
  }
}

function extractMethod(member, ownerId, ownerFqcn, basePath, stereotype, pkg, importMap, injected, ctx) {
  const mname = txt(field(member, 'name'));
  if (!mname) return;
  const mods = readModifiers(member);
  const params = field(member, 'parameters');
  const sig = `${txt(field(member, 'type'))} ${mname}${txt(params)}`.trim();
  const mid = `method:${ownerFqcn}#${mname}`;
  ctx.nodes.push({
    id: mid, kind: 'method', name: mname, file: ctx.relPath,
    range: [member.startPosition.row + 1, member.endPosition.row + 1],
    signature: sig, annotations: mods.annotations,
    transactional: mods.annotations.includes('Transactional'),
  });
  ctx.edges.push({ source: ownerId, target: mid, type: 'contains', evidence: mname, _kind: 'final' });

  // endpoint mapping
  for (const ann of mods.anns) {
    const aname = txt(field(ann, 'name')).split('.').pop();
    if (HTTP_MAPPING[aname] || aname === 'RequestMapping') {
      const sub = annotationStringValue(ann) || '';
      const httpMethod = HTTP_MAPPING[aname] || 'ANY';
      const route = joinPath(basePath, sub);
      const eid = `endpoint:${httpMethod} ${route}`;
      ctx.nodes.push({ id: eid, kind: 'endpoint', name: route, file: ctx.relPath, range: [member.startPosition.row + 1, member.startPosition.row + 1], httpMethod, route, handler: mid });
      ctx.edges.push({ source: ownerId, target: eid, type: 'exposes', evidence: `@${aname} ${route}`, _kind: 'final' });
    }
    if (aname === 'KafkaListener') {
      const topic = annotationStringValue(ann) || 'unknown';
      ctx.edges.push({ source: mid, target: `topic:${topic}`, type: 'listens', evidence: `@KafkaListener ${topic}`, _kind: 'final' });
    }
  }

  // calls heuristic: receiver is an injected field whose type resolves to a project type
  const bodyNode = field(member, 'body');
  if (!bodyNode) return;
  for (const inv of bodyNode.descendantsOfType('method_invocation')) {
    const obj = field(inv, 'object');
    const callee = txt(field(inv, 'name'));
    if (!obj || obj.type !== 'identifier') continue;
    const recv = txt(obj);
    const targetType = injected[recv];
    if (!targetType || !callee) continue;
    const targetFqcn = targetType.includes(':') ? targetType.split(':')[1] : targetType;
    ctx.edges.push({ source: mid, target: `method:${targetFqcn}#${callee}`, type: 'calls', evidence: `${recv}.${callee}()`, confidence: 'field-type', _kind: 'ref' });
  }
}

// Resolve a simple type name to a stable id where possible.
// import hit -> class:<fqcn>; same package -> class:<pkg.Name>; else unresolved marker.
function resolveType(simple, pkg, importMap) {
  const base = (simple || '').replace(/<.*>$/, '').split('.').pop();
  if (!base) return `?:${simple}`;
  if (importMap[base]) return `class:${importMap[base]}`;
  if (pkg) return `class:${pkg}.${base}`; // optimistic same-package; merge prunes if dangling
  return `?:${base}`;
}

// ── main ─────────────────────────────────────────────────────────────────
function main() {
  const [, , inPath, outPath] = process.argv;
  if (!inPath || !outPath) fail('usage: extract-java-graph.mjs <input.json> <output.json>');

  let input;
  try { input = JSON.parse(readFileSync(inPath, 'utf8')); }
  catch (e) { fail(`cannot read input: ${e.message}`); }
  const projectRoot = input.projectRoot || process.cwd();
  const files = Array.isArray(input.files) ? input.files : [];
  if (files.length === 0) fail('no files in input');

  const parser = loadParser();
  const ctx = { nodes: [], edges: [], declared: {}, relPath: '' };
  const parseErrors = [];

  for (const f of files) {
    const rel = f.path;
    const abs = isAbsolute(rel) ? rel : resolve(projectRoot, rel);
    let src;
    try { src = readFileSync(abs, 'utf8'); }
    catch (e) { parseErrors.push({ file: rel, error: e.message }); continue; }
    ctx.relPath = rel;
    try {
      const tree = parser.parse(src);
      if (tree.rootNode.hasError) parseErrors.push({ file: rel, error: 'syntax error nodes present' });
      // synthesize a file node so import edges have a real source
      ctx.nodes.push({ id: `file:${rel}`, kind: 'file', name: rel.split('/').pop(), file: rel, range: [1, src.split('\n').length] });
      extractFile(tree, rel, ctx);
    } catch (e) {
      parseErrors.push({ file: rel, error: e.message });
    }
  }

  // resolve _kind: 'ref' edges against the run's declared node ids; leftovers -> unresolved
  const nodeIds = new Set(ctx.nodes.map((n) => n.id));
  // resolveType emits an optimistic `class:` prefix; a type may actually be interface/enum
  const typeKind = (fqcn) => (nodeIds.has(`class:${fqcn}`) ? 'class'
    : nodeIds.has(`interface:${fqcn}`) ? 'interface'
    : nodeIds.has(`enum:${fqcn}`) ? 'enum' : null);
  const unresolved = [];
  const edges = [];
  for (const e of ctx.edges) {
    const { _kind, ...edge } = e;
    if (_kind === 'final') { edges.push(edge); continue; }
    if (_kind === 'import') {
      const k = typeKind(edge.target);
      if (k) { edge.target = `${k}:${edge.target}`; edges.push(edge); }
      else unresolved.push(edge); // external or cross-batch import
      continue;
    }
    // ref edges: target is class:<fqcn> (type ref) or method:<fqcn>#m (call)
    const tgt = edge.target;
    if (tgt.startsWith('class:')) {
      const fqcn = tgt.slice('class:'.length);
      const k = typeKind(fqcn);
      if (k) { edge.target = `${k}:${fqcn}`; edges.push(edge); continue; }
    } else if (tgt.startsWith('method:')) {
      if (nodeIds.has(tgt)) { edges.push(edge); continue; }
      // method node absent but owning type present -> keep (cross-file member, real target)
      const owner = tgt.slice('method:'.length).split('#')[0];
      if (typeKind(owner)) { edges.push(edge); continue; }
    } else if (nodeIds.has(tgt)) { edges.push(edge); continue; }
    unresolved.push(edge);
  }

  const out = {
    version: '1.0.0',
    project: { root: projectRoot, fileCount: files.length },
    nodes: ctx.nodes,
    edges,
    unresolved,
    parseErrors,
  };
  writeFileSync(outPath, JSON.stringify(out, null, 2));
  process.stderr.write(`extract-java-graph: ${ctx.nodes.length} nodes, ${edges.length} edges, ${unresolved.length} unresolved, ${parseErrors.length} parse errors\n`);
}

try { main(); } catch (e) { fail(e.stack || e.message); }
