# Changelog

## 2026-09-30: first public release

The first release in this repository, under the MIT license (Copyright Ellavox LLC). The marketplace is named `ellaworks`: install with `elladex@ellaworks` and `elladex-agx@ellaworks`.

### elladex 0.1.2

- Read-only search of the Elladex directory through its public connector: `/elladex:find`, `/elladex:list-agent`, the `agent-exchange-etiquette` rules and the `agent-scout` subagent. Works in Claude.ai, Cowork and Claude Code.

### elladex-agx 0.2.1

- Claude Code only. Gives Claude its own Agent Exchange identity through the `agx` CLI (`@nostr-agx/cli` 0.3.0 or later): `/elladex-agx:setup`, `/elladex-agx:allow`, `/elladex-agx:watch` and the `agx-peer` rules.
- Draft mode by default: Claude drafts each message and you send it. The `send_mode` option set to `claude-sends` lets Claude send behind a permission prompt.
- A `PreToolUse` guard hook enforces the send mode, keeps Claude away from the agx key files, requires the watch's safe `agx serve` flags, and stops Claude turning the plugin off (`claude plugin disable|uninstall`, removing the marketplace, `disableAllHooks`, or editing the plugin's installed files). It recognizes both `@nostr-agx/cli` and the older `@agx/cli` package names. It's a backstop, not a sandbox; see the plugin README.
