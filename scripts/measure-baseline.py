#!/usr/bin/env python3
# Generates docs/optimization-baseline.html — Task 1 of the cost-trim workstream.
# Methodology: chars/3.8 estimate (calibrated for Claude on English markdown).
# Ground truth comes in Task 13 from real session jsonl diff.

import os
import re
from pathlib import Path
from html import escape

ROOT = Path(__file__).resolve().parent.parent
CHARS_PER_TOKEN = 3.8


def split_frontmatter(text: str):
    if not text.startswith("---"):
        return "", text
    parts = text.split("---", 2)
    if len(parts) < 3:
        return "", text
    return parts[1], parts[2]


def extract_description(frontmatter: str) -> str:
    in_desc = False
    lines = []
    for line in frontmatter.splitlines():
        if line.startswith("description:"):
            in_desc = True
            lines.append(line[len("description:"):].strip())
            continue
        if in_desc:
            if re.match(r"^[a-zA-Z_-]+:", line):
                break
            lines.append(line.strip())
    return " ".join(l for l in lines if l).strip().strip('"')


def count_tokens(text: str) -> int:
    return round(len(text) / CHARS_PER_TOKEN)


def measure_file(path: Path, surface_body: str) -> dict:
    text = path.read_text()
    fm, body = split_frontmatter(text)
    desc = extract_description(fm)
    return {
        "path": str(path.relative_to(ROOT)),
        "chars": len(text),
        "words": len(text.split()),
        "tokens_total": count_tokens(text),
        "tokens_frontmatter": count_tokens("---" + fm + "---"),
        "tokens_body": count_tokens(body),
        "description": desc,
        "description_chars": len(desc),
        "description_tokens": count_tokens(desc),
        "surface_body": surface_body,
    }


