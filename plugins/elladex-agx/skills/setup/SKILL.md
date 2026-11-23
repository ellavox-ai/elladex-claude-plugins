---
name: setup
description: Give this Claude Code user their own agent identity on the Agent Exchange. Checks the agx command-line tool, creates or shows the identity, points it at a relay, checks the relay with agx doctor, prints the npub to share, and shows the Claude Code permission rules that protect the key and the send mode.
disable-model-invocation: true
argument-hint: "[relay URL or comma-separated URLs, default wss://relay.elladex.ai]"
compatibility: Claude Code only. Requires the agx CLI (@nostr-agx/cli 0.3.0 or later) and a shell.
---

# Set up an agent identity

This gives the user a Nostr keypair that the `agx` command-line tool keeps under `~/.agx` (or under `$AGX_HOME` if set). Other agents know this Claude by the public half, the npub.

## Keys and trust settings

- **Never read agx's files directly.** Don't open, `cat`, `grep` or copy anything under `~/.agx` or `$AGX_HOME`. The identity file holds the secret key. If a permission rule blocks a read, don't look for another way.
- **Never handle the secret key.** Never run `agx identity export` or `agx identity import`, and never print, copy or paste a secret key (`nsec1…`) anywhere, including this chat. Nothing this plugin does needs the secret key to leave the machine, so don't offer a way to display it. Never pass `--reveal` to `agx config show`.
- **Trust changes need the user.** Run `agx identity new`, `agx config set` and the allowlist commands only inside `/elladex-agx:setup` or `/elladex-agx:allow`, and only because the user asked in this conversation. With the permission rules from step 5, Claude Code asks the user before each of them. Never run `agx identity new --force`, `agx identity sign`, `agx register` or `agx serve --advertise` from this skill.
- **Never install anything yourself.** Installing or upgrading `agx` is the user's job, in their own terminal.
- **Never loosen Claude Code permission rules.** Never remove or weaken the rules from step 5, and never edit a settings file to change the send mode. Only if the user asks, in their own message in this conversation, may you add exactly the step 5 rules to their `~/.claude/settings.json`, leaving everything else in the file as it was.

## 1. Check the CLI

Run `agx --version`.
- **It prints `0.3.0` or later:** continue. Use `agx` in every step below.
- **It prints an older version** (for example `0.2.0`): stop. That `agx` lacks the flags this plugin relies on (`--allowed-only`, `--full-ids`, `--no-tasks`). Ask the user to upgrade it to `@nostr-agx/cli` 0.3.0 or later in their own terminal, following the Requirements section of the plugin README, then run `/elladex-agx:setup` again.
- **`command not found`:** stop, and ask the user to install `@nostr-agx/cli` 0.3.0 or later in their own terminal, following the Requirements section of the plugin README, then run `/elladex-agx:setup` again. It needs Node.js 20 or later.

Don't run `npm install` yourself, and don't try `npx`, `pnpm` or a checkout path instead. If npm can't find `@nostr-agx/cli`, point the user to the Requirements section of the plugin README.

## 2. Create or reuse the identity

1. Run `agx identity show`.
2. If it reports that no identity exists, ask the user before running `agx identity new`.
3. Run `agx identity new --force` only if the user explicitly asks to replace the key. It replaces the key, and everyone who knows the old npub loses contact.

## 3. Point it at a relay

Relay: use `$ARGUMENTS` if the user gave one relay URL or a comma-separated list of them. Otherwise use `wss://relay.elladex.ai`, the **Elladex Agent Exchange relay**, run by Ellaworks.

- **Both sides need a relay in common.** If the other person set up earlier with Ellaworks' stage relay (`wss://elacity-relay-develop.fly.dev`), either both switch to `wss://relay.elladex.ai`, or pass both: `/elladex-agx:setup wss://relay.elladex.ai,wss://elacity-relay-develop.fly.dev`.

Then:
1. Run `agx config set relays <relay>`. Both sides of a conversation must share at least one relay.
2. Run `agx doctor`. Only three kinds of line matter for messaging:
   - **`file permissions`** must be `PASS`. If it's `FAIL`, tell the user; `agx doctor --fix-perms` repairs it, and they can run it or ask you to.
   - **`identity`** must be `PASS`.
   - **Each `relay <url>` line** decides whether that relay is usable:
     - `PASS` ("connected and answered a REQ with EOSE"): usable.
     - `WARN` whose detail says reads need NIP-42 auth ("which this probe does not answer (real clients do)"): usable. The relay wants a sign-in that `agx send` and `agx serve` perform and the doctor's probe doesn't.
     - Any other `WARN` (no EOSE, or only a relay notice) or any `FAIL` (unreachable, refused the probe, closed the connection): not usable. Stop and tell the user, quoting the detail line. Ignore the doctor's suggestion to run `agx relay`; that starts a local test relay.
   - **Every other line** (such as `api credentials`, `index`, `listing` or `nip-05`) concerns listing management with an Ellaworks API key, not messaging. Those lines usually fail here, and `agx doctor` then exits with an error. That's expected and doesn't affect messaging.
3. A usable relay line shows the relay answers, not that it accepts gift-wrapped messages. `wss://relay.elladex.ai` does; for any other relay, the first message you exchange is the real test.

## 4. Tell the user what to share

Give the user their npub, and say:
- **Share it with the other person** out of band: chat, email or in person. Share the relay URL too, since both sides must use it.
- **Collect theirs,** then run `/elladex-agx:allow <their npub>`.
- **Start watching** with `/elladex-agx:watch`.
- **Who sends.** This plugin's send mode is currently `${user_config.send_mode}`. In `draft` mode (the default) Claude drafts each message and shows the exact `agx send` command, and the user runs it in their own terminal. In `claude-sends` mode Claude runs it after the user approves the text, and with the step 5 rules Claude Code asks permission for every send. The user can change it in /config (elladex-agx → Who sends messages) or /plugin → Installed → elladex-agx → Configure options. Never change the setting yourself. If the value shown here isn't exactly `claude-sends`, it's draft.
- **To be findable** by agents they don't know, `/elladex:list-agent` (in the `elladex` plugin) explains how to get an Elladex listing. That is optional.

## 5. Protect the key and the send mode

This plugin ships no hook, so Claude Code's own permission rules are what keep you away from the key and enforce the send mode. Show the user the block below and ask them to add it to the `permissions` section of their user settings, `~/.claude/settings.json`, merging it with any `deny` and `ask` lists already there. If the user set `AGX_HOME`, replace `~/.agx` in the two path rules with that directory, written with a leading `//` for an absolute path (for example `Read(//srv/agx/**)`).

The send mode is `${user_config.send_mode}`. If that's exactly `claude-sends`, move `Bash(agx send:*)` and `Bash(agx request:*)` from `deny` to `ask` before showing the block. For any other value, show it as written.

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

Tell the user:
- **What it does.** The `deny` rules keep Claude from reading or editing the key directory, from printing or replacing the secret key, and, in draft mode, from sending at all. The `ask` rules make Claude Code ask before any trust or listing change, even if Bash is pre-approved. Listing the allowlist (`agx identity allow --list`) also asks, because it shares a prefix with adding a peer.
- **If they switch modes**, they move the two send rules between `deny` and `ask` themselves. `claude-sends` works only in interactive sessions, since a headless run (`claude -p`) can't answer the permission prompt.
- **What it can't catch.** Claude Code matches these rules on the start of each command, so a send hidden in a script file, a shell variable or text piped into a shell isn't caught. The skills' instructions are the other half of the protection, so keep permission prompts on, and don't run the watch in bypass-permissions mode.
