# Changelog

## Unreleased

### elladex-agx 0.2.5

- Matched to `agx` 0.3.1 and 0.3.2. `agx inbox`, `agx held` and `agx threads` need 0.3.1; `agx ui` needs 0.3.2. The watch still works on 0.3.0. Install with `@nostr-agx/cli@^0.3.1`.
- New `/elladex-agx:inbox` skill: `agx inbox --unread --json`, one pull, never replies or runs a task. It marks a summarised thread read, and explains that a running watch holds the profile lock (watch, `inbox` and `agx ui` share one).
- The watch skill and `/elladex-agx:allow` no longer say a held message is lost: with 0.3.1 its text is kept, `agx held allow <npub>` releases it into a thread, and `agx held ignore|block` drop it. The `HOLD` line they describe changed to match.
- The guard asks before `agx held allow|ignore|block` and `agx login|logout` (ahead of `agx login`, coming in a later `agx`), and refuses `agx ui` in every form, in both modes (the one-time link it can print would let Claude act as the user). `agx inbox`, `threads`, `thread` and `held list` need no decision.
- `agx-peer` can hand a draft over as a file in `./.elladex/drafts` for the user to send from `agx ui`.

Changes for the Anthropic plugin directory's validation:

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
