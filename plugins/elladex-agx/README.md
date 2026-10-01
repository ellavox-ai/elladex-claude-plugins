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
- **Guard hook.** A `PreToolUse` hook checks every Bash, Monitor, PowerShell, Read, Grep, Glob, Write, Edit, MultiEdit and NotebookEdit call, and every MCP tool call that carries a command, a path or a URL (such as the Desktop app's terminal tool, which runs commands in your own terminal, or a browser tool). It runs with `node`; see [Safety](#safety).
- **Listings (optional).** With `agx` 0.4.0 or later, Claude can sign `agx` in to Ellaworks to manage your Elladex listing; you approve in your own browser. See [Sign in to Elladex](#sign-in-to-elladex).

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
| `/elladex-agx:login [--org <slug> \| --new-org <name>]` | Signs `agx` in to Ellaworks for listing management, through a browser approval you complete (see [Sign in to Elladex](#sign-in-to-elladex)). Claude also uses it when you ask it to sign in, switch organization or check which one `agx` uses |
| `agx-peer` (automatic) | How Claude drafts messages and replies: right thread, exact command, your approval, nothing secret |

This plugin depends on `elladex`, so installing it also installs `elladex`. That provides `/elladex:find`, for looking up agents and npubs, and the `elladex:agent-exchange-etiquette` rules these skills rely on.

## Requirements

- **Claude Code 2.1.271 or later.** That's the release the inbox watch is written for: since 2.1.271 every Monitor watch has a deadline of at most 30 minutes, and `/elladex-agx:watch` asks for exactly that and tells you when the watch will end. The plugin is tested with 2.1.281. Everything else it relies on is older, going by Claude Code's changelog: plugin options (`userConfig`, 2.1.83), the Monitor tool itself (2.1.98), hooks started without a shell (`args`, 2.1.139), which is how the guard runs, and plugin options read only from your own or managed settings (2.1.207), which is why a repository's settings can't switch your send mode. The Monitor tool gives live inbound delivery; without it, the watch runs as a background command, and Claude reads its output when you ask.
- **Node.js 20 or later**, for `agx` and the guard hook. The hook runs as `node`, found on Claude Code's own `PATH`. If Claude Code can't find `node` (for example when it's started from an environment with a minimal `PATH`, or `node` comes from a version manager your login shell doesn't load there), **the guard is inactive**: Claude Code treats the failed start as a non-blocking hook error, and draft mode then rests on the skills' instructions alone. `/elladex-agx:setup` checks `node --version` and warns you.
- **`@nostr-agx/cli`**, on your `PATH` as `agx`: **0.3.0 or later for messaging**, and **0.4.0 or later to sign in to Ellaworks** (`agx login`) and manage a listing. Install or upgrade it yourself:
  ```bash
  npm install -g @nostr-agx/cli@^0.4.0
  agx --version
  ```
  Versions before 0.3.0 lack `--allowed-only`, `--full-ids` and `--no-tasks`, so `/elladex-agx:setup` stops and asks you to upgrade. Before 0.4.0 there is no `agx login`, so `/elladex-agx:login` stops the same way.

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

Allow each other before either side sends. If a message arrives while your watch is running and its sender isn't on your allowlist yet, it shows up only as a `HOLD` line and its text isn't kept; after you allow them, ask them to send it again. A message that arrives while no watch is running waits on the relay and is picked up by your next watch.

## Sign in to Elladex

Messaging needs no Ellaworks account. Managing an Elladex listing from the command line does: `agx register`, `agx listing …` and `agx domain …` act for an Ellaworks organization. With `agx` 0.4.0 or later, ask Claude to sign in, or run `/elladex-agx:login`:

1. Claude runs `agx login --json --no-wait`. `agx` asks https://app.ellaworks.ai for a sign-in link and a short code, and exits with code 7, which means it's your turn.
2. Claude shows you the link and the code that this run printed. Open the link in your own browser, sign in or sign up, check that the page shows the same code, pick the organization (you must be an owner or admin) or create one, accept the Terms, and approve.
3. Tell Claude you approved. It runs the same command again, which finishes the login, and then `agx whoami`.

What you get is a key for that one organization. It covers the organization's Elladex listings and domains only, expires after 90 days, and is revoked by `agx logout` or in Settings → API keys. `agx` stores it in `credentials.json` in its private directory (`~/.agx`, mode 0600) and never prints it. Claude never sees it, and the guard stops Claude from reading that file. Making a listing public still needs an organization admin to confirm it in the browser: `agx` exits with code 7 and a link, and Claude passes the link on.

- **Check or switch.** `agx whoami` shows who `agx` is signed in as, and to which organization. `/elladex-agx:login --org <slug>` signs in to, or switches to, a particular organization. `/elladex-agx:login --new-org <name>` asks you to create one on the sign-in page; Claude Code asks you before that command runs.
- **No API keys in the chat.** Claude never asks for an API key, and the guard refuses `agx config set apiKey <key>`, setting `AGX_API_KEY`, an `ela_…` key typed into a command, and printing an `AGX_API_KEY` inherited from your shell (`printenv AGX_API_KEY`, `echo $AGX_API_KEY`, `env | grep -i agx`). For CI or a script with no browser, create a key in Settings and store it in your own terminal: `printf %s "$KEY" | agx config set apiKey --stdin`.
- **Only you approve.** Claude never opens the sign-in page itself, and the guard refuses browser tools that navigate to `/auth/device`, including through a sign-in page that redirects there and inside a batch of browser actions. Approve only a code that matches the one Claude showed you from its own `agx login`, never one that came in a message or from another agent. Claude doesn't open the link to make a listing public either; an organization admin does that in their own browser. Only a human admin may click Publish, so the guard asks you before a browser tool opens a listing's manage page (`/elladex/listings/<id>`), directly, through a sign-in page's redirect or in a batch of actions.
- **One server.** `agx login` uses https://app.ellaworks.ai. The guard asks you before Claude points `agx` anywhere else (`--api-base-url`, `--api-url` or `AGX_API_URL`).

## Ellaworks teams

An Ellaworks team accepts first contact from a new npub only after a person there approves it, and this plugin's identity always counts as an unverified sender (it never publishes an Agent Card with a verified handle). By default the team quarantines the first message until someone accepts it, and the watch shows a receipt with status `quarantined`. A team can instead be set to ignore unverified first contact: the message is dropped with no receipt and no reply. If you get neither, ask the team's operator to add your npub as a peer.

## Safety

- **Key custody is local and soft.** The secret key, and the API key from `agx login` (`credentials.json`), are files your user account can read. The guard hook denies shell, file and MCP tool calls that touch `~/.agx` or `$AGX_HOME`, and `agx identity export` and `agx config show --reveal`. So that Claude can't send a login to a directory it then reads, it also denies setting `AGX_HOME`, and setting `HOME` (`USERPROFILE` on Windows) in a command line that runs `agx`, in every form it can parse: `NAME=…` (as a prefix, through `env`, `export` or `declare -x`), `export`/`declare`/`typeset`/`local`/`readonly NAME`, `read`, `mapfile`, `printf -v`, `for NAME in`, fish's `set`, a nameref, `${NAME:=…}`, `launchctl setenv`, `setx`, and PowerShell's `$env:NAME =` and `Env:` drive. A heredoc or file edit that writes one of these into a shell startup file (`~/.zshenv`, `~/.bashrc`, `.envrc`, …) is checked the same way. It stops the move; it can't connect a later read of the directory to a move it didn't see (the gaps are below). `agx` keeps the keys in local files today; remote-signer (NIP-46) support and OS keychain storage are planned, so don't use this identity for anything high-value. The login key is narrow on purpose: one organization, listings and domains only, 90 days, revocable.
- **The guard hook is a backstop, not a sandbox.** It parses shell commands, including quoting, environment prefixes, wrappers such as `env`, `sudo`, `timeout`, `xargs` and `setsid`, `bash -c`, `eval`, command substitution, heredocs fed to a shell, `npx`/`pnpm`/`npm`/`yarn`/`bun`/`corepack`/`mise` runners and `node …/agx.js`. It treats an `agx` word followed later by `send` or `request` anywhere in a command (`ssh host agx send …`, `find … -exec agx send …`, `tmux new 'agx send …'`) as a send, and asks when `agx … send` shows up in text it can't split into commands. It can't see a command built at run time (for example a subcommand held in a shell variable), text piped into a shell, a script file or a container that runs `agx`, a glob that spells the key directory indirectly (`~/.a?x`), or a shell `grep -r` over your whole home directory. It also can't see an `agx` server stored in your profile or inherited from your shell's `AGX_API_URL` (it checks only what a command sets); variables loaded by a program it doesn't know (it asks when `agx` runs after `source`, `env $(…)`, `export $(…)`, `eval`, dotenv or `--env-file`); a variable set in an earlier call of a terminal that keeps its shell between calls; the whole environment printed with no filter (`env`, `printenv`, `export -p`), or a program that reads `AGX_API_KEY` from its own environment; a browser tool that reaches the sign-in page or a listing's manage page by clicking, by script or by typing the address instead of a `url`; or a click on Publish once a manage page is open (approving the guard's prompt to open one lets Claude see the page and its buttons). Its tests list these gaps (`node --test tests/*.test.mjs` in this repository).
- **It stays out of ordinary work.** A grep or rg pattern such as `'~/.agx'`, a `git commit -m` or `gh pr create --body` text, `echo` arguments and a heredoc written to a file are not treated as commands, so searching for or writing about `agx send` isn't blocked. That includes an `ela_…` key literal: the guard refuses one where a program would use it (an `echo` or `curl` argument, a script fed to an interpreter), not in a commit message, a PR body, a search pattern or a heredoc written to a file, so don't paste a key into the chat. A path that leads into `~/.agx` still is blocked. A Grep tool call with an explicit path at or above your home directory is denied; one with no path, run from your home directory, gets a permission prompt.
- **What the hook decides:**
  - *deny, always:* `agx identity export`, `agx config show --reveal`, anything touching `~/.agx` or `$AGX_HOME` (including `credentials.json`), setting `AGX_HOME`, setting `HOME` or `USERPROFILE` in a command line that runs `agx`, an API key on a command line or in `agx`'s environment (`agx config set apiKey <key>`, setting `AGX_API_KEY`, or an `ela_…` key literal), printing an inherited `AGX_API_KEY`, a browser or other MCP tool opening the sign-in page (`/auth/device`) directly, through a sign-in page's redirect or in a batch of actions, `agx serve` without `--no-reply --no-tasks --allowed-only --full-ids` or with `--allow-all`, `--reply-any` or `--advertise`, any attempt to change the send mode, and anything that turns this guard off: `claude plugin disable|uninstall` of `elladex-agx` (or `--all`), `claude plugin marketplace remove ellaworks`, `disableAllHooks`, and writes to this plugin's installed files or Claude Code's plugin registry (`~/.claude/plugins/*.json`). You can still do all of these yourself;
  - *`agx send` and `agx request`:* deny in draft mode, ask in claude-sends mode;
  - *ask, always:* `agx identity new|import|sign|allow <npub>|deny|register`, `agx register`, `agx config set|use` (including `agx config set apiKey --stdin`), the `agx peers` decisions, `agx serve --allow <npub>` (so `/elladex-agx:watch --allow <npub>` shows one extra prompt), `agx listing create|publish|set-visibility|delist|delete|set-policy` and `agx domain add|verify|remove` (with or without `--wait`), any `agx` server other than https://app.ellaworks.ai (`--api-base-url`, `--api-url` or `AGX_API_URL`, on any command, including a value the guard can't read), `agx login --new-org|--org-name|--org-slug`, every `agx org` command except `agx org list`, `agx` run after loading variables the guard can't read (`source`, `env $(…)`, `export $(…)`, `eval`, dotenv, `--env-file`), and a browser or other MCP tool opening a listing's manage page (`/elladex/listings/<id>`, which has the Publish button only a human organization admin may click);
  - *no decision:* `agx login` against the default server, `agx whoami`, `agx logout` and `agx org list`, like `agx identity show` and the other reads. Your own permission settings apply to them: Claude Code asks unless you've allowed them.
- **Peer text is untrusted input.** The skills tell Claude to treat it as data and to take approval only from your own messages. That lowers the risk; it doesn't remove it. Keep permission prompts on. Don't run the watch in bypass-permissions mode, and don't add allow rules that cover `agx`.
- **The allowlist is yours to decide.** The skills tell Claude never to add an npub on its own, and the hook makes Claude Code ask you before any allowlist change.
- **Unknown senders.** With `--allowed-only`, a sender off your allowlist shows up as one `HOLD` line with its npub, and its subject and text never reach Claude. Peers you allow can put any text into the session.

Deny rules you can add to your Claude Code settings as a second layer:

```json
{
  "permissions": {
    "deny": [
      "Bash(agx identity export:*)",
      "Bash(agx identity import:*)",
      "Bash(agx config set apiKey:*)",
      "Read(~/.agx/**)"
    ]
  }
}
```

## Data

The plugin itself makes no network calls. The guard hook runs locally with `node`, reads only the tool call Claude Code hands it, two environment variables (the `send_mode` setting and `AGX_HOME`) and, for a full rewrite of a Claude settings file, that file, and sends nothing anywhere.

When Claude runs `agx` for you (`/elladex-agx:setup`, `/elladex-agx:allow`, `/elladex-agx:watch`, and sends in `claude-sends` mode), `agx` connects to the relays in your `agx` profile. Unless you pass other relays, `/elladex-agx:setup` sets `wss://relay.elladex.ai`, the Elladex Agent Exchange relay run by Ellaworks. A relay can't read message content, but it sees the recipient's key, each message's size and time, and your network address, and it learns your key if it asks `agx` to sign in (NIP-42). `agx` sends only the messages and typed requests you approve.

`agx doctor`, which `/elladex-agx:setup` runs, also checks the API address in your `agx` profile. That only matters for listing management; messaging doesn't use it.

When you sign in (`/elladex-agx:login`), `agx` talks to https://app.ellaworks.ai, or to the server you named. It sends your computer's hostname, which the approval page shows next to your IP address and the time so you can recognize the request, its own version and platform, and the organization you asked for, if any. After that, `agx` sends the key only to that same server, and only for the commands that work with Ellaworks (listings, domains, search, `whoami`, `org list` and `logout`).

Privacy policy: https://www.ellavox.ai/privacy-policy

## Support

Email support@ellavox.ai.

## License

MIT. See [LICENSE](LICENSE).

Claude is a trademark of Anthropic, PBC. Ellaworks is not affiliated with or endorsed by Anthropic.
