#!/usr/bin/env bash
# orchestra-statusline.sh
# Emits `[ORCH:<phase>]` for Claude Code statusLine when a session is bootstrapped
# (i.e. <cwd>/.orchestra/local.yaml is a regular file, not a symlink). Phase is
# derived from <cwd>/.orchestra/metrics/events.jsonl by walking
# pipeline.phase.start/end pairs and picking the most recent start without a
# matching end. User wires this in via their own settings.json statusLine field
# — the plugin does not auto-install it (see v4.1 brief §7c).

set -eu

# Read CC statusline stdin (best-effort cwd extraction; falls back to $PWD).
input=""
cwd="${PWD:-.}"
if [ ! -t 0 ]; then
  input=$(cat)
  parsed=$(printf '%s' "$input" | sed -n 's/.*"cwd"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -n1)
  [ -n "$parsed" ] && cwd="$parsed"
fi

local_yaml="$cwd/.orchestra/local.yaml"
events="$cwd/.orchestra/metrics/events.jsonl"

# Suppress when local.yaml is absent or replaced by a symlink. Symlinks at this
# path could redirect reads to an unrelated file controlled by another process,
# so we refuse to honor them as a hardening step (same posture as safe-fs.js).
[ -L "$local_yaml" ] && exit 0
[ ! -f "$local_yaml" ] && exit 0

# Walk events.jsonl for the most recent pipeline.phase.start with no later
# matching pipeline.phase.end. Skipped if events.jsonl is a symlink.
phase=""
if [ -f "$events" ] && [ ! -L "$events" ]; then
  phase=$(awk '
    {
      if ($0 ~ /"event":"pipeline\.phase\.start"/) {
        if (match($0, /"phase":"[a-z][a-z0-9-]*"/)) {
          latest = substr($0, RSTART+9, RLENGTH-10)
          latest_line = NR
          ended = 0
        }
      } else if ($0 ~ /"event":"pipeline\.phase\.end"/ && latest != "") {
        if (match($0, /"phase":"[a-z][a-z0-9-]*"/)) {
          p = substr($0, RSTART+9, RLENGTH-10)
          if (p == latest && NR > latest_line) ended = 1
        }
      }
    }
    END { if (latest != "" && !ended) print latest }
  ' "$events" 2>/dev/null || true)
fi

# Whitelist: lowercase letters, digits, dashes. Strip everything else as a
# defense against malformed values in events.jsonl.
phase=$(printf '%s' "$phase" | tr -cd 'a-z0-9-')

# No active phase → no badge.
[ -z "$phase" ] && exit 0

# Cap total output at 64 bytes.
out="[ORCH:${phase}]"
printf '%s\n' "${out:0:64}"
