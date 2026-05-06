#!/usr/bin/env python3
# scripts/metrics-summary.py
# Prints a console-only summary of recent orchestra runs.
# Reads <metrics-dir>/runs/*.json (the per-run summaries written by the
# Stop hook) and shows last N as a table. Privacy-safe: runs/<id>.json
# carries derived classifications only — no user prompt content.
#
# v2.2.0+: adds Δ-avg + Heaviest-agent columns and a cost-trend footer
# (theme γ — consumer-observed token cost). Heaviest column is sourced
# from tokens.jsonl per-subagent rows filtered by run_id; falls back to
# "—" when tokens.jsonl is absent (older consumers / opt-out).
#
# Usage:
#   python3 scripts/metrics-summary.py [--metrics-dir PATH] [--limit N]

import argparse
import json
import statistics
import sys
from collections import defaultdict
from pathlib import Path


def load_runs(runs_dir: Path) -> list[dict]:
    runs = []
    for p in runs_dir.glob("*.json"):
        try:
            data = json.loads(p.read_text())
            data["_run_id"] = p.stem
            runs.append(data)
        except Exception as e:
            print(f"warn: skip malformed {p.name}: {e}", file=sys.stderr)
    return runs


def load_tokens_by_run(metrics_dir: Path) -> dict[str, dict[str, int]]:
    """Build run_id → {agent_role: summed_total_tokens} from tokens.jsonl.
    Returns {} if tokens.jsonl is absent or unreadable — Heaviest then renders '—'."""
    tokens_path = metrics_dir / "tokens.jsonl"
    if not tokens_path.is_file():
        return {}
    by_run: dict[str, dict[str, int]] = defaultdict(lambda: defaultdict(int))
    try:
        for line in tokens_path.read_text().splitlines():
            line = line.strip()
            if not line:
                continue
            try:
                row = json.loads(line)
            except Exception:
                continue
            if row.get("event") != "subagent.tokens":
                continue
            run_id = row.get("run_id") or ""
            role = row.get("agent_role") or "unknown"
            t = row.get("tokens") or {}
            total = (t.get("input", 0) + t.get("output", 0) +
                     t.get("cache_read", 0) + t.get("cache_create", 0))
            by_run[run_id][role] += total
    except Exception as e:
        print(f"warn: unable to read tokens.jsonl: {e}", file=sys.stderr)
        return {}
    return by_run


def total_tokens(run: dict) -> int:
    t = run.get("tokens", {}) or {}
    return (t.get("input", 0) + t.get("output", 0) +
            t.get("cache_read", 0) + t.get("cache_create", 0))


def total_usd(run: dict):
    """Read cost_usd persisted by the metrics-collector hook (single source of
    truth lives at hooks/lib/rate-card.js). Older runs lack the field — return
    None so the display can render '—' rather than fabricating a number."""
    v = run.get("cost_usd")
    if isinstance(v, (int, float)):
        return float(v)
    return None


def fmt_usd(v) -> str:
    if v is None:
        return "—"
    if v >= 100:
        return f"${v:.0f}"
    if v >= 10:
        return f"${v:.1f}"
    return f"${v:.2f}"


def fmt_k(n: int) -> str:
    if n >= 1_000_000:
        return f"{n/1_000_000:.1f}M"
    if n >= 1_000:
        return f"{n/1_000:.1f}K"
    return str(n)


def fmt_delta_pct(current: int, baseline: float) -> str:
    if baseline <= 0:
        return "—"
    pct = (current - baseline) / baseline * 100
    sign = "+" if pct >= 0 else ""
    return f"{sign}{pct:.0f}%"


def heaviest_role(run_id: str, tokens_by_run: dict[str, dict[str, int]]) -> str:
    roles = tokens_by_run.get(run_id) or {}
    if not roles:
        return "—"
    role, total = max(roles.items(), key=lambda kv: kv[1])
    return f"{role}:{fmt_k(total)}"


