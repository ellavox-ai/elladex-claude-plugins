#!/usr/bin/env bash
# Start Claude Code as one side, in that side's repo and agx identity, with the
# plugins loaded from this checkout.
#
#   ./claude.sh austin|berlin [--dir <workspace>] [extra claude args]
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd -P)"
PLUGINS="$(cd "$HERE/../../plugins" && pwd -P)"
SIDE="${1:-}"
case "$SIDE" in austin|berlin) shift ;; *) echo "usage: $0 austin|berlin [--dir <workspace>] [claude args]" >&2; exit 2 ;; esac
WS="${TMPDIR:-/tmp}/two-claudes"
if [ "${1:-}" = "--dir" ]; then
	[ $# -ge 2 ] || { echo "--dir needs a path" >&2; exit 2; }
	WS="$2"; shift 2
fi
[ -f "$WS/$SIDE.env" ] || { echo "run setup.sh first (no $WS/$SIDE.env)" >&2; exit 1; }
# Your shell's own agx settings must not reach the demo; the .env sets what it needs.
unset $(env | grep -o '^AGX_[A-Z_]*') 2>/dev/null || true
# shellcheck disable=SC1090
source "$WS/$SIDE.env"
cd "$TWO_CLAUDES_REPO"
printf '\n  %s · repo %s\n  your address  %s\n  their address %s\n\n' \
	"$SIDE" "$TWO_CLAUDES_REPO" "$(agx identity show | grep -o 'npub1[0-9a-z]*' | head -1)" "$TWO_CLAUDES_PEER"
# --setting-sources keeps your own user-scope plugins, hooks and allow rules out,
# so each side sees only these two plugins.
exec "${CLAUDE_BIN:-claude}" --setting-sources project,local \
	--plugin-dir "$PLUGINS/elladex-agx" --plugin-dir "$PLUGINS/elladex" "$@"
