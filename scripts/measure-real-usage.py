#!/usr/bin/env python3
# Generates docs/optimization-baseline-real.html — Task 14.
# Methodology: parse session jsonls (~/.claude/projects/<encoded-cwd>/*.jsonl) for
# real input_tokens/output_tokens/cache_read_input_tokens/cache_creation_input_tokens
# from a completed orchestra run. Real measurement, not chars/3.8 estimate.

import json
import re
from pathlib import Path
from html import escape

ROOT = Path(__file__).resolve().parent.parent
SESSIONS_DIR = Path.home() / ".claude" / "projects" / "-private-tmp-orchestra-smoke-4"
EVENTS_JSONL = Path("/tmp/orchestra-smoke-4/.claude/.orchestra/metrics/events.jsonl")


def first_user_message(jsonl_path: Path) -> str:
    """Return preview text of first user message in a session jsonl."""
    with jsonl_path.open() as f:
        for line in f:
            try:
                d = json.loads(line)
                if d.get("type") == "user":
                    content = d.get("message", {}).get("content", "")
                    if isinstance(content, list):
                        content = " ".join(
                            c.get("text", "") for c in content if isinstance(c, dict)
                        )
                    return str(content)[:300]
            except Exception:
                continue
    return ""


def identify_agent(preview: str) -> tuple[str, str]:
    """Return (role, ordinal) for a session given its first-user preview."""
    if "<local-command-caveat>" in preview:
        return ("dispatcher", "")
    m = re.search(r"You are @(\w+) in the orchestra pipeline", preview)
    if not m:
        return ("unknown", "")
    role = m.group(1)
    ord_m = re.search(r"\((\w+) turn\)", preview)
    ord_text = f" ({ord_m.group(1)} turn)" if ord_m else ""
    return (role, ord_text)


def sum_session_tokens(jsonl_path: Path) -> dict:
    """Sum all tokens across all turns in a session jsonl."""
    totals = {"input": 0, "output": 0, "cache_read": 0, "cache_create": 0, "turns": 0}
    with jsonl_path.open() as f:
        for line in f:
            try:
                d = json.loads(line)
                usage = d.get("message", {}).get("usage")
                if not usage:
                    continue
                totals["input"] += usage.get("input_tokens", 0) or 0
                totals["output"] += usage.get("output_tokens", 0) or 0
                totals["cache_read"] += usage.get("cache_read_input_tokens", 0) or 0
                totals["cache_create"] += usage.get("cache_creation_input_tokens", 0) or 0
                totals["turns"] += 1
            except Exception:
                continue
    totals["effective_input"] = (
        totals["input"] + totals["cache_read"] + totals["cache_create"]
    )
    totals["grand_total"] = totals["effective_input"] + totals["output"]
    return totals


def parse_events_jsonl():
    """Build a lightweight summary of orchestra events for context."""
    events = []
    if not EVENTS_JSONL.exists():
        return events
    with EVENTS_JSONL.open() as f:
        for line in f:
            try:
                events.append(json.loads(line))
            except Exception:
                continue
    return events


