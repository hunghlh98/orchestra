#!/usr/bin/env python3
# scripts/metrics-summary.py
# Prints a console-only summary of recent orchestra runs.
# Reads <metrics-dir>/runs/*.json (the per-run summaries written by the
# Stop hook) and shows last N as a table. Privacy-safe: runs/<id>.json
# carries derived classifications only — no user prompt content.
#
# Usage:
#   python3 scripts/metrics-summary.py [--metrics-dir PATH] [--limit N]

import argparse
import json
import statistics
import sys
from pathlib import Path


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

    runs = []
    for p in runs_dir.glob("*.json"):
        try:
            runs.append(json.loads(p.read_text()))
        except Exception as e:
            print(f"warn: skip malformed {p.name}: {e}", file=sys.stderr)

    if not runs:
        print(f"No runs found in {runs_dir}.", file=sys.stderr)
        sys.exit(0)

    runs.sort(key=lambda r: r.get("started_at") or "", reverse=True)
    recent = runs[: args.limit]

    def fmt_tokens(t):
        n = (t.get("input", 0) + t.get("output", 0) +
             t.get("cache_read", 0) + t.get("cache_create", 0))
        if n >= 1_000_000: return f"{n/1_000_000:.1f}M"
        if n >= 1_000: return f"{n/1_000:.1f}K"
        return str(n)

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
    header = f"{'Feature':<22} {'Intent':<10} {'Conf':<6} {'Pattern':<20} {'Gates':<10} {'Tokens':<8} {'Dur':<6}"
    print(header)
    print("─" * len(header))
    for r in recent:
        print(
            f"{trunc(r.get('feature_id') or '—', 22):<22} "
            f"{trunc(r.get('intent'), 10):<10} "
            f"{trunc(r.get('confidence'), 6):<6} "
            f"{trunc(r.get('pattern'), 20):<20} "
            f"{fmt_gates(r):<10} "
            f"{fmt_tokens(r.get('tokens', {})):<8} "
            f"{fmt_dur(r.get('duration_seconds')):<6}"
        )

    # Footer stats — across ALL runs, not just the displayed window
    total = len(runs)
    passed = sum(1 for r in runs if not r.get("deadlocked")
                 and (r.get("gates", {}) or {}).get("verdict") == "produced"
                 and (r.get("gates", {}) or {}).get("code_review") == "produced")
    token_totals = [
        (r.get("tokens", {}).get("input", 0) +
         r.get("tokens", {}).get("output", 0) +
         r.get("tokens", {}).get("cache_read", 0) +
         r.get("tokens", {}).get("cache_create", 0))
        for r in runs
    ]
    median_tokens = int(statistics.median(token_totals)) if token_totals else 0
    median_str = (f"{median_tokens/1_000_000:.1f}M" if median_tokens >= 1_000_000
                  else f"{median_tokens/1_000:.1f}K" if median_tokens >= 1_000
                  else str(median_tokens))
    pass_rate = f"{passed*100/total:.0f}%" if total else "—"
    print(f"\nTotal runs: {total}  |  Pass rate: {pass_rate}  |  Median tokens/run: {median_str}")


if __name__ == "__main__":
    main()
