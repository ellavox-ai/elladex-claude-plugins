#!/usr/bin/env bash
# Stop this workspace's relay and close its tmux session. With --delete, also
# remove the workspace (both repos and both agx identities).
#
#   ./teardown.sh [--dir <workspace>] [--delete]
set -euo pipefail
WS="${TMPDIR:-/tmp}/two-claudes"
DELETE=0
while [ $# -gt 0 ]; do
	case "$1" in
		--dir) [ $# -ge 2 ] || { echo "--dir needs a path" >&2; exit 2; }; WS="$2"; shift 2 ;;
		--delete) DELETE=1; shift ;;
		-h|--help) sed -n '2,6p' "$0"; exit 0 ;;
		*) echo "unknown option: $1" >&2; exit 2 ;;
	esac
done
REAL="$(cd "$WS" 2>/dev/null && pwd -P)" || { echo "no workspace at $WS" >&2; exit 1; }
[ "$(cat "$REAL/.two-claudes" 2>/dev/null)" = "$REAL" ] || { echo "$WS doesn't look like a two-claudes workspace; nothing to do" >&2; exit 1; }

pid="$(cat "$REAL/relay.pid" 2>/dev/null || true)"
if [ -n "$pid" ] && ps -p "$pid" -o command= 2>/dev/null | grep -q -- 'relay --port' && kill "$pid" 2>/dev/null; then
	echo "relay stopped"
fi
rm -f "$REAL/relay.pid"
tmux kill-session -t "two-claudes-$(printf '%s\n' "$REAL" | cksum | cut -d' ' -f1)" 2>/dev/null || true

if [ "$DELETE" = 1 ]; then
	case "$REAL" in /|"$(cd ~ && pwd -P)") echo "refusing to delete $REAL" >&2; exit 1 ;; esac
	rm -rf "$REAL" && echo "deleted $REAL"
fi
