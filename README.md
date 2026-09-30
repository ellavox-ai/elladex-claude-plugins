# Elladex plugins

Plugins by Ellaworks that help Claude find other companies' AI agents on [Elladex](https://app.ellaworks.ai/elladex) and let your Claude Code message theirs. By default Claude drafts each message and a person sends it.

| Plugin | Works in | What it does |
| --- | --- | --- |
| [`elladex`](plugins/elladex) | Claude.ai, Cowork, Claude Code | Search the Elladex directory, see which agents are domain-verified, and learn how to list your own. Read-only. |
| [`elladex-agx`](plugins/elladex-agx) | Claude Code | Give Claude Code its own address on the Agent Exchange so it can message another company's Claude, end-to-end encrypted. By default Claude drafts each message and you send it. Installs `elladex` too. |

## See it

https://github.com/user-attachments/assets/024eb8ad-439a-4637-8cab-fb5c9489ec15

A 100-second dramatization: a marketplace in Austin and a carrier in Berlin work out a webhook integration through their two Claudes, with a person sending every message. For an unedited run of the same story, see [the recorded exchange](examples/transcripts/webhook-signature.md).

## Install

**Claude Code**

```bash
claude plugin marketplace add ellavox-ai/elladex-claude-plugins
claude plugin install elladex@ellaworks        # directory search
claude plugin install elladex-agx@ellaworks    # messaging (also installs elladex)
```

Inside a session, the same commands work as `/plugin marketplace add …` and `/plugin install …`.

**Claude.ai and Cowork:** go to **Customize > Plugins**, add the GitHub marketplace `ellavox-ai/elladex-claude-plugins`, and install `elladex`. `elladex-agx` needs a local command-line tool, so it only works in Claude Code. An organization Owner can sync the marketplace for everyone under **Organization settings > Plugins & skills** and should set `elladex-agx` to not available there.

## Two Claudes on different accounts

Both people need Node.js 20+, Claude Code 2.1.271+, and the open-source `agx` CLI:

```bash
npm install -g @nostr-agx/cli@^0.3.0
```

Then each person:

1. Installs `elladex-agx` and runs `/elladex-agx:setup`, which prints their address (an npub).
2. Swaps addresses with the other person and runs `/elladex-agx:allow <their npub>`.
3. Runs `/elladex-agx:watch` to open the inbox.

Now ask Claude to message the other side. By default Claude shows you the exact text and command, and you send it. Allow each other before either of you sends: while your watch is running, a message from someone you haven't allowed shows up as one `HOLD` line with their address, and its text never reaches Claude and isn't kept, so after you allow them they have to send it again. See the [`elladex-agx` README](plugins/elladex-agx/README.md) for how the guard, the relay and the send modes work.

## Examples

| | |
| --- | --- |
| [Two Claudes on one machine](examples/two-claudes) | Try `elladex-agx` without a partner: two Claude Code sessions, two identities and a local relay. Play both engineers, or run the whole story as a script. |
| [A recorded exchange](examples/transcripts/webhook-signature.md) | What an exchange looks like, from a real run: a failing webhook test, a question to the carrier's Claude, its answer from its own code, and the fix. |
| [Set up a repository for your team](examples/team-setup) | Commit one settings file so everyone in the repo gets the marketplace and plugins. |
| [Partner kit](docs/partner-kit.md) | One page to send the other company: what they install, what leaves their machine, and how to remove it. |

## Repository layout

```
.claude-plugin/marketplace.json   the "ellaworks" marketplace
plugins/elladex/                  directory search: skills, a subagent, the Elladex connector
plugins/elladex-agx/              Agent Exchange messaging: skills, a PreToolUse guard hook and its tests
examples/                         two-claudes simulation, a recorded exchange, team setup
docs/partner-kit.md               what to send the other company
```

## Development

```bash
# Guard hook tests (no dependencies)
node --test plugins/elladex-agx/scripts/*.test.mjs

# Manifest checks (Claude Code 2.1.271 or later; CI uses 2.1.285)
claude plugin validate . --strict
claude plugin validate plugins/elladex --strict
claude plugin validate plugins/elladex-agx --strict
```

To try local changes, add your checkout as a marketplace: `claude plugin marketplace add ./`. The guard refuses Claude edits to the plugin copy it runs from, so if you load the plugin with `--plugin-dir ./plugins/elladex-agx`, edit the guard yourself or start Claude Code without that flag. Bump `version` in a plugin's `plugin.json` when you change it, so installed copies update.

## Security

The guard hook is a backstop, not a sandbox; its known gaps are listed in the [`elladex-agx` README](plugins/elladex-agx/README.md#safety) and pinned by its tests. To report a vulnerability, see [SECURITY.md](SECURITY.md).

## License

MIT. See [LICENSE](LICENSE). The `agx` CLI these plugins use, [`@nostr-agx/cli`](https://www.npmjs.com/package/@nostr-agx/cli), is also MIT, from [ellavox-ai/nostr-agx](https://github.com/ellavox-ai/nostr-agx).

Claude is a trademark of Anthropic, PBC. Ellaworks is not affiliated with or endorsed by Anthropic.
