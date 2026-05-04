#!/usr/bin/env python3
# scripts/aggregate-metrics.py
# Plugin-shipped aggregator for consumer-harvested metrics folders.
#
# Reads only `runs/<run-id>.json` files (already-aggregated, already-redacted
# harvest units per Task 16). Does NOT read raw events.jsonl, tokens.jsonl,
# or session jsonls — those carry user content and live behind the
# manifest.redact_prompts toggle. The aggregator is privacy-respecting by
# construction: if a consumer chose to redact, our analysis still works.
#
# Usage:
#   python3 scripts/aggregate-metrics.py <metrics_dir>... [--out PATH]
#
# Each <metrics_dir> is a .claude/.orchestra/metrics/ folder from one
# consumer install. Combine N folders into one HTML report.

import argparse
import json
import statistics
import sys
from collections import Counter, defaultdict
from pathlib import Path
from html import escape


def load_runs(metrics_dir: Path) -> list[dict]:
    runs_dir = metrics_dir / "runs"
    if not runs_dir.is_dir():
        return []
    runs = []
    for run_path in sorted(runs_dir.glob("*.json")):
        try:
            runs.append(json.loads(run_path.read_text()))
        except Exception as e:
            print(f"warn: failed to parse {run_path}: {e}", file=sys.stderr)
    return runs


def load_manifest(metrics_dir: Path) -> dict | None:
    p = metrics_dir / "manifest.json"
    if not p.is_file():
        return None
    try:
        return json.loads(p.read_text())
    except Exception:
        return None


def is_run_passed(run: dict) -> bool:
    """Considered passed when both gates produced and not deadlocked.
    Future enrichment: read actual verdict PASS/FAIL from gates.passing_score."""
    if run.get("deadlocked"):
        return False
    gates = run.get("gates", {}) or {}
    return gates.get("verdict") == "produced" and gates.get("code_review") == "produced"


def total_tokens(run: dict) -> int:
    t = run.get("tokens", {}) or {}
    return (t.get("input", 0) + t.get("output", 0) +
            t.get("cache_read", 0) + t.get("cache_create", 0))


