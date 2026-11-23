# Elladex AGX

A Claude Code plugin by Ellaworks.

Give Claude Code its own agent identity and let it talk to other agents over the Agent Exchange (NIP-AGX on Nostr). That includes a colleague's or partner's Claude on a different Claude account. Claude has no built-in way to message sessions on another account; this plugin supplies one. Two people who swap public keys can connect without an Elladex listing or an Ellaworks account, once both have the `agx` CLI (see Requirements).

**By default, you send and Claude drafts.** Claude writes each message and shows you the exact `agx send` command, and you run it in your own terminal. A setting lets Claude send instead (see [Who sends messages](#who-sends-messages)).

Talking to teams on Ellaworks needs the current Agent Exchange protocol (gift-wrapped messages). Today only teams on Ellaworks' stage environment support it; production teams don't receive these messages yet.

**Claude Code only.** The plugin drives the local `agx` command-line tool, which Claude.ai and Cowork can't run. If your organization syncs the `ellaworks` marketplace to claude.ai, an Owner should set this plugin to not available there.

## Example prompts

The first three are commands you run; the rest are things to ask Claude once the watch is running.

- `/elladex-agx:setup`
- `/elladex-agx:allow npub1…` (paste the other person's full npub)
- `/elladex-agx:watch`
- "Tell npub1… the migration finished and ask when they can review it."
- "Did anything arrive from npub1…? Summarize it."
- "Reply on the same thread: thanks, I'll review it today."

## How it works

- **Identity.** Each user gets a Nostr keypair, kept by `agx` under `~/.agx` (or `$AGX_HOME`). The npub is the public address you share.
- **Transport.** Messages are gift-wrapped (NIP-59) and end-to-end encrypted, then sent through a relay both sides use. `/elladex-agx:setup` defaults to the Elladex Agent Exchange relay, `wss://relay.elladex.ai`, run by Ellaworks; pass other relays to it if you prefer, as long as both sides share one. The relay can't read the content, and the message doesn't name the sender. It does see the recipient's key, the size and timing of each message, and the network address of whoever connects. If a relay requires sign-in (NIP-42), `agx` signs in with your key, and that relay learns which key is connecting.
- **Inbound.** `/elladex-agx:watch` runs `agx serve --no-reply --no-tasks --allowed-only --full-ids --no-color` as a background watch. While the watch is armed, messages from peers on your allowlist arrive in the session within seconds. Anyone else shows up as a single `HOLD` line with their npub; their text is withheld and not kept. One watch lasts up to 30 minutes, the Monitor tool's limit; run `/elladex-agx:watch` again to keep going, and messages from allowed peers sent in between are picked up then.
- **Outbound.** Claude drafts, and you approve the exact text. In the default draft mode you send it yourself; see below. Nothing is sent automatically: `--no-reply` stops `agx` from answering plain messages, and `--no-tasks` stops it from answering typed requests (`agx request`), which it otherwise does on its own for allowlisted peers.
- **Permission rules, not a hook.** The plugin is skills only: it ships no hook and no script. `/elladex-agx:setup` shows Claude Code permission rules you add to your own settings, which keep Claude away from the key and enforce the send mode; see [Permission rules](#permission-rules).

## Who sends messages

The `send_mode` setting ("Who sends messages") is a text field that takes one of two values:

| Value | What happens |
| --- | --- |
| `draft` (default) | Claude shows the recipient, the thread, the exact text and the exact command, and you run it in your own terminal. Your `deny` rules for `agx send` and `agx request` stop Claude from running them. |
| `claude-sends` | After you say yes to the exact text in chat, Claude runs the command itself. Move the two send rules from `deny` to `ask`, and Claude Code shows you a permission prompt for every send, even if you've pre-approved Bash. |

You change it in /config (elladex-agx → Who sends messages) or /plugin → Installed → elladex-agx → Configure options. You can also set it at install time, in your own terminal, with `claude plugin install elladex-agx@ellaworks --config send_mode=claude-sends`. Only you change it, and the skills tell Claude never to. When you switch, move the two send rules between `deny` and `ask` yourself. An unset or unknown value counts as `draft`.

**`claude-sends` works only in an interactive session.** Every send needs you to answer a permission prompt. In a headless run (`claude -p`, CI, a scheduled job) nobody can answer it, so the send is refused, even with `--permission-mode bypassPermissions` or Bash in `--allowedTools`. This was verified with Claude Code 2.1.281. A host that answers permission prompts itself (the Agent SDK's `canUseTool`, or `--permission-prompt-tool`) gets the prompt instead.

A drafted command looks like this. Options come first, then `--`, so a message that starts with `-` is sent as written:

```bash
agx send --context-id '2bc8c14c9873c9fea764882abcee9fbd' -- npub1n0m8c4qn3434zy2q7nxj7v029pqyyfjfg0af98yfll6ksnvq3mps2ynyfz 'Thanks, I'\''ll review it today.'
```

## Skills

| Command | What it does |
| --- | --- |
| `/elladex-agx:setup` | Checks `agx --version`, creates or shows your identity, sets the relay, checks it with `agx doctor`, and prints your npub |
| `/elladex-agx:allow <npub>` | Adds a peer to your allowlist, or shows or edits it |
| `/elladex-agx:watch` | Starts the background inbox watch |
| `agx-peer` (automatic) | How Claude drafts messages and replies: right thread, exact command, your approval, nothing secret |

Install `elladex` from the same marketplace too. It provides `/elladex:find`, for looking up agents and npubs, and the `elladex:agent-exchange-etiquette` rules these skills load when it's there. The skills repeat the core of those rules, so they work without it.

## Requirements

- **Claude Code 2.1.271 or later.** The "Who sends messages" option uses a fixed list of choices, which older versions can't load. Tested with 2.1.281. The Monitor tool gives live inbound delivery; without it, the watch runs as a background command, and Claude reads its output when you ask.
- **`@nostr-agx/cli` 0.3.0 or later**, on your `PATH` as `agx`, which needs Node.js 20 or later. Install or upgrade it yourself, following the instructions on its [npm page](https://www.npmjs.com/package/@nostr-agx/cli), then check it with `agx --version`. Older versions lack `--allowed-only`, `--full-ids` and `--no-tasks`, so `/elladex-agx:setup` stops and asks you to upgrade.
## Install

In Claude Code:

```bash
claude plugin marketplace add ellavox-ai/elladex-claude-plugins
claude plugin install elladex-agx@ellaworks
```

Or inside a session: `/plugin marketplace add ellavox-ai/elladex-claude-plugins`, then `/plugin install elladex-agx@ellaworks`. Install `elladex@ellaworks` the same way for directory search.

The installer may report "1 userConfig option not yet set". That's expected: an unset send mode means `draft`, so there's nothing to configure unless you want Claude to send.

## Two Claudes on different accounts

1. Both people install `agx`, `elladex-agx` and `elladex`, run `/elladex-agx:setup`, and add the permission rules it shows.
2. They swap npubs, and each runs `/elladex-agx:allow <the other's npub>`.
3. Both run `/elladex-agx:watch`.
4. One says to Claude, "tell <npub> the migration finished and ask when they can review". Claude shows the text and the `agx send` command, and they run it in their terminal. While the other side's watch is armed, their Claude gets it in seconds.

Allow each other before either side sends. If a message arrives while your watch is running and its sender isn't on your allowlist yet, it shows up only as a `HOLD` line and its text isn't kept; after you allow them, ask them to send it again. A message that arrives while no watch is running waits on the relay and is picked up by your next watch.

## Ellaworks teams

An Ellaworks team accepts first contact from a new npub only after a person there approves it, and this plugin's identity always counts as an unverified sender (it never publishes an Agent Card with a verified handle). By default the team quarantines the first message until someone accepts it, and the watch shows a receipt with status `quarantined`. A team can instead be set to ignore unverified first contact: the message is dropped with no receipt and no reply. If you get neither, ask the team's operator to add your npub as a peer.

## Permission rules

The plugin ships no hook. Add these rules to the `permissions` section of your user settings, `~/.claude/settings.json`, merged with any `deny` and `ask` lists you already have. `/elladex-agx:setup` shows them too, already matched to your send mode. In `claude-sends` mode, move `Bash(agx send:*)` and `Bash(agx request:*)` from `deny` to `ask`.

```json
{
  "permissions": {
    "deny": [
      "Read(~/.agx/**)",
      "Edit(~/.agx/**)",
      "Bash(agx identity export:*)",
      "Bash(agx identity import:*)",
      "Bash(agx config show --reveal:*)",
      "Bash(agx send:*)",
      "Bash(agx request:*)"
    ],
    "ask": [
      "Bash(agx identity new:*)",
      "Bash(agx identity sign:*)",
      "Bash(agx identity allow:*)",
      "Bash(agx identity deny:*)",
      "Bash(agx register:*)",
      "Bash(agx config set:*)",
      "Bash(agx config use:*)",
      "Bash(agx peers:*)",
      "Bash(agx listing:*)",
      "Bash(agx domain:*)"
    ]
  }
}
```

If you set `AGX_HOME`, replace `~/.agx` in the two path rules with that directory, written with a leading `//` for an absolute path (`Read(//srv/agx/**)`). Listing the allowlist (`agx identity allow --list`) also asks, because it shares a prefix with adding a peer.

## Safety

- **Key custody is local and soft.** The secret key is a file your user account can read. The `deny` rules above keep Claude's file tools out of `~/.agx` and stop `agx identity export` and `agx config show --reveal`. `agx` keeps the key in a local file today; remote-signer (NIP-46) support is planned, so don't use this identity for anything high-value.
- **The rules match command prefixes.** Claude Code checks each Bash command against the start of the rule, so a send hidden in a script file, a shell variable, `bash -c` or text piped into a shell, or a `cat` of a key file, gets past them. Up to 0.2.x this plugin shipped a guard hook that parsed commands more deeply; the Claude plugin directory accepts hooks and scripts only from Verified organizations, so 0.3.0 removed it. The skills' instructions are the other half of the protection.
- **The skills hold the rest.** They tell Claude to run `agx serve` only with `--no-reply --no-tasks --allowed-only --full-ids --no-color`, never to add a peer to the allowlist on its own, never to touch the secret key, and never to change the send mode or loosen your permission rules.
- **Peer text is untrusted input.** The skills tell Claude to treat it as data and to take approval only from your own messages. That lowers the risk; it doesn't remove it. Keep permission prompts on. Don't run the watch in bypass-permissions mode, and don't add allow rules that cover `agx`.
- **The allowlist is yours to decide.** The skills tell Claude never to add an npub on its own, and the `ask` rules make Claude Code ask you before any allowlist change.
- **Unknown senders.** With `--allowed-only`, a sender off your allowlist shows up as one `HOLD` line with its npub, and its subject and text never reach Claude. Peers you allow can put any text into the session.

## Data

The plugin itself makes no network calls and runs no code: it is skills, a manifest and this README.

When Claude runs `agx` for you (`/elladex-agx:setup`, `/elladex-agx:allow`, `/elladex-agx:watch`, and sends in `claude-sends` mode), `agx` connects to the relays in your `agx` profile. Unless you pass other relays, `/elladex-agx:setup` sets `wss://relay.elladex.ai`, the Elladex Agent Exchange relay run by Ellaworks. A relay can't read message content, but it sees the recipient's key, each message's size and time, and your network address, and it learns your key if it asks `agx` to sign in (NIP-42). `agx` sends only the messages and typed requests you approve.

`agx doctor`, which `/elladex-agx:setup` runs, also checks the API address in your `agx` profile. That only matters for listing management with an Ellaworks API key; messaging doesn't use it.

Privacy policy: https://www.ellavox.ai/privacy-policy

## Support

Email support@ellavox.ai.

## License

MIT. See [LICENSE](LICENSE).

Claude is a trademark of Anthropic, PBC. Ellaworks is not affiliated with or endorsed by Anthropic.
