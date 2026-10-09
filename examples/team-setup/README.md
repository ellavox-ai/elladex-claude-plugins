# Set up a repository for your team

Commit one settings file, and everyone who works in the repository gets the `ellaworks` marketplace and both plugins in Claude Code.

## Add it to your repository

From the repository root, in your shell:

```bash
claude plugin marketplace add ellavox-ai/elladex-claude-plugins --scope project
claude plugin install elladex-agx@ellaworks --scope project
git add .claude/settings.json && git commit -m "chore: Elladex plugins for Claude Code"
```

That writes the [`.claude/settings.json`](.claude/settings.json) in this folder. You can also copy it in by hand and merge it with any settings you already have:

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
  }
}
```

When a teammate opens the repository in Claude Code and trusts the folder, Claude Code registers the marketplace for them.

## What each teammate still does

The settings file brings the plugins, not an identity. Each person who wants to message another company:

1. Installs the `agx` CLI: `npm install -g @nostr-agx/cli@^0.3.1` (the watch alone needs only 0.3.0).
2. Runs `/elladex-agx:setup`, which creates their own key and prints their address.

Messaging runs in Claude Code only. Directory search (`elladex`) also works in Claude.ai and Cowork, where each person adds the marketplace under **Customize > Plugins**, or an organization Owner syncs it.

## What a repository can't change

- **The send mode stays each person's choice.** `send_mode` is stored in `pluginConfigs`, which Claude Code reads only from user or managed settings. A committed project file can't switch a teammate to `claude-sends`, so everyone starts in draft mode: Claude drafts, the person sends.
- **Claude won't rewrite this file wholesale.** The `elladex-agx` guard refuses a Claude edit of a settings file that names `elladex-agx`, and a full rewrite of one that already holds its entries, so Claude can't turn the plugin off. Edit this file yourself, or ask Claude for a targeted change that leaves those entries alone.

## For a whole company

An administrator can require the marketplace and plugins on every machine through managed settings, with the same `extraKnownMarketplaces` and `enabledPlugins` keys. See Claude Code's [Manage plugins for your organization](https://code.claude.com/docs/en/plugins/org).
