#!/usr/bin/env bash
# Set up two Claude Code "companies" on one machine: a local relay, two agx
# identities that allow each other, and two demo repos. Everything agx writes
# stays inside the workspace; your own ~/.agx isn't used.
#
#   ./setup.sh [--dir <workspace>] [--port <n>]
#
# Needs Node.js 20+, git, and the agx CLI 0.3.0+ on PATH, or AGX_BIN pointing at
# an agx binary or a built agx.js (for example from ellavox-ai/nostr-agx).
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd -P)"
WS="${TMPDIR:-/tmp}/two-claudes"
PORT=7447
while [ $# -gt 0 ]; do
	case "$1" in
		--dir) [ $# -ge 2 ] || { echo "--dir needs a path" >&2; exit 2; }; WS="$2"; shift 2 ;;
		--port) [ $# -ge 2 ] || { echo "--port needs a number" >&2; exit 2; }; PORT="$2"; shift 2 ;;
		-h|--help) sed -n '2,9p' "$0"; exit 0 ;;
		*) echo "unknown option: $1" >&2; exit 2 ;;
	esac
done
case "$PORT" in ''|*[!0-9]*) echo "--port must be a number from 1 to 65535" >&2; exit 2 ;; esac
{ [ "$PORT" -ge 1 ] && [ "$PORT" -le 65535 ]; } || { echo "--port must be a number from 1 to 65535" >&2; exit 2; }

