#!/usr/bin/env bash
# scripts/test-streamline-fixture.sh — WORKFLOW-003 P-S05 smoke gate (v1.0.1).
#
# Runs automated PR exit checks for the streamlining initiative. The fully
# automated spec in WORKFLOW-003 §1.2 (clone /tmp project + run /orchestra
# <intent> 6 times) is not implementable in plain bash — /orchestra is
# interactive and pauses at AskUserQuestion gates. This script does the
# automated portion and prints a manual checklist for subcommand parity.
set -euo pipefail
cd "$(cd "$(dirname "$0")/.." && pwd)"

node scripts/test-agents.js > /dev/null || { echo "✗ test-agents.js FAILED"; exit 1; }
node scripts/validate.js > /dev/null 2>&1 || { echo "✗ validate.js FAILED:"; node scripts/validate.js; exit 1; }
echo "✓ validators (test-agents.js, validate.js)"
[ "$(ls agents/*.md | wc -l)" -eq 8 ] || { echo "✗ agent count drift"; exit 1; }
echo "✓ 8 agents present"
node -e "JSON.parse(require('fs').readFileSync('.claude-plugin/plugin.json'))" 2>/dev/null || { echo "✗ plugin.json corrupt"; exit 1; }
echo "✓ plugin.json parses"
echo "  consumer-surface words: $(cat commands/orchestra.md agents/*.md skills/*/SKILL.md | wc -w | tr -d ' ')"
echo "  commands/orchestra.md words: $(wc -w < commands/orchestra.md | tr -d ' ')"
echo "  references/ files: $(find skills -path '*/references/*' -type f 2>/dev/null | wc -l | tr -d ' ')"
HITS=$(grep -rnE "(^|[^A-Za-z-])(PRD|DESIGN|WORKFLOW)-[0-9]+|PRD §|per (PRD|DESIGN|WORKFLOW)" agents/ commands/ skills/ 2>/dev/null || true)
[ -z "$HITS" ] && echo "✓ no dev-trace cites in consumer surface" || { echo "✗ leaky cites found:"; echo "$HITS"; exit 1; }

cat <<'EOF'

=== Manual smoke (subcommand parity — PR #2+ gate) ===
Run these in an interactive Claude session against a fixture project, compare each output to the pre-PR baseline:
  /orchestra help       — command surface loads, all subcommands listed
  /orchestra commit     — commit-work skill invokes (or "nothing staged")
  /orchestra metrics    — clean exit (no-op if no metrics dir)
  /orchestra resume     — emits "no in-flight features" if pipeline empty
  /orchestra shutdown   — emits "no active team" no-op if not in /orchestra session
EOF

echo ""
echo "fixture smoke: PASS"