def main():
    sessions = sorted(SESSIONS_DIR.glob("*.jsonl"))
    rows = []
    for sj in sessions:
        sid = sj.stem
        preview = first_user_message(sj)
        role, ord_text = identify_agent(preview)
        tokens = sum_session_tokens(sj)
        rows.append(
            {
                "session_id": sid,
                "role": role,
                "label": (
                    "dispatcher (parent)"
                    if role == "dispatcher"
                    else f"@{role}{ord_text}"
                ),
                "tokens": tokens,
            }
        )

    # Totals
    grand = {"input": 0, "output": 0, "cache_read": 0, "cache_create": 0, "turns": 0}
    for r in rows:
        for k in grand:
            grand[k] += r["tokens"][k]
    grand["effective_input"] = grand["input"] + grand["cache_read"] + grand["cache_create"]
    grand["grand_total"] = grand["effective_input"] + grand["output"]

    # Aggregate by role (combine multi-turn agents)
    by_role = {}
    for r in rows:
        key = r["role"]
        if key not in by_role:
            by_role[key] = {
                "label": r["label"].rsplit(" (", 1)[0],
                "input": 0, "output": 0, "cache_read": 0, "cache_create": 0,
                "turns": 0, "sessions": 0,
            }
        by_role[key]["input"] += r["tokens"]["input"]
        by_role[key]["output"] += r["tokens"]["output"]
        by_role[key]["cache_read"] += r["tokens"]["cache_read"]
        by_role[key]["cache_create"] += r["tokens"]["cache_create"]
        by_role[key]["turns"] += r["tokens"]["turns"]
        by_role[key]["sessions"] += 1

    for role, agg in by_role.items():
        agg["effective_input"] = agg["input"] + agg["cache_read"] + agg["cache_create"]
        agg["grand_total"] = agg["effective_input"] + agg["output"]

    # Events summary
    events = parse_events_jsonl()
    artifacts = [e for e in events if e.get("event") == "artifact.written"]
    subagent_invokes = [e for e in events if e.get("event") == "task.subagent.invoked"]
    if events:
        first_ts = events[0].get("ts")
        last_ts = events[-1].get("ts")
    else:
        first_ts = last_ts = "—"

    # ---- HTML render ----
    def fmt(n):
        return f"{int(n):,}"

    def row(cells, tag="td"):
        return "<tr>" + "".join(f"<{tag}>{c}</{tag}>" for c in cells) + "</tr>"

    style = """
<style>
body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif; max-width: 1100px; margin: 2em auto; padding: 0 1em; color: #1a1a1a; line-height: 1.5; }
h1 { border-bottom: 3px solid #1a1a1a; padding-bottom: 0.3em; }
h2 { margin-top: 2em; border-bottom: 1px solid #ccc; padding-bottom: 0.2em; }
table { border-collapse: collapse; width: 100%; margin: 1em 0; font-size: 0.9em; }
th, td { border: 1px solid #ddd; padding: 6px 10px; text-align: left; }
th { background: #f4f4f4; }
td.num { text-align: right; font-variant-numeric: tabular-nums; }
code { background: #f4f4f4; padding: 1px 4px; border-radius: 3px; font-size: 0.9em; }
.lede { color: #555; font-size: 0.95em; }
.callout { background: #fffbe6; border-left: 4px solid #e0c200; padding: 0.8em 1em; margin: 1em 0; }
.meta { color: #888; font-size: 0.85em; margin-top: 3em; border-top: 1px solid #ddd; padding-top: 1em; }
</style>
"""

    # Per-role table (sorted by grand_total descending)
    role_rows_sorted = sorted(by_role.items(), key=lambda kv: -kv[1]["grand_total"])
    role_rows_html = []
    for role, agg in role_rows_sorted:
        role_rows_html.append(row([
            f"<strong>{escape(agg['label'])}</strong>",
            f'<td class="num">{fmt(agg["sessions"])}</td>'.replace("<td class=\"num\">", "").replace("</td>", ""),
            f"{fmt(agg['turns'])}",
            f"{fmt(agg['input'])}",
            f"{fmt(agg['output'])}",
            f"{fmt(agg['cache_read'])}",
            f"{fmt(agg['cache_create'])}",
            f"<strong>{fmt(agg['grand_total'])}</strong>",
        ]))

    # Per-session table
    session_rows_html = []
    for r in sorted(rows, key=lambda x: -x["tokens"]["grand_total"]):
        session_rows_html.append(row([
            f"<code>{r['session_id'][:8]}</code>",
            escape(r["label"]),
            fmt(r["tokens"]["turns"]),
            fmt(r["tokens"]["input"]),
            fmt(r["tokens"]["output"]),
            fmt(r["tokens"]["cache_read"]),
            fmt(r["tokens"]["cache_create"]),
            f"<strong>{fmt(r['tokens']['grand_total'])}</strong>",
        ]))

    summary = f"""
<h2>Run summary</h2>
<table>
<tbody>
{row(["Run", "URL shortener (greenfield smoke)"])}
{row(["Run id", "<code>d61490de-f019-486d-936a-a1774cae7e66</code>"])}
{row(["Sessions analysed", str(len(sessions))])}
{row(["Total turns recorded", fmt(grand["turns"])])}
{row(["Artifacts produced", fmt(len(artifacts))])}
{row(["Subagent invocations", fmt(len(subagent_invokes))])}
{row(["First event", escape(first_ts or "—")])}
{row(["Last event", escape(last_ts or "—")])}
</tbody>
</table>
"""

    totals_block = f"""
<h2>Aggregate token usage (real, measured)</h2>

<table>
<thead>{row(["Bucket", "Tokens", "Share of effective input"], tag="th")}</thead>
<tbody>
{row(["Fresh input (uncached)", fmt(grand["input"]), f'{(grand["input"] / grand["effective_input"] * 100) if grand["effective_input"] else 0:.1f}%'])}
{row(["Cache read (5min/1h)", fmt(grand["cache_read"]), f'{(grand["cache_read"] / grand["effective_input"] * 100) if grand["effective_input"] else 0:.1f}%'])}
{row(["Cache creation", fmt(grand["cache_create"]), f'{(grand["cache_create"] / grand["effective_input"] * 100) if grand["effective_input"] else 0:.1f}%'])}
{row(["<strong>Effective input</strong>", f"<strong>{fmt(grand['effective_input'])}</strong>", "100.0%"])}
{row(["Output", fmt(grand["output"]), "—"])}
{row(["<strong>Grand total</strong>", f"<strong>{fmt(grand['grand_total'])}</strong>", "—"])}
</tbody>
</table>

<div class="callout">
<strong>What this measures:</strong> total tokens billed during the smoke-4 run with the
<em>pre-trim</em> orchestra plugin (before PR-α/β/γ). This is the &quot;before&quot; column for
the post-trim diff in Task 13.
<br><br>
<strong>What it doesn't measure:</strong> per-file plugin attribution. Claude Code reports
total per-turn input, not &quot;how many of those tokens were the dispatcher vs the agent body.&quot;
For per-file estimates see <code>docs/optimization-baseline.html</code> (chars/3.8 heuristic).
</div>
"""

    by_role_html = f"""
<h2>By agent role</h2>
<p class="lede">Multi-turn agents are merged. Cache reads dominate after the first turn (the dispatcher gets cached).</p>
<table>
<thead>{row(["Role", "Sessions", "Turns", "Input (fresh)", "Output", "Cache read", "Cache create", "Grand total"], tag="th")}</thead>
<tbody>
{''.join(role_rows_html)}
</tbody>
</table>
"""

    by_session_html = f"""
<h2>Per session (raw)</h2>
<details><summary>Show 11 sessions</summary>
<table>
<thead>{row(["Session", "Role", "Turns", "Input (fresh)", "Output", "Cache read", "Cache create", "Grand total"], tag="th")}</thead>
<tbody>
{''.join(session_rows_html)}
</tbody>
</table>
</details>
"""

    cross_ref_html = f"""
<h2>Cross-check vs static estimate</h2>
<p class="lede">The static <code>chars/3.8</code> estimate in <code>optimization-baseline.html</code> measures plugin file size, not run cost. Compare:</p>
<table>
<tbody>
{row(["Static estimate (whole plugin worst-case sum)", "~12,003 + 12,298 + 4,238 + 786 = <strong>~29,325 tok</strong>"])}
{row(["Real-run effective input + output (pre-trim)", f"<strong>{fmt(grand['grand_total'])} tok</strong>"])}
</tbody>
</table>
<p class="lede">
The real-run number is far higher than static because: (a) every turn re-loads context (compounded by cache),
(b) intermediate tool results count toward input, (c) prompt/response cycles include user content beyond the plugin.
The static estimate bounds <em>plugin contribution per turn</em>; the real number captures <em>total session economics.</em>
</p>
"""

    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Orchestra — Real-Usage Baseline (smoke-4)</title>
{style}
</head>
<body>
<h1>Orchestra — Real-Usage Baseline (smoke-4)</h1>
<p class="lede">Measured token usage from the URL-shortener smoke run, parsed from Claude Code session jsonls. Pairs with the static estimate in <code>docs/optimization-baseline.html</code>; replaces it as the &quot;before&quot; ground truth for the optimization workstream.</p>
{summary}
{totals_block}
{by_role_html}
{by_session_html}
{cross_ref_html}
<p class="meta">Generated by <code>scripts/measure-real-usage.py</code>. Source: <code>~/.claude/projects/-private-tmp-orchestra-smoke-4/*.jsonl</code> + <code>/tmp/orchestra-smoke-4/.claude/.orchestra/metrics/events.jsonl</code>.</p>
</body>
</html>
"""

    out_path = ROOT / "docs" / "optimization-baseline-real.html"
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(html)

    # Console summary
    print(f"Wrote: {out_path.relative_to(ROOT)}")
    print()
    print(f"=== Aggregate token usage (real, measured) ===")
    print(f"  Fresh input:        {grand['input']:>10,} tok")
    print(f"  Cache read:         {grand['cache_read']:>10,} tok")
    print(f"  Cache create:       {grand['cache_create']:>10,} tok")
    print(f"  Effective input:    {grand['effective_input']:>10,} tok")
    print(f"  Output:             {grand['output']:>10,} tok")
    print(f"  GRAND TOTAL:        {grand['grand_total']:>10,} tok")
    print()
    print(f"=== By role (sorted by total) ===")
    for role, agg in role_rows_sorted:
        print(f"  {agg['label']:<25}  {agg['sessions']} session(s)  {agg['turns']:>4} turn(s)  {agg['grand_total']:>10,} tok")
    print()
    print(f"Sessions analysed: {len(sessions)}")
    print(f"Total turns: {grand['turns']}")
    print(f"Artifacts produced: {len(artifacts)}")
    print(f"Subagent invocations: {len(subagent_invokes)}")


if __name__ == "__main__":
    main()
