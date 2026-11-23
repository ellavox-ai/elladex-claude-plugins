# Set up a repository for your team

Commit one settings file, and everyone who works in the repository gets the `ellaworks` marketplace and both plugins in Claude Code.

## Add it to your repository

From the repository root, in your shell:

```bash
claude plugin marketplace add ellavox-ai/elladex-claude-plugins --scope project
claude plugin install elladex-agx@ellaworks --scope project
claude plugin install elladex@ellaworks --scope project
git add .claude/settings.json && git commit -m "chore: Elladex plugins for Claude Code"
```

That writes the plugin half of the [`.claude/settings.json`](.claude/settings.json) in this folder. Add the `permissions` block yourself: it's the rules from the [`elladex-agx` README](../../plugins/elladex-agx/README.md#permission-rules), so everyone in the repository gets them. You can also copy the whole file in by hand and merge it with any settings you already have:

```json
{
  "enabledPlugins": {
    "elladex-agx@ellaworks": true,
    "elladex@ellaworks": true
  },
  "extraKnownMarketplaces": {
    "ellaworks": {
      "source": {
        "source": "github",
        "repo": "ellavox-ai/elladex-claude-plugins"
      }
    }
  },
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

When a teammate opens the repository in Claude Code and trusts the folder, Claude Code registers the marketplace for them.

## What each teammate still does

The settings file brings the plugins, not an identity. Each person who wants to message another company:

1. Installs the `agx` CLI: `npm install -g @nostr-agx/cli@^0.3.0`.
2. Runs `/elladex-agx:setup`, which creates their own key and prints their address.

Messaging runs in Claude Code only. Directory search (`elladex`) also works in Claude.ai and Cowork, where each person adds the marketplace under **Customize > Plugins**, or an organization Owner syncs it.

## What a repository can't change

- **The send mode stays each person's choice.** `send_mode` is stored in `pluginConfigs`, which Claude Code reads only from user or managed settings. A committed project file can't switch a teammate to `claude-sends`, so everyone starts in draft mode: Claude drafts, the person sends.
- **A committed `deny` wins.** Claude Code applies a `deny` rule from any settings file, so `Bash(agx send:*)` and `Bash(agx request:*)` here keep everyone in this repository in draft mode, whatever their own send mode. Leave those two rules out of this file if teammates may use `claude-sends`; each person then adds them to their own user settings.
- **Review changes to this file.** The plugin ships no hook, so nothing stops a Claude edit that loosens these rules except Claude Code's own prompt before it edits a settings file. Read such an edit before you accept it.

## For a whole company

An administrator can require the marketplace and plugins on every machine through managed settings, with the same `extraKnownMarketplaces` and `enabledPlugins` keys. See Claude Code's [Manage plugins for your organization](https://code.claude.com/docs/en/plugins/org).
