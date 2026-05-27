#!/usr/bin/env node
// scripts/tests/extract-java-graph.test.js
// Verifies the deterministic Java code-graph extractor:
// endpoints from @*Mapping, persists from @Entity/@Table, injects from @Autowired +
// constructor params, calls via injected-field receiver, @Transactional boundary flag,
// interface-target resolution, and that external imports land in `unresolved` (not edges).
//
// Vendored WASM under skills/java-development/scripts/vendor/; no install needed.

import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SKILL = resolve(root, "skills/java-development/scripts");
const EXTRACT = resolve(SKILL, "extract-java-graph.mjs");
const BATCH = resolve(SKILL, "compute-graph-batches.mjs");
const MERGE = resolve(SKILL, "merge-java-graph.mjs");
const FINGERPRINT = resolve(SKILL, "build-graph-fingerprints.mjs");
const CLASSIFY = resolve(SKILL, "classify-graph-diff.mjs");
const STALE_HOOK = resolve(root, "hooks/scripts/code-graph-stale.js");
let failures = 0;
let passes = 0;

function check(cond, msg) {
  if (cond) { passes++; }
  else { failures++; console.error(`  FAIL: ${msg}`); }
}

const FILES = {
  "com/foo/order/OrderService.java": `package com.foo.order;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
@Service
public class OrderService {
  private final OrderRepository repo;
  public OrderService(OrderRepository repo){ this.repo = repo; }
  @Transactional
  public OrderDto place(CreateOrder req){ return repo.save(req); }
  public OrderDto find(Long id){ return repo.findById(id); }
}`,
  "com/foo/order/OrderController.java": `package com.foo.order;
import org.springframework.web.bind.annotation.*;
@RestController
@RequestMapping("/orders")
public class OrderController {
  @Autowired private OrderService svc;
  @PostMapping
  public OrderDto place(@RequestBody CreateOrder req){ return svc.place(req); }
  @GetMapping("/{id}")
  public OrderDto get(@PathVariable Long id){ return svc.find(id); }
}`,
  "com/foo/order/Order.java": `package com.foo.order;
import javax.persistence.*;
@Entity
@Table(name = "orders")
public class Order { @Id private Long id; private String status; }`,
  "com/foo/order/OrderRepository.java": `package com.foo.order;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
@Repository
public interface OrderRepository extends JpaRepository<Order, Long> {}`,
};