def main():
    agents = [measure_file(p, "per_spawn") for p in sorted((ROOT / "agents").glob("*.md"))]
    skills = [measure_file(p, "per_invocation") for p in sorted((ROOT / "skills").glob("*/SKILL.md"))]
    command = measure_file(ROOT / "commands" / "orchestra.md", "per_invocation_orchestra")

    # Always-loaded surface = sum of all description tokens (agents + skills + command frontmatter)
    always_loaded_tokens = (
        sum(a["description_tokens"] for a in agents)
        + sum(s["description_tokens"] for s in skills)
        + command["tokens_frontmatter"]
    )

    # Per-/orchestra-invocation = command body
    per_invocation_orchestra = command["tokens_body"]

    # Per-agent-spawn (worst case if all 8 spawn in one feature run) = sum of agent bodies
    per_spawn_total = sum(a["tokens_body"] for a in agents)

    # Per-skill-invocation (worst case if all 8 fire) = sum of skill bodies
    per_skill_total = sum(s["tokens_body"] for s in skills)

    # Projections per finding
    projections = []

    # Finding #3: agent descriptions ~80 chars target
    target_desc_tokens = round(80 / CHARS_PER_TOKEN)
    f3_saved = sum(a["description_tokens"] - target_desc_tokens for a in agents if a["description_tokens"] > target_desc_tokens)
    projections.append({
        "id": "#3",
        "name": "Shorten 8 agent descriptions to ≤80 chars",
        "surface": "always_loaded (every session)",
        "saving_tokens": f3_saved,
        "frequency": "per Claude Code session",
    })

    # Finding #4: skill descriptions drop Keywords: trailer (~80 chars each)
    target_skill_desc_tokens = round(140 / CHARS_PER_TOKEN)
    f4_saved = sum(max(0, s["description_tokens"] - target_skill_desc_tokens) for s in skills)
    projections.append({
        "id": "#4",
        "name": "Drop Keywords: trailers from 8 skill descriptions",
        "surface": "always_loaded (every session)",
        "saving_tokens": f4_saved,
        "frequency": "per Claude Code session",
    })

    # Finding #5: cap implementer agents to 1 example (drop ~150 words from each of 6)
    f5_per_agent = round(150 * 5 / CHARS_PER_TOKEN)  # 150 words ≈ 750 chars / 3.8
    f5_saved_per_spawn = f5_per_agent * 6
    projections.append({
        "id": "#5",
        "name": "Cap 6 implementer agents at 1 example (skip @evaluator, @reviewer)",
        "surface": "per_spawn (multiplied by spawn count)",
        "saving_tokens": f5_saved_per_spawn,
        "frequency": "per agent spawn (across the 6 implementers)",
    })

    # Finding #2: frontmatter contract block dedup (~95 words per agent × 6 agents → 1 doc reference)
    f2_per_agent = round(95 * 5 / CHARS_PER_TOKEN)
    f2_saved_per_spawn = f2_per_agent * 6
    projections.append({
        "id": "#2",
        "name": "Extract duplicated Frontmatter contract block to docs/",
        "surface": "per_spawn (multiplied by spawn count)",
        "saving_tokens": f2_saved_per_spawn,
        "frequency": "per agent spawn (across 6 agents)",
    })

    # Finding #1: dispatcher trim 2200 → 1300 words (Q3 conservative)
    current_words = command["words"]
    target_words = 1300
    word_delta = max(0, current_words - target_words)
    f1_saved = round(word_delta * 5 / CHARS_PER_TOKEN)  # ~5 chars/word average
    projections.append({
        "id": "#1",
        "name": "Trim commands/orchestra.md (Q3 conservative — 3 sections kept)",
        "surface": "per_orchestra_invocation",
        "saving_tokens": f1_saved,
        "frequency": "per /orchestra invocation",
    })

    # Render HTML
    def row(cells):
        return "<tr>" + "".join(f"<td>{c}</td>" for c in cells) + "</tr>"

    def fmt_int(n):
        return f"{n:,}"

    files_table_rows = []
    for f in agents + skills + [command]:
        files_table_rows.append(row([
            f"<code>{escape(f['path'])}</code>",
            fmt_int(f["chars"]),
            fmt_int(f["words"]),
            fmt_int(f["tokens_total"]),
            fmt_int(f["description_tokens"]),
            fmt_int(f["tokens_body"]),
            f["surface_body"],
        ]))

    proj_rows = []
    for p in projections:
        proj_rows.append(row([
            p["id"],
            escape(p["name"]),
            escape(p["surface"]),
            fmt_int(p["saving_tokens"]) + " tok",
            escape(p["frequency"]),
        ]))

    summary = f"""
<h2>Summary — Current Cost Baseline</h2>
<p class="lede">Methodology: token estimates use <strong>chars / 3.8</strong>, a calibrated heuristic for Claude on English markdown. Real session-jsonl measurement happens in Task 13 (post-merge result report).</p>
<table>
<thead><tr><th>Surface</th><th>Tokens (estimate)</th><th>Frequency</th></tr></thead>
<tbody>
{row(["always_loaded", fmt_int(always_loaded_tokens), "every Claude Code session (registry preload)"])}
{row(["per_invocation (/orchestra)", fmt_int(per_invocation_orchestra), "every /orchestra invocation"])}
{row(["per_spawn (sum of 8 agents)", fmt_int(per_spawn_total), "worst case if all 8 spawn"])}
{row(["per_invocation (sum of 8 skills)", fmt_int(per_skill_total), "worst case if all 8 fire"])}
</tbody>
</table>
"""

    files_table = f"""
<h2>Per-File Token Breakdown</h2>
<table>
<thead><tr>
<th>File</th><th>Chars</th><th>Words</th><th>Total tok</th><th>Description tok</th><th>Body tok</th><th>Surface</th>
</tr></thead>
<tbody>
{''.join(files_table_rows)}
</tbody>
</table>
"""

    proj_table = f"""
<h2>Projected Savings — by Finding</h2>
<p class="lede">Estimated savings per finding, ordered by descending leverage. Frequency column matters: a per-session saving accrues every login; a per-spawn saving only accrues when an agent runs.</p>
<table>
<thead><tr>
<th>Finding</th><th>Action</th><th>Surface</th><th>Saving (est.)</th><th>Frequency</th>
</tr></thead>
<tbody>
{''.join(proj_rows)}
</tbody>
</table>
"""

    decision_block = f"""
<h2>Decision Inputs</h2>
<ul>
<li><strong>Always-loaded baseline:</strong> {fmt_int(always_loaded_tokens)} tok per session. Findings #3 + #4 cut this surface — savings recur on every login.</li>
<li><strong>/orchestra invocation baseline:</strong> {fmt_int(per_invocation_orchestra)} tok per call. Finding #1 cuts this — savings recur on every /orchestra run.</li>
<li><strong>Per-spawn baseline (sum of all 8):</strong> {fmt_int(per_spawn_total)} tok worst case. Findings #2 + #5 cut this — savings recur per agent spawn.</li>
<li><strong>Highest single-file cost:</strong> commands/orchestra.md at {fmt_int(command["tokens_body"])} body tokens — confirms the spec-panel finding that the dispatcher is the costliest single surface.</li>
</ul>
"""

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
.meta { color: #888; font-size: 0.85em; margin-top: 3em; border-top: 1px solid #ddd; padding-top: 1em; }
</style>
"""

    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Orchestra — Optimization Baseline</title>
{style}
</head>
<body>
<h1>Orchestra — Optimization Baseline</h1>
<p class="lede">Pre-cut measurement for the cost-trim workstream (Task 1 of 13). Pairs with <code>docs/optimization-result.html</code> generated in Task 13 from real session jsonl diff.</p>
{summary}
{decision_block}
{files_table}
{proj_table}
<p class="meta">Generated by <code>scripts/measure-baseline.py</code>. Methodology: chars / 3.8 token estimate. Ground truth via session jsonl diff in Task 13 post-merge.</p>
</body>
</html>
"""

    out_path = ROOT / "docs" / "optimization-baseline.html"
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(html)

    # Also print a concise summary to stdout
    print(f"Wrote: {out_path.relative_to(ROOT)}")
    print()
    print("=== SUMMARY ===")
    print(f"Always-loaded baseline:        {always_loaded_tokens:>6,} tok per session")
    print(f"/orchestra invocation cost:    {per_invocation_orchestra:>6,} tok per call")
    print(f"Sum of 8 agent bodies:         {per_spawn_total:>6,} tok (worst case)")
    print(f"Sum of 8 skill bodies:         {per_skill_total:>6,} tok (worst case)")
    print()
    print("=== PROJECTED SAVINGS ===")
    for p in projections:
        print(f"  {p['id']}: {p['saving_tokens']:>6,} tok — {p['name'][:50]}")
        print(f"      ({p['frequency']})")


if __name__ == "__main__":
    main()