# ---- agx: resolve to an absolute path before anything is written
AGX_BIN="${AGX_BIN:-$(command -v agx || true)}"
[ -n "$AGX_BIN" ] || { echo "agx not found. Install @nostr-agx/cli 0.3.0+ or set AGX_BIN to an agx binary or agx.js." >&2; exit 1; }
case "$AGX_BIN" in */*) ;; *) AGX_BIN="$(command -v "$AGX_BIN" || true)" ;; esac
[ -f "$AGX_BIN" ] || { echo "AGX_BIN: no such file: $AGX_BIN" >&2; exit 1; }
AGX_BIN="$(cd "$(dirname "$AGX_BIN")" && pwd -P)/$(basename "$AGX_BIN")"
# A shell that sourced a workspace .env finds that workspace's shim first; unwrap it.
if grep -q '^# two-claudes agx shim' "$AGX_BIN" 2>/dev/null; then
	AGX_BIN="$(sed -n 's/^# target: //p' "$AGX_BIN")"
	[ -f "$AGX_BIN" ] || { echo "Open a new shell (this one sourced a two-claudes .env) or set AGX_BIN." >&2; exit 1; }
fi

# ---- the workspace: yours, private, and marked so teardown can recognize it
mkdir -p "$WS"
[ -O "$WS" ] || { echo "$WS exists and isn't owned by you; pick another --dir" >&2; exit 1; }
chmod 700 "$WS"
WS="$(cd "$WS" && pwd -P)"
printf '%s\n' "$WS" > "$WS/.two-claudes"

# ---- a shim in $WS/bin so every step, and both Claudes, use the same agx
mkdir -p "$WS/bin"
case "$AGX_BIN" in
	*.js|*.mjs) printf '#!/usr/bin/env bash\n# two-claudes agx shim\n# target: %s\nexec node %q "$@"\n' "$AGX_BIN" "$AGX_BIN" > "$WS/bin/agx" ;;
	*) printf '#!/usr/bin/env bash\n# two-claudes agx shim\n# target: %s\nexec %q "$@"\n' "$AGX_BIN" "$AGX_BIN" > "$WS/bin/agx" ;;
esac
chmod +x "$WS/bin/agx"
export PATH="$WS/bin:$PATH"
# Your shell's own agx settings (relay, profile, API key) must not reach the demo.
AGX_TARGET="$AGX_BIN"
unset $(env | grep -o '^AGX_[A-Z_]*') 2>/dev/null || true
unset AGX_BIN
# Every agx command below gets its own AGX_HOME inside the workspace; this one
# covers anything that would otherwise fall back to ~/.agx.
export AGX_HOME="$WS/agx/relay/.agx"
mkdir -p "$AGX_HOME"

VERSION="$(agx --version)"
if ! node -e 'const [a,b]=process.argv[1].split(".").map(Number); process.exit(a>0||b>=3?0:1)' "$VERSION"; then
	echo "agx $VERSION is too old: the plugin needs 0.3.0+ (--allowed-only, --full-ids, --no-tasks)." >&2
	exit 1
fi
echo "agx $VERSION ($AGX_TARGET)"

# ---- relay: agx's development relay, on localhost only
RELAY="ws://127.0.0.1:$PORT"
relay_alive() {
	local pid
	pid="$(cat "$WS/relay.pid" 2>/dev/null)" || return 1
	[ -n "$pid" ] && ps -p "$pid" -o command= 2>/dev/null | grep -q -- 'relay --port'
}
if relay_alive; then
	if [ "$(cat "$WS/relay.url" 2>/dev/null)" != "$RELAY" ]; then
		echo "This workspace's relay is already running at $(cat "$WS/relay.url"). Run teardown.sh --dir \"$WS\" first to change the port." >&2
		exit 1
	fi
	echo "relay already running (pid $(cat "$WS/relay.pid"))"
else
	nohup agx relay --port "$PORT" > "$WS/relay.log" 2>&1 &
	echo $! > "$WS/relay.pid"
	trap 'kill "$(cat "$WS/relay.pid")" 2>/dev/null; rm -f "$WS/relay.pid"' ERR
	for _ in 1 2 3 4 5 6 7 8 9 10; do
		grep -q 'listening' "$WS/relay.log" 2>/dev/null && break
		relay_alive || break
		sleep 0.5
	done
	grep -q 'listening' "$WS/relay.log" 2>/dev/null || { cat "$WS/relay.log" >&2; false; }
	echo "relay $RELAY (pid $(cat "$WS/relay.pid"), log $WS/relay.log)"
fi
echo "$RELAY" > "$WS/relay.url"

# ---- two identities. The .agx directory name lets the guard hook recognize
# either side's key files, so neither Claude can read the other side's key.
for side in austin berlin; do
	export AGX_HOME="$WS/agx/$side/.agx"
	mkdir -p "$AGX_HOME"
	agx identity show > /dev/null 2>&1 || agx identity new > /dev/null
	agx config set relays "$RELAY" > /dev/null
	agx identity show | grep -o 'npub1[0-9a-z]*' | head -1 > "$WS/$side.npub"
done
AUSTIN="$(cat "$WS/austin.npub")"
BERLIN="$(cat "$WS/berlin.npub")"
AGX_HOME="$WS/agx/austin/.agx" agx identity allow "$BERLIN" > /dev/null
AGX_HOME="$WS/agx/berlin/.agx" agx identity allow "$AUSTIN" > /dev/null

# ---- two demo repos
for repo in austin-marketplace berlin-carrier; do
	[ -d "$WS/$repo" ] || cp -R "$HERE/templates/$repo" "$WS/$repo"
	mkdir -p "$WS/$repo/fixtures"
done
# A delivery signed exactly the way the carrier's code signs it.
node --input-type=module -e '
import { writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
const { sign } = await import(pathToFileURL(process.argv[1]).href);
const body = "{ \"id\": \"evt_1042\", \"type\": \"shipment.updated\", \"data\": { \"status\": \"in_transit\", \"tracking\": \"CAR123456789DE\" } }";
const ts = 1790000000;
writeFileSync(process.argv[2], JSON.stringify({ receivedAt: ts + 42, headers: { "content-type": "application/json", ...sign(body, ts, "whsec_demo_only") }, body }, null, 2) + "\n");
' "$WS/berlin-carrier/src/webhooks/sign.mjs" "$WS/austin-marketplace/fixtures/delivery.json"
for repo in austin-marketplace berlin-carrier; do
	if ! git -C "$WS/$repo" rev-parse -q --verify HEAD > /dev/null 2>&1; then
		git -C "$WS/$repo" init -q
		git -C "$WS/$repo" add -A
		git -C "$WS/$repo" -c user.name=demo -c user.email=demo@example.com \
			-c commit.gpgsign=false -c core.hooksPath=/dev/null commit -q -m "initial"
	fi
done

# ---- one env file per side
for side in austin berlin; do
	if [ "$side" = austin ]; then repo=austin-marketplace; peer="$BERLIN"; else repo=berlin-carrier; peer="$AUSTIN"; fi
	{
		echo "unset AGX_PROFILE AGX_RELAY AGX_API_URL AGX_API_KEY AGX_ORG AGX_DEBUG"
		printf 'export AGX_HOME=%q\n' "$WS/agx/$side/.agx"
		printf 'export PATH=%q:"$PATH"\n' "$WS/bin"
		printf 'export TWO_CLAUDES_WS=%q\n' "$WS"
		printf 'export TWO_CLAUDES_REPO=%q\n' "$WS/$repo"
		printf 'export TWO_CLAUDES_PEER=%q\n' "$peer"
	} > "$WS/$side.env"
done
trap - ERR

cat <<EOF

Ready in $WS
  austin (marketplace)  $AUSTIN
  berlin (carrier)      $BERLIN
Each side already allows the other and uses the local relay.

Next:
  "$HERE/tmux.sh" --dir "$WS"          two Claude Code panes; you play both engineers
  node "$HERE/story.mjs" --dir "$WS"   a scripted run of the whole story
  "$HERE/teardown.sh" --dir "$WS"      stop the relay (add --delete to remove the workspace)
EOF
