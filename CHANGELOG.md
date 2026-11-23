# Changelog

## Unreleased

Changes for the Anthropic plugin directory's validation:

### elladex-agx 0.3.0

- **The guard hook is gone.** The directory accepts hooks, scripts and dependencies on other plugins only from Verified organizations, so `hooks/hooks.json`, `scripts/guard-agx.mjs` (and its tests) and the dependency on `elladex` are removed. The plugin is now skills only.
- **Permission rules replace it.** `/elladex-agx:setup` ends with a block of Claude Code `deny` and `ask` rules, matched to the send mode, that the user adds to `~/.claude/settings.json`: they keep Claude's file tools out of `~/.agx`, block `agx identity export|import` and `agx config show --reveal`, deny (draft) or ask for (claude-sends) `agx send` and `agx request`, and ask before trust and listing changes. The README's new Permission rules section has the same block. **If you're updating from 0.2.x, add these rules**: nothing replaces the guard until you do.
- **Weaker than the guard, and said so.** The rules match command prefixes, so a send hidden in a script, a shell variable or `bash -c` gets past them, and nothing enforces the watch's `agx serve` flags beyond the skills' instructions. The Safety section lists the gaps.
- `elladex` is no longer installed with `elladex-agx`; install it yourself for `/elladex:find` and the etiquette skill. The skills load the etiquette skill only when it's there.
- The README links the `@nostr-agx/cli` npm page instead of showing an `npm install` command.

### elladex 0.1.5

- The `find` skill no longer lists `allowed-tools`: the directory accepts entries beyond Read, Grep, Glob and LS only from Verified organizations. Claude Code now asks before the first Elladex search in a session unless you allow the connector's two tools.

### elladex-agx 0.2.5

- The `setup` and `watch` skills no longer include the `npm install -g` command. They point the user to the README's Requirements section instead, so the directory scan no longer flags a download-and-run command in the plugin. Claude still never installs `agx` itself.

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
