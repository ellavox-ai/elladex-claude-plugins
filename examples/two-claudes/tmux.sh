#!/usr/bin/env bash
# Two Claude Code sessions side by side: austin on the left, berlin on the right.
#
#   ./tmux.sh [--dir <workspace>]
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd -P)"
WS="${TMPDIR:-/tmp}/two-claudes"
if [ "${1:-}" = "--dir" ]; then
	[ $# -ge 2 ] || { echo "--dir needs a path" >&2; exit 2; }
	WS="$2"; shift 2
fi
command -v tmux > /dev/null || { echo "tmux not found; run ./claude.sh austin and ./claude.sh berlin in two terminals instead" >&2; exit 1; }
[ -f "$WS/austin.env" ] || { echo "run setup.sh first (no $WS/austin.env)" >&2; exit 1; }
WS="$(cd "$WS" && pwd -P)"
SESSION="two-claudes-$(printf '%s\n' "$WS" | cksum | cut -d' ' -f1)"
attach() { if [ -n "${TMUX:-}" ]; then exec tmux switch-client -t "$SESSION"; else exec tmux attach -t "$SESSION"; fi; }
tmux has-session -t "$SESSION" 2>/dev/null && attach
left="$(printf '%q ' "$HERE/claude.sh" austin --dir "$WS")"
right="$(printf '%q ' "$HERE/claude.sh" berlin --dir "$WS")"
tmux new-session -d -s "$SESSION" -x 240 -y 60 "$left"
tmux set-option -t "$SESSION" remain-on-exit on > /dev/null
tmux split-window -h -t "$SESSION" "$right"
tmux select-pane -t "$SESSION:0.0"
attach
