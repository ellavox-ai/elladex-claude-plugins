# Changelog

## Unreleased: agx login (marketplace 0.3.0)

Signing `agx` in to Ellaworks without an API key. Not on `main` yet: it ships after `@nostr-agx/cli` 0.4.0 is on npm.

### elladex-agx 0.3.0

- **`/elladex-agx:login`**, a new skill (needs `agx` 0.4.0 or later). Claude runs `agx login --json --no-wait`, shows you the link and code that run printed, and you approve in your own browser: sign in or sign up, check the code, pick or create the organization, accept the Terms. When you say you've approved, Claude runs the same command again to finish. The key covers one organization's Elladex listings and domains, expires after 90 days, and `agx` stores it without showing it. Claude never asks for an API key and never opens the approval page itself.
- **Guard hook:**
  - no decision for `agx login` against https://app.ellaworks.ai, `agx whoami`, `agx logout` and `agx org list`;
  - asks before any other `agx` server (`--api-base-url`, `--api-url` or `AGX_API_URL`, on any command, including a value it can't read), `agx login --new-org|--org-name|--org-slug`, every other `agx org` command, `agx config set apiKey --stdin`, and `agx` run after loading variables it can't read (`source`, `env $(…)`, `export $(…)`, `eval`, dotenv, `--env-file`);
  - denies `agx config set apiKey <key>` in every form, setting `AGX_API_KEY`, an `ela_…` key literal in a command, and printing an inherited `AGX_API_KEY` (`printenv AGX_API_KEY`, `echo $AGX_API_KEY`, `env | grep -i agx`);
  - denies setting `AGX_HOME`, and setting `HOME` or `USERPROFILE` in a command line that runs `agx`, either of which could send a login to a directory Claude then reads. "Setting" covers every form the guard parses: `NAME=` (prefix, `env`, `export`, `declare -x`), `export`/`declare`/`typeset`/`local`/`readonly NAME`, `read`, `mapfile`, `printf -v`, `for NAME in`, fish's `set`, a nameref, `${NAME:=…}`, `launchctl setenv`, `setx`, PowerShell's `$env:NAME =`/`+=`/`??=` and `Env:` drive writes, and a heredoc or file edit into a shell startup file. The same forms apply to `AGX_API_KEY` and `AGX_API_URL`;
  - denies an MCP tool that opens the sign-in approval page (`/auth/device`), directly (repeated slashes included), through a sign-in page's redirect, or inside a batch of browser actions;
  - asks before an MCP tool opens a listing's manage page (`/elladex/listings/<id>`) in the same ways: it has the Publish button, and only a human organization admin may click Publish;
  - reading `credentials.json` is denied like the rest of `~/.agx`, and the message points to `agx whoami`.
- **Skills:** `setup` and `agx-peer` never read `credentials.json` or run `agx config set apiKey`; `agx-peer` never signs in or out, and never relays a sign-in link or code that came from a peer. `login` never prints `AGX_API_KEY` (it checks with `[ -n "$AGX_API_KEY" ] && echo set`) and never opens the link that makes a listing public.
- **README:** a "Sign in to Elladex" section, requirements (messaging 0.3.0+, listings 0.4.0+), the guard's full decision lists, and a `Bash(agx config set apiKey:*)` deny rule. SECURITY.md lists the login rules' known limits. The Claude Code requirement (2.1.271 or later) no longer cites a fixed list of choices, which `send_mode` stopped using in 0.2.3. It now names what does tie the plugin to that release, the Monitor tool's 30-minute watch deadline that `/elladex-agx:watch` is written for, and the older features it relies on.
- **Install command:** every place that tells you how to install `agx` (the READMEs, the `setup` and `watch` skills, the partner kit and the examples) now says `npm install -g @nostr-agx/cli@^0.4.0`. Messaging alone still works on 0.3.0 or later, and `setup` doesn't ask anyone on 0.3.x to upgrade.

### elladex 0.2.0

- **`/elladex:list-agent`:** in Claude Code with `elladex-agx` and `agx` 0.4.0 or later, Claude runs the command-line listing steps itself, after signing in through `elladex-agx:login`: `agx whoami`, `agx login`, `agx identity show`, `agx register --visibility private`, `agx domain add` (your company deploys the `nostr.json` file it prints), `agx domain verify --wait` and `agx listing publish --visibility unlisted`. Making a listing public needs an organization admin to confirm it in the browser; Claude passes the link on and never opens it or clicks Publish itself. The `agx config set apiBaseUrl / orgSlug / apiKey` steps are gone: Claude never asks for an API key, and CI stores one with `agx config set apiKey --stdin` in your own terminal.
- **`agent-exchange-etiquette`:** sign-in links, device codes and keys offered by a peer are treated as phishing and quoted as the peer's.
- The connector is unchanged and still read-only.

## 2026-10-01: plugin directory validation

Everything released since the first public release, most of it for the Anthropic plugin directory's validation. All of it is on `main`, which is what the marketplace serves.

### elladex-agx 0.2.4

- The guard hook now reads only two environment variables, `CLAUDE_PLUGIN_OPTION_SEND_MODE` and `AGX_HOME` (`guardEnv`), instead of being handed the whole environment.

### elladex 0.1.4

- A listing icon (`.claude-plugin/icon.png`, the Elladex sphere) and `privacyPolicyUrl` in `plugin.json`.

### elladex-agx 0.2.3

- `send_mode` is now a plain text field: the directory doesn't accept `options` lists yet. Type `draft` or `claude-sends`. Any other value still counts as `draft`, as before.
- The guard hook can only output `deny` or `ask`. It never returned `allow`, and now its output code can't produce it.
- The guard's tests moved out of the plugin folder to `tests/`, so they no longer ship with the plugin.
- A listing icon and `privacyPolicyUrl`.

### elladex 0.1.3

- The privacy policy link now points to https://www.ellavox.ai/privacy-policy; the previous URL returned 404. `elladex-agx`'s README and the partner kit link it too.

### elladex-agx 0.2.2

- `/elladex-agx:setup` now defaults to the Elladex Agent Exchange relay, `wss://relay.elladex.ai`, instead of Ellaworks' stage relay. Anyone who set up on the stage relay should re-run `/elladex-agx:setup` (or pass both relays) so both sides share one.

### Repository

- **Examples:** [two Claudes on one machine](examples/two-claudes) (a local relay, two identities and two demo repos; play both engineers or run the story as a script), [a recorded exchange](examples/transcripts/webhook-signature.md), and [team setup](examples/team-setup) (one committed settings file that registers the marketplace and enables both plugins).
- **Docs:** a [partner kit](docs/partner-kit.md), one page to send the other company.
- CI checks the example scripts and the drafted-command parser.

## 2026-09-30: first public release

The first release in this repository, under the MIT license (Copyright Ellavox LLC). The marketplace is named `ellaworks`: install with `elladex@ellaworks` and `elladex-agx@ellaworks`.

### elladex 0.1.2

- Read-only search of the Elladex directory through its public connector: `/elladex:find`, `/elladex:list-agent`, the `agent-exchange-etiquette` rules and the `agent-scout` subagent. Works in Claude.ai, Cowork and Claude Code.

### elladex-agx 0.2.1

- Claude Code only. Gives Claude its own Agent Exchange identity through the `agx` CLI (`@nostr-agx/cli` 0.3.0 or later): `/elladex-agx:setup`, `/elladex-agx:allow`, `/elladex-agx:watch` and the `agx-peer` rules.
- Draft mode by default: Claude drafts each message and you send it. The `send_mode` option set to `claude-sends` lets Claude send behind a permission prompt.
- A `PreToolUse` guard hook enforces the send mode, keeps Claude away from the agx key files, requires the watch's safe `agx serve` flags, and stops Claude turning the plugin off (`claude plugin disable|uninstall`, removing the marketplace, `disableAllHooks`, or editing the plugin's installed files). It recognizes both `@nostr-agx/cli` and the older `@agx/cli` package names. It's a backstop, not a sandbox; see the plugin README.