def main():
    ap = argparse.ArgumentParser(description="Show recent orchestra runs.")
    ap.add_argument("--metrics-dir", default=".claude/.orchestra/metrics",
                    help="Path to metrics directory (default: ./.claude/.orchestra/metrics)")
    ap.add_argument("--limit", type=int, default=10,
                    help="How many recent runs to display (default: 10)")
    args = ap.parse_args()

    metrics_dir = Path(args.metrics_dir).resolve()
    runs_dir = metrics_dir / "runs"
    if not runs_dir.is_dir():
        print(f"No metrics found at {runs_dir}", file=sys.stderr)
        print("Run /orchestra <intent> first to generate a metrics folder.", file=sys.stderr)
        sys.exit(1)

    runs = load_runs(runs_dir)
    if not runs:
        print(f"No runs found in {runs_dir}.", file=sys.stderr)
        sys.exit(0)

    runs.sort(key=lambda r: r.get("started_at") or "", reverse=True)
    recent = runs[: args.limit]
    tokens_by_run = load_tokens_by_run(metrics_dir)

    def fmt_dur(seconds):
        if seconds is None: return "—"
        if seconds < 60: return f"{seconds}s"
        return f"{seconds // 60}m"

    def fmt_gates(r):
        if r.get("deadlocked"): return "DEADLOCK"
        g = r.get("gates", {}) or {}
        v = g.get("verdict") or "—"
        c = g.get("code_review") or "—"
        if v == "produced" and c == "produced": return "PASS"
        if v == "pending" or c == "pending": return "PENDING"
        return f"{v[:4]}/{c[:4]}"

    def trunc(s, n):
        if s is None: return "—"
        s = str(s)
        return s[: n - 1] + "…" if len(s) > n else s

    print(f"Last {len(recent)} orchestra runs from {runs_dir}:\n")
    header = (f"{'Feature':<22} {'Intent':<10} {'Conf':<6} {'Pattern':<20} "
              f"{'Gates':<10} {'Tokens':<8} {'Cost':<7} {'Δ avg':<7} {'Heaviest':<22} {'Dur':<6}")
    print(header)
    print("─" * len(header))

    # For each displayed run, baseline = mean of the next-10 OLDER runs.
    for i, r in enumerate(recent):
        cur_tokens = total_tokens(r)
        cur_usd = total_usd(r)
        older = runs[i + 1 : i + 1 + 10]
        older_totals = [total_tokens(x) for x in older]
        baseline = statistics.mean(older_totals) if older_totals else 0
        delta = fmt_delta_pct(cur_tokens, baseline)
        heaviest = heaviest_role(r.get("_run_id") or "", tokens_by_run)

        print(
            f"{trunc(r.get('feature_id') or '—', 22):<22} "
            f"{trunc(r.get('intent'), 10):<10} "
            f"{trunc(r.get('confidence'), 6):<6} "
            f"{trunc(r.get('pattern'), 20):<20} "
            f"{fmt_gates(r):<10} "
            f"{fmt_k(cur_tokens):<8} "
            f"{fmt_usd(cur_usd):<7} "
            f"{delta:<7} "
            f"{trunc(heaviest, 22):<22} "
            f"{fmt_dur(r.get('duration_seconds')):<6}"
        )

    # Footer stats — across ALL runs
    total = len(runs)
    passed = sum(1 for r in runs if not r.get("deadlocked")
                 and (r.get("gates", {}) or {}).get("verdict") == "produced"
                 and (r.get("gates", {}) or {}).get("code_review") == "produced")
    token_totals = [total_tokens(r) for r in runs]
    usd_totals = [v for v in (total_usd(r) for r in runs) if v is not None]
    median_tokens = int(statistics.median(token_totals)) if token_totals else 0
    median_usd_str = fmt_usd(statistics.median(usd_totals)) if usd_totals else "—"
    pass_rate = f"{passed*100/total:.0f}%" if total else "—"
    print(f"\nTotal runs: {total}  |  Pass rate: {pass_rate}  |  "
          f"Median tokens/run: {fmt_k(median_tokens)}  |  Median cost/run: {median_usd_str}")

    # Cost-trend footer (last 10 runs window)
    last10 = token_totals[: min(10, len(token_totals))]
    last10_usd = usd_totals[: min(10, len(usd_totals))]
    if last10:
        med10 = int(statistics.median(last10))
        try:
            p90_10 = int(statistics.quantiles(last10, n=10)[8]) if len(last10) >= 2 else last10[0]
        except statistics.StatisticsError:
            p90_10 = last10[0]
        rolling_mean = statistics.mean(last10)
        warn_threshold = int(rolling_mean * 1.15)
        line = (f"Cost trend (last {len(last10)} runs): median {fmt_k(med10)}  |  "
                f"p90 {fmt_k(p90_10)}  |  warn-threshold {fmt_k(warn_threshold)} "
                f"(+15% over rolling mean)")
        if last10_usd:
            med10_usd = statistics.median(last10_usd)
            try:
                p90_10_usd = (statistics.quantiles(last10_usd, n=10)[8]
                              if len(last10_usd) >= 2 else last10_usd[0])
            except statistics.StatisticsError:
                p90_10_usd = last10_usd[0]
            line += f"  |  median {fmt_usd(med10_usd)} / p90 {fmt_usd(p90_10_usd)} USD"
        print(line)
        print("USD source: hooks/lib/rate-card.js (Opus 4.7 list price); cost_usd "
              "is computed by the metrics-collector hook at write-time and persisted "
              "into runs/<id>.json. Older runs without the field render '—'.")


if __name__ == "__main__":
    main()