const tmp = mkdtempSync(join(tmpdir(), "orchestra-jgraph-"));
try {
  for (const [rel, src] of Object.entries(FILES)) {
    const abs = join(tmp, rel);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, src);
  }
  const inputPath = join(tmp, "input.json");
  const outPath = join(tmp, "out.json");
  writeFileSync(inputPath, JSON.stringify({
    projectRoot: tmp,
    files: Object.keys(FILES).map((p) => ({ path: p })),
  }));

  const r = spawnSync("node", [EXTRACT, inputPath, outPath], { encoding: "utf8" });
  check(r.status === 0, `extractor exits 0 (got ${r.status}; stderr: ${r.stderr})`);

  const g = JSON.parse(readFileSync(outPath, "utf8"));
  const has = (pred) => g.edges.some(pred);
  const nodeById = (id) => g.nodes.find((n) => n.id === id);

  check(g.parseErrors.length === 0, `no parse errors (got ${JSON.stringify(g.parseErrors)})`);

  // endpoints
  check(!!nodeById("endpoint:POST /orders"), "POST /orders endpoint node present");
  check(!!nodeById("endpoint:GET /orders/{id}"), "GET /orders/{id} endpoint node present");
  check(has((e) => e.type === "exposes" && e.target === "endpoint:POST /orders"), "exposes POST /orders");

  // persists
  check(!!nodeById("table:orders"), "table:orders node present");
  check(has((e) => e.type === "persists" && e.source === "class:com.foo.order.Order" && e.target === "table:orders"), "Order persists orders");

  // injects (field + constructor; interface target resolved)
  check(has((e) => e.type === "injects" && e.target === "class:com.foo.order.OrderService"), "Controller injects OrderService (field)");
  check(has((e) => e.type === "injects" && e.target === "interface:com.foo.order.OrderRepository"), "Service injects OrderRepository (ctor, interface target)");

  // calls via injected-field receiver
  check(has((e) => e.type === "calls" && e.source === "method:com.foo.order.OrderController#place" && e.target === "method:com.foo.order.OrderService#place"), "Controller.place calls Service.place");
  check(has((e) => e.type === "calls" && e.target === "method:com.foo.order.OrderRepository#save"), "Service.place calls Repository.save");

  // transactional flag
  const placeSvc = nodeById("method:com.foo.order.OrderService#place");
  check(placeSvc && placeSvc.transactional === true, "OrderService#place flagged transactional");

  // external imports are unresolved, never in edges
  check(g.unresolved.some((e) => e.type === "imports" && /springframework/.test(e.target)), "external spring import in unresolved");
  check(!g.edges.some((e) => e.type === "imports" && /springframework/.test(e.target)), "no external import leaked into edges");

  // stable ids
  check(!!nodeById("class:com.foo.order.OrderController"), "stable class id");
  check(!!nodeById("interface:com.foo.order.OrderRepository"), "interface kind id");

  // ── Tier 2: batch + merge must equal the single-pass graph ──────────────
  const batchesPath = join(tmp, "batches.json");
  const b = spawnSync("node", [BATCH, inputPath, batchesPath, "2"], { encoding: "utf8" });
  check(b.status === 0, `batcher exits 0 (got ${b.status}; ${b.stderr})`);
  const batches = JSON.parse(readFileSync(batchesPath, "utf8")).batches;
  check(batches.length >= 2, `maxBatch=2 forces a split (got ${batches.length} batches)`);

  const batchOuts = [];
  for (const bx of batches) {
    const bin = join(tmp, `bin-${bx.index}.json`);
    const bout = join(tmp, `graph-batch-${bx.index}.json`);
    writeFileSync(bin, JSON.stringify({ projectRoot: tmp, files: bx.files.map((p) => ({ path: p })) }));
    const er = spawnSync("node", [EXTRACT, bin, bout], { encoding: "utf8" });
    check(er.status === 0, `batch ${bx.index} extract exits 0`);
    batchOuts.push(bout);
  }
  const mergedPath = join(tmp, "merged.json");
  const mr = spawnSync("node", [MERGE, mergedPath, ...batchOuts], { encoding: "utf8" });
  check(mr.status === 0, `merge exits 0 (got ${mr.status}; ${mr.stderr})`);
  const merged = JSON.parse(readFileSync(mergedPath, "utf8"));

  // merged graph equals the single-pass graph (node + edge counts), cross-batch refs recovered
  check(merged.nodes.length === g.nodes.length, `merged node count == single-pass (${merged.nodes.length} vs ${g.nodes.length})`);
  check(merged.edges.length === g.edges.length, `merged edge count == single-pass (${merged.edges.length} vs ${g.edges.length})`);
  check(merged.merge.promoted > 0, `merge recovered cross-batch refs (${merged.merge.promoted})`);
  check(merged.merge.droppedDangling === 0, `no dangling edges dropped (${merged.merge.droppedDangling})`);
  const mhas = (pred) => merged.edges.some(pred);
  check(mhas((e) => e.type === "injects" && e.source === "class:com.foo.order.OrderService" && e.target === "interface:com.foo.order.OrderRepository"), "cross-batch inject Service->Repository recovered");
  check(mhas((e) => e.type === "calls" && e.target === "method:com.foo.order.OrderRepository#save"), "cross-batch call Service->Repository.save recovered");
  check(merged.unresolved.every((e) => e.type === "imports"), "only external imports remain unresolved post-merge");

  // ── Tier 3: fingerprints + incremental classify ────────────────────────
  const fpPath = join(tmp, "fingerprints.json");
  const fr = spawnSync("node", [FINGERPRINT, outPath, fpPath, "abc1234"], { encoding: "utf8" });
  check(fr.status === 0, `fingerprint exits 0 (got ${fr.status}; ${fr.stderr})`);
  const fp = JSON.parse(readFileSync(fpPath, "utf8"));
  check(Object.keys(fp.files).length === Object.keys(FILES).length, `fingerprint covers all files (${Object.keys(fp.files).length})`);
  check(fp.commit === "abc1234", "fingerprint records commit");

  // cosmetic change (comment only) must NOT flip the hash; structural change (new endpoint) must
  writeFileSync(join(tmp, "com/foo/order/Order.java"), "// a harmless comment\n" + FILES["com/foo/order/Order.java"]);
  writeFileSync(join(tmp, "com/foo/order/OrderController.java"), FILES["com/foo/order/OrderController.java"].replace(
    "@GetMapping(\"/{id}\")\n  public OrderDto get(@PathVariable Long id){ return svc.find(id); }",
    "@GetMapping(\"/{id}\")\n  public OrderDto get(@PathVariable Long id){ return svc.find(id); }\n  @DeleteMapping(\"/{id}\")\n  public void cancel(@PathVariable Long id){ svc.find(id); }"));
  const out2 = join(tmp, "out2.json");
  spawnSync("node", [EXTRACT, inputPath, out2], { encoding: "utf8" });
  const diffPath = join(tmp, "diff.json");
  const dr = spawnSync("node", [CLASSIFY, fpPath, out2, diffPath], { encoding: "utf8" });
  check(dr.status === 0, `classify exits 0 (got ${dr.status}; ${dr.stderr})`);
  const diff = JSON.parse(readFileSync(diffPath, "utf8"));
  check(diff.structural.includes("com/foo/order/OrderController.java"), "new endpoint => Controller structural");
  check(diff.unchanged.includes("com/foo/order/Order.java"), "comment-only => Order unchanged (cosmetic)");
  check(diff.unchanged.includes("com/foo/order/OrderService.java"), "untouched => Service unchanged");

  // ── Tier 3: stale hook ──────────────────────────────────────────────────
  const repo = join(tmp, "repo");
  mkdirSync(join(repo, ".orchestra/order/code-graph"), { recursive: true });
  spawnSync("git", ["-C", repo, "init", "-q"], { encoding: "utf8" });
  spawnSync("git", ["-C", repo, "config", "user.email", "t@t"], { encoding: "utf8" });
  spawnSync("git", ["-C", repo, "config", "user.name", "t"], { encoding: "utf8" });
  writeFileSync(join(repo, "f.txt"), "x");
  spawnSync("git", ["-C", repo, "add", "-A"], { encoding: "utf8" });
  spawnSync("git", ["-C", repo, "commit", "-qm", "init"], { encoding: "utf8" });
  const head = spawnSync("git", ["-C", repo, "rev-parse", "HEAD"], { encoding: "utf8" }).stdout.trim();
  const metaPath = join(repo, ".orchestra/order/code-graph/meta.json");
  const runHook = (event) => spawnSync("node", [STALE_HOOK], {
    encoding: "utf8",
    input: JSON.stringify({ hook_event_name: event, cwd: repo }),
  });

  writeFileSync(metaPath, JSON.stringify({ commit: head }));
  const fresh = runHook("SessionStart");
  check(fresh.stdout.trim() === "", "fresh graph (commit==HEAD) => hook silent");

  writeFileSync(metaPath, JSON.stringify({ commit: "deadbeefdeadbeef" }));
  const stale = runHook("SessionStart");
  check(/additionalContext/.test(stale.stdout) && /stale/.test(stale.stdout), "stale graph => SessionStart additionalContext notice");
  check(/\border\b/.test(stale.stdout), "stale notice names the service");

  const off = spawnSync("node", [STALE_HOOK], { encoding: "utf8", input: JSON.stringify({ hook_event_name: "SessionStart", cwd: repo }), env: { ...process.env, ORCHESTRA_HOOK_CODE_GRAPH_STALE: "off" } });
  check(off.stdout.trim() === "", "toggle off => hook silent");
} finally {
  rmSync(tmp, { recursive: true, force: true });
}

console.log(`extract-java-graph: ${passes} passed, ${failures} failed`);
process.exit(failures === 0 ? 0 : 1);
