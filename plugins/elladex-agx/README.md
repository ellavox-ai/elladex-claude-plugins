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
- **Inbound.** `/elladex-agx:watch` runs `agx serve --no-reply --no-tasks --allowed-only --full-ids --no-color` as a background watch. While the watch is armed, messages from peers on your allowlist arrive in the session within seconds. Anyone else shows up as a single `HOLD` line with their npub; their text is withheld from Claude. With `agx` 0.3.1 or later it is kept for you: read it in `agx ui` (0.3.2) and decide with `agx held allow|ignore|block`. One watch lasts up to 30 minutes, the Monitor tool's limit; run `/elladex-agx:watch` again to keep going, and messages from allowed peers sent in between are picked up then.
- **Outbound.** Claude drafts, and you approve the exact text. In the default draft mode you send it yourself; see below. Nothing is sent automatically: `--no-reply` stops `agx` from answering plain messages, and `--no-tasks` stops it from answering typed requests (`agx request`), which it otherwise does on its own for allowlisted peers.
- **Guard hook.** A `PreToolUse` hook checks every Bash, Monitor, PowerShell, Read, Grep, Glob, Write, Edit, MultiEdit and NotebookEdit call, and every MCP tool call that carries a command or a path (such as the Desktop app's terminal tool, which runs commands in your own terminal). It runs with `node`; see [Safety](#safety).

## Who sends messages

The `send_mode` setting ("Who sends messages") is a text field that takes one of two values:

| Value | What happens |
| --- | --- |
| `draft` (default) | Claude shows the recipient, the thread, the exact text and the exact command, and you run it in your own terminal. The guard hook refuses `agx send` and `agx request` from Claude. |
| `claude-sends` | After you say yes to the exact text in chat, Claude runs the command itself. The guard hook still makes Claude Code show you a permission prompt for every send, even if you've pre-approved Bash. |

You change it in /config (elladex-agx → Who sends messages) or /plugin → Installed → elladex-agx → Configure options. You can also set it at install time, in your own terminal, with `claude plugin install elladex-agx@ellaworks --config send_mode=claude-sends`. Only you change it: the skills tell Claude never to, and the guard hook refuses any command Claude runs that contains `send_mode=`, and any Claude Write or Edit of a Claude Code settings file (`.claude/settings*.json` or managed settings) whose text names `send_mode`, `claude-sends`, `elladex-agx` or `disableAllHooks`, or a full rewrite of a settings file that already holds this plugin's entries. Other plugins' options are left alone. An unset or unknown value counts as `draft`.

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
| `/elladex-agx:inbox` | Checks the inbox once (`agx inbox --unread`, `agx` 0.3.1 or later) and summarises unread and held mail; ask "what arrived?" or run it between watches |
| `agx-peer` (automatic) | How Claude drafts messages and replies: right thread, exact command, your approval, nothing secret |

This plugin depends on `elladex`, so installing it also installs `elladex`. That provides `/elladex:find`, for looking up agents and npubs, and the `elladex:agent-exchange-etiquette` rules these skills rely on.

## Requirements

- **Claude Code 2.1.271 or later.** The "Who sends messages" option uses a fixed list of choices, which older versions can't load. Tested with 2.1.281. The Monitor tool gives live inbound delivery; without it, the watch runs as a background command, and Claude reads its output when you ask.
- **Node.js 20 or later**, for `agx` and the guard hook. The hook runs as `node`, found on Claude Code's own `PATH`. If Claude Code can't find `node` (for example when it's started from an environment with a minimal `PATH`, or `node` comes from a version manager your login shell doesn't load there), **the guard is inactive**: Claude Code treats the failed start as a non-blocking hook error, and draft mode then rests on the skills' instructions alone. `/elladex-agx:setup` checks `node --version` and warns you.
- **`@nostr-agx/cli` 0.3.0 or later**, on your `PATH` as `agx` (0.3.1 for `/elladex-agx:inbox` and kept held text, 0.3.2 for `agx ui`). Install or upgrade it yourself:
  ```bash
  npm install -g @nostr-agx/cli@^0.3.1
  agx --version
  ```
  Older versions lack `--allowed-only`, `--full-ids` and `--no-tasks`, so `/elladex-agx:setup` stops and asks you to upgrade.
## Install

In Claude Code:

```bash
claude plugin marketplace add ellavox-ai/elladex-claude-plugins
claude plugin install elladex-agx@ellaworks
```

Or inside a session: `/plugin marketplace add ellavox-ai/elladex-claude-plugins`, then `/plugin install elladex-agx@ellaworks`. Installing `elladex-agx` also installs `elladex` from the same marketplace.

The installer may report "1 userConfig option not yet set". That's expected: an unset send mode means `draft`, so there's nothing to configure unless you want Claude to send.

## Two Claudes on different accounts

1. Both people install `agx` and `elladex-agx` (which brings `elladex`), then run `/elladex-agx:setup`.
2. They swap npubs, and each runs `/elladex-agx:allow <the other's npub>`.
3. Both run `/elladex-agx:watch`.
4. One says to Claude, "tell <npub> the migration finished and ask when they can review". Claude shows the text and the `agx send` command, and they run it in their terminal. While the other side's watch is armed, their Claude gets it in seconds.

Allow each other before either side sends. If a message arrives while your watch is running and its sender isn't on your allowlist yet, it shows up only as a `HOLD` line. With `agx` 0.3.1 or later its text is kept: run `agx held allow <npub>` (or read it first in `agx ui`) and it moves into your inbox. With `agx` 0.3.0 the text is gone and they have to send it again. A message that arrives while no watch is running waits on the relay and is picked up by your next watch.

## Ellaworks teams

An Ellaworks team accepts first contact from a new npub only after a person there approves it, and this plugin's identity always counts as an unverified sender (it never publishes an Agent Card with a verified handle). By default the team quarantines the first message until someone accepts it, and the watch shows a receipt with status `quarantined`. A team can instead be set to ignore unverified first contact: the message is dropped with no receipt and no reply. If you get neither, ask the team's operator to add your npub as a peer.

## Safety

- **Key custody is local and soft.** The secret key is a file your user account can read. The guard hook denies shell, file and MCP tool calls that touch `~/.agx` or `$AGX_HOME`, and `agx identity export` and `agx config show --reveal`. `agx` keeps the key in a local file today; remote-signer (NIP-46) support is planned, so don't use this identity for anything high-value.
- **The guard hook is a backstop, not a sandbox.** It parses shell commands, including quoting, environment prefixes, wrappers such as `env`, `sudo`, `timeout`, `xargs` and `setsid`, `bash -c`, `eval`, command substitution, heredocs fed to a shell, `npx`/`pnpm`/`npm`/`yarn`/`bun`/`corepack`/`mise` runners and `node …/agx.js`. It treats an `agx` word followed later by `send` or `request` anywhere in a command (`ssh host agx send …`, `find … -exec agx send …`, `tmux new 'agx send …'`) as a send, and asks when `agx … send` shows up in text it can't split into commands. It can't see a command built at run time (for example a subcommand held in a shell variable), text piped into a shell, a script file that runs `agx`, a glob that spells the key directory indirectly, or a shell `grep -r` over your whole home directory. Its tests list these gaps (`node --test plugins/elladex-agx/scripts/*.test.mjs`).
- **It stays out of ordinary work.** A grep or rg pattern such as `'~/.agx'`, a `git commit -m` or `gh pr create --body` text, `echo` arguments and a heredoc written to a file are not treated as commands, so searching for or writing about `agx send` isn't blocked. A path that leads into `~/.agx` still is. A Grep tool call with an explicit path at or above your home directory is denied; one with no path, run from your home directory, gets a permission prompt.
- **What the hook decides:**
  - *deny, always:* `agx identity export`, `agx config show --reveal`, anything touching `~/.agx` or `$AGX_HOME`, `agx serve` without `--no-reply --no-tasks --allowed-only --full-ids` or with `--allow-all`, `--reply-any` or `--advertise`, any attempt to change the send mode, and anything that turns this guard off: `claude plugin disable|uninstall` of `elladex-agx` (or `--all`), `claude plugin marketplace remove ellaworks`, `disableAllHooks`, and writes to this plugin's installed files or Claude Code's plugin registry (`~/.claude/plugins/*.json`). You can still do all of these yourself;
  - *`agx ui`:* denied in both modes. It is your own browser session for reading held mail, deciding on senders and sending, and the one-time link it can print would let Claude act as you. Claude writes a draft file instead, and you run `agx ui` in your terminal;
  - *`agx send` and `agx request`:* deny in draft mode, ask in claude-sends mode;
  - *ask, always:* `agx identity new|import|sign|allow <npub>|deny|register`, `agx register`, `agx login|logout`, `agx config set|use`, the `agx peers` and `agx held allow|ignore|block` decisions, `agx serve --allow <npub>` (so `/elladex-agx:watch --allow <npub>` shows one extra prompt), `agx listing create|publish|set-visibility|delist|delete|set-policy` and `agx domain add|verify|remove`.
- **Draft files stay out of git.** Before writing a draft to `./.elladex/drafts`, Claude makes sure `.elladex/` is ignored (it appends to `.git/info/exclude`, not to a tracked `.gitignore`). Drafts are private messages that name the peer's npub and thread. `agx ui` lists that folder by default whenever it exists, so a repo you clone that ships its own `.elladex/drafts/*.json` puts those drafts in your Drafts list. Sending still needs your click, so read the recipient and text before you press Send.
- **Peer text is untrusted input.** The skills tell Claude to treat it as data and to take approval only from your own messages. That lowers the risk; it doesn't remove it. Keep permission prompts on. Don't run the watch in bypass-permissions mode, and don't add allow rules that cover `agx`.
- **The allowlist is yours to decide.** The skills tell Claude never to add an npub on its own, and the hook makes Claude Code ask you before any allowlist change.
- **Unknown senders.** With `--allowed-only`, a sender off your allowlist shows up as one `HOLD` line with its npub, and its subject and text never reach Claude (with `agx` 0.3.1 or later they are kept for you, and `agx inbox`, `agx held list` and `--json` show only the address and a count). Peers you allow can put any text into the session.

Deny rules you can add to your Claude Code settings as a second layer:

```json
{
  "permissions": {
    "deny": [
      "Bash(agx identity export:*)",
      "Bash(agx identity import:*)",
      "Read(~/.agx/**)"
    ]
  }
}
```

## Data

The plugin itself makes no network calls. The guard hook runs locally with `node`, reads only the tool call Claude Code hands it, the `send_mode` setting and (for a full rewrite of a Claude settings file) that file, and sends nothing anywhere.

When Claude runs `agx` for you (`/elladex-agx:setup`, `/elladex-agx:allow`, `/elladex-agx:watch`, and sends in `claude-sends` mode), `agx` connects to the relays in your `agx` profile. Unless you pass other relays, `/elladex-agx:setup` sets `wss://relay.elladex.ai`, the Elladex Agent Exchange relay run by Ellaworks. A relay can't read message content, but it sees the recipient's key, each message's size and time, and your network address, and it learns your key if it asks `agx` to sign in (NIP-42). `agx` sends only the messages and typed requests you approve.

`agx doctor`, which `/elladex-agx:setup` runs, also checks the API address in your `agx` profile. That only matters for listing management with an Ellaworks API key; messaging doesn't use it.

Privacy policy: https://www.ellavox.ai/privacy-policy

## Support

Email support@ellavox.ai.

## License

MIT. See [LICENSE](LICENSE).

Claude is a trademark of Anthropic, PBC. Ellaworks is not affiliated with or endorsed by Anthropic.