def render_html(folders, runs_per_folder, all_runs, manifests):
    def fmt(n):
        return f"{int(n):,}"

    def pct(num, denom):
        return f"{(num / denom * 100):.1f}%" if denom else "—"

    def row(cells, tag="td"):
        return "<tr>" + "".join(f"<{tag}>{c}</{tag}>" for c in cells) + "</tr>"

    total_runs = len(all_runs)
    passed = sum(1 for r in all_runs if is_run_passed(r))
    deadlocked = sum(1 for r in all_runs if r.get("deadlocked"))

    intents = Counter(r.get("intent") or "unknown" for r in all_runs)
    confidences = Counter(r.get("confidence") or "unknown" for r in all_runs)
    patterns = Counter(r.get("pattern") or "unknown" for r in all_runs)
    versions = Counter(r.get("plugin_version") or "unknown" for r in all_runs)

    agent_freq = Counter()
    for r in all_runs:
        for a in r.get("agents_spawned") or []:
            agent_freq[a] += 1

    tokens_by_intent = defaultdict(list)
    for r in all_runs:
        intent = r.get("intent") or "unknown"
        tokens_by_intent[intent].append(total_tokens(r))

    # Manifests rollup: how many folders had redact_prompts on?
    redacted_folders = sum(1 for m in manifests if m and m.get("redact_prompts"))
    optin_explicit = sum(1 for m in manifests if m and m.get("telemetry_optin") == "explicit")

    style = """
<style>
body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif; max-width: 1100px; margin: 2em auto; padding: 0 1em; color: #1a1a1a; line-height: 1.5; }
h1 { border-bottom: 3px solid #1a1a1a; padding-bottom: 0.3em; }
h2 { margin-top: 2em; border-bottom: 1px solid #ccc; padding-bottom: 0.2em; }
table { border-collapse: collapse; width: 100%; margin: 1em 0; font-size: 0.9em; }
th, td { border: 1px solid #ddd; padding: 6px 10px; text-align: left; }
th { background: #f4f4f4; }
code { background: #f4f4f4; padding: 1px 4px; border-radius: 3px; font-size: 0.9em; }
.lede { color: #555; font-size: 0.95em; }
.callout { background: #f0f8ff; border-left: 4px solid #4a90d9; padding: 0.8em 1em; margin: 1em 0; }
.warn { background: #fff5e6; border-left: 4px solid #e08800; padding: 0.8em 1em; margin: 1em 0; }
.meta { color: #888; font-size: 0.85em; margin-top: 3em; border-top: 1px solid #ddd; padding-top: 1em; }
</style>
"""

    # Insights stats from runs/<id>.json's insights_count field
    insights_per_run = [r.get("insights_count", 0) for r in all_runs]
    total_insights = sum(insights_per_run)
    runs_with_insights = sum(1 for n in insights_per_run if n > 0)
    avg_insights = (total_insights / total_runs) if total_runs else 0
    median_insights = (statistics.median(insights_per_run)
                       if insights_per_run else 0)

    summary_table = f"""
<h2>Summary</h2>
<table>
<tbody>
{row(["Folders aggregated", fmt(len(folders))])}
{row(["Total runs", fmt(total_runs)])}
{row(["Passed (gates produced, not deadlocked)", f"{fmt(passed)} ({pct(passed, total_runs)})"])}
{row(["Deadlocked", f"{fmt(deadlocked)} ({pct(deadlocked, total_runs)})"])}
{row(["Folders with redact_prompts:true", f"{fmt(redacted_folders)} / {fmt(len(manifests))}"])}
{row(["Folders with telemetry_optin:explicit", f"{fmt(optin_explicit)} / {fmt(len(manifests))}"])}
{row(["★ Insights emitted (total)", f"{fmt(total_insights)} across {fmt(runs_with_insights)} runs ({pct(runs_with_insights, total_runs)})"])}
{row(["★ Insights per run", f"avg {avg_insights:.1f}  ·  median {median_insights:.0f}"])}
</tbody>
</table>
"""

    by_folder = "\n".join(
        row([f"<code>{escape(str(f))}</code>", fmt(len(rs))])
        for f, rs in zip(folders, runs_per_folder)
    )
    folder_table = f"""
<h2>By folder</h2>
<table>
<thead>{row(["Folder", "Runs"], tag="th")}</thead>
<tbody>
{by_folder}
</tbody>
</table>
"""

    intent_rows = []
    for intent, count in intents.most_common():
        toks = tokens_by_intent[intent]
        median = statistics.median(toks) if toks else 0
        total = sum(toks)
        intent_rows.append(row([
            f"<strong>{escape(intent)}</strong>",
            fmt(count),
            pct(count, total_runs),
            fmt(int(median)),
            fmt(total),
        ]))

    intent_table = f"""
<h2>By intent type</h2>
<table>
<thead>{row(["Intent", "Runs", "Share", "Median tokens", "Total tokens"], tag="th")}</thead>
<tbody>
{''.join(intent_rows)}
</tbody>
</table>
"""

    confidence_rows = "\n".join(
        row([escape(k), fmt(v), pct(v, total_runs)])
        for k, v in confidences.most_common()
    )
    pattern_rows = "\n".join(
        row([escape(k), fmt(v), pct(v, total_runs)])
        for k, v in patterns.most_common()
    )
    version_rows = "\n".join(
        row([f"<code>{escape(k)}</code>", fmt(v), pct(v, total_runs)])
        for k, v in versions.most_common()
    )

    sub_tables = f"""
<h2>By confidence</h2>
<table>
<thead>{row(["Confidence", "Runs", "Share"], tag="th")}</thead>
<tbody>
{confidence_rows}
</tbody>
</table>

<h2>By dialogue pattern</h2>
<table>
<thead>{row(["Pattern", "Runs", "Share"], tag="th")}</thead>
<tbody>
{pattern_rows}
</tbody>
</table>

<h2>By plugin version</h2>
<table>
<thead>{row(["plugin_version", "Runs", "Share"], tag="th")}</thead>
<tbody>
{version_rows}
</tbody>
</table>
"""

    agent_rows = "\n".join(
        row([escape(a), fmt(c), pct(c, total_runs)])
        for a, c in agent_freq.most_common()
    )
    agent_table = f"""
<h2>Agent spawn frequency</h2>
<p class="lede">Across all aggregated runs. A &quot;100%&quot; agent spawned in every run.</p>
<table>
<thead>{row(["Agent", "Runs spawned in", "Share"], tag="th")}</thead>
<tbody>
{agent_rows}
</tbody>
</table>
"""

    callout = """
<div class="callout">
<strong>Privacy:</strong> this aggregator reads <em>only</em> per-run summary JSONs from
each consumer's <code>metrics/runs/</code> directory. It never opens raw
<code>events.jsonl</code>, <code>tokens.jsonl</code>, or session jsonls. The summaries
themselves contain only derived classifications (intent, confidence, pattern, agent role,
artifact name, token totals) — no user prompt text or tool output.
</div>
"""

    body = (summary_table + callout + folder_table + intent_table +
            sub_tables + agent_table)

    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Orchestra — Aggregated Metrics</title>
{style}
</head>
<body>
<h1>Orchestra — Aggregated Metrics</h1>
<p class="lede">Combined report across {fmt(len(folders))} consumer metrics folder(s).</p>
{body}
<p class="meta">Generated by <code>scripts/aggregate-metrics.py</code>. Source: <code>runs/&lt;run-id&gt;.json</code> across input folders. Per-folder manifest.json governs what's been redacted before reaching this aggregator.</p>
</body>
</html>
"""
    return html


def main():
    ap = argparse.ArgumentParser(
        description="Aggregate orchestra metrics across N consumer folders.",
    )
    ap.add_argument("metrics_dirs", nargs="+",
                    help="One or more <project>/.claude/.orchestra/metrics directories.")
    ap.add_argument("--out", default="docs/aggregated-metrics.html",
                    help="Output HTML path (default: docs/aggregated-metrics.html).")
    args = ap.parse_args()

    folders = [Path(d).resolve() for d in args.metrics_dirs]
    runs_per_folder = []
    manifests = []
    all_runs = []

    for f in folders:
        if not f.is_dir():
            print(f"warn: not a directory: {f}", file=sys.stderr)
            runs_per_folder.append([])
            manifests.append(None)
            continue
        rs = load_runs(f)
        runs_per_folder.append(rs)
        manifests.append(load_manifest(f))
        all_runs.extend(rs)

    if not all_runs:
        print("error: no runs found across input folders", file=sys.stderr)
        sys.exit(1)

    html = render_html(folders, runs_per_folder, all_runs, manifests)
    out_path = Path(args.out).resolve()
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(html)

    # Console summary
    print(f"Wrote: {out_path}")
    print()
    print(f"Folders aggregated: {len(folders)}")
    print(f"Total runs:         {len(all_runs)}")
    passed = sum(1 for r in all_runs if is_run_passed(r))
    print(f"Passed:             {passed} ({passed*100/len(all_runs):.1f}%)")
    print(f"Deadlocked:         {sum(1 for r in all_runs if r.get('deadlocked'))}")
    intents = Counter(r.get("intent") or "unknown" for r in all_runs)
    print(f"Intents:            {dict(intents)}")


if __name__ == "__main__":
    main()
