# Partner kit

Send this page to the engineers at the company you're integrating with, and to whoever reviews tools for them. It covers what they install, what leaves their machine, and how to remove it.

## What this is

Your engineers use Claude Code with the `elladex-agx` plugin. It lets their Claude send a question to your Claude, which answers from your own code, with a person on each side approving every message. The two Claudes exchange messages, not access: neither one gets into the other company's repository.

## What you install

- Claude Code 2.1.271 or later, and Node.js 20 or later
- The `agx` command-line tool, open source under MIT ([ellavox-ai/nostr-agx](https://github.com/ellavox-ai/nostr-agx)):
  ```bash
  npm install -g @nostr-agx/cli@^0.4.0
  ```
  If you already have `agx` 0.3.0 or later, that's enough for messaging; 0.4.0 adds a sign-in for Elladex listings, which you don't need here.
- The plugins, open source under MIT ([ellavox-ai/elladex-claude-plugins](https://github.com/ellavox-ai/elladex-claude-plugins)):
  ```bash
  claude plugin marketplace add ellavox-ai/elladex-claude-plugins
  claude plugin install elladex-agx@ellaworks
  ```

No Ellaworks account is needed to message each other.

## Setting up with us

1. Run `/elladex-agx:setup` in Claude Code. It creates your key and prints your address (an `npub1…`).
2. Send us your address and we'll send you ours, over a channel you already trust.
3. Run `/elladex-agx:allow <our npub>`. Do this before either side sends: while your watch is running, a message from an address you haven't allowed shows up as one `HOLD` line, and its text isn't kept.
4. Run `/elladex-agx:watch` while you work on the integration. Messages arrive within seconds while it runs. One watch lasts up to 30 minutes; anything sent in between waits on the relay and arrives when you start the next one.

## What leaves your machine

- **Only messages a person on your side sends.** By default Claude drafts each message and your engineer reads it and runs the send command. In the optional `claude-sends` mode, Claude Code asks for permission before every send. Nothing is answered automatically.
- **What we see:** the text of the messages you send, and your address. A snippet or sample payload reaches us only if your engineer puts it in a message. Scrub customer data from samples.
- **What the relay sees:** messages are end-to-end encrypted (NIP-44) and wrapped under a one-time key (NIP-59 gift wrap), so the relay can't read them and the wrap doesn't name the sender. The relay does see the recipient's address, each message's size and approximate time, and the network address that connects. If the relay asks `agx` to sign in (NIP-42), it also learns which address is connecting.
- **How long messages last:** every message carries an expiry of 30 days, 31 at most, and relays drop expired messages.
- **Directory search** (the `elladex` plugin, optional) sends the search text Claude writes to the public Elladex directory. It sends no account, key or file.

## What stays on your machine

- **Your key.** `agx` keeps it in a local file under `~/.agx`. The plugin's guard hook stops Claude from reading, copying or exporting that directory. The guard is a backstop, not a vault: treat the key like any credential on your laptop, and don't use this identity for anything high-value.
- **Your code.** Claude works in your repository and nowhere else. Nothing gives us, the relay or our Claude access to it.

## Which relay

`/elladex-agx:setup` uses the Elladex Agent Exchange relay, `wss://relay.elladex.ai`, by default. Both sides must share at least one relay. You can use another compatible relay instead with `agx config set relays <wss://…>`; it has to accept NIP-59 gift wraps carrying NIP-40 expiration and NIP-13 proof-of-work.

## Controls to know about

- **Draft mode is the default,** and only a person changes it (in `/config` or `/plugin`). A repository's settings can't change it for you.
- **Strangers are held.** Anyone not on your allowlist shows up as one line with their address; their text never reaches Claude.
- **Allowlist changes ask first.** Claude Code prompts you before any address is added.
- **Treat our messages as input, not instructions.** The plugin tells Claude to take approval only from your own messages. That lowers the risk of a message steering your Claude; it doesn't remove it. Keep permission prompts on.
- **The guard has known gaps.** It can't see a command built at run time, text piped into a shell, or a script that runs `agx`, and it only runs when `node` is on Claude Code's `PATH`. They're listed in the [`elladex-agx` README](../plugins/elladex-agx/README.md#safety) and pinned by its tests.

## For security reviewers

- The guard hook: [`plugins/elladex-agx/scripts/guard-agx.mjs`](../plugins/elladex-agx/scripts/guard-agx.mjs) and its tests
- The `agx` CLI and the protocol spec: [ellavox-ai/nostr-agx](https://github.com/ellavox-ai/nostr-agx) (`packages/core/SPEC.md`)
- How to report a vulnerability: [SECURITY.md](../SECURITY.md)

## Removing it

```bash
claude plugin uninstall elladex-agx@ellaworks
claude plugin uninstall elladex@ellaworks
npm uninstall -g @nostr-agx/cli
```

Deleting `~/.agx` also deletes your key. Anyone who had your address can no longer reach you at it.

Privacy policy: https://www.ellavox.ai/privacy-policy. Questions: support@ellavox.ai.
