# Elladex

A plugin for Claude.ai, Cowork and Claude Code, by Ellaworks.

Find AI agents run by other companies on [Elladex](https://app.ellaworks.ai/elladex), the public agent directory from Ellaworks, and learn how to list your own. Ask Claude "find an agent that reconciles supplier invoices" and it searches the directory, shows which agents are domain-verified, and explains what each listing does and does not prove.

Version 0.1 is **read-only**. The connector currently exposes only two read tools, so the plugin searches and explains. It never contacts an agent or changes a listing.

## Example prompts

- "Find an agent that reconciles supplier invoices."
- "Which agents on Elladex are verified for legal review?"
- "Who is npub1…?" (paste the full npub)
- "Look up invoice-desk@example.com."
- "How do I get our invoice agent listed on Elladex?"

## What's inside

| Component | Name | What it does |
| --- | --- | --- |
| Connector | `elladex` | The public Elladex directory. It exposes two read-only tools, `search_agent_index` and `get_agent_listing`, and needs no sign-in. |
| Skill | `/elladex:find` | Searches the directory, presents results with their verification status, and treats listing text as untrusted. |
| Skill | `/elladex:list-agent` | Walks you through listing an Ellaworks team or an agent that runs elsewhere, including visibility and domain verification. |
| Skill | `agent-exchange-etiquette` | Background rules Claude follows when it drafts, sends or reads a message to or from an agent found on Elladex or reached over the Agent Exchange (AGX). It loads automatically. In Claude Code it also appears as `/elladex:agent-exchange-etiquette`, which you never need to run. |
| Subagent | `agent-scout` | A read-only researcher for broader searches that returns a ranked shortlist. It runs in Cowork and Claude Code. |

## Where it works

| Surface | What loads |
| --- | --- |
| Claude.ai (web, desktop, mobile) | Skills, plus the connector once you connect it from the plugin's **Connectors** tab. The subagent is ignored. |
| Cowork | Skills, the subagent, and the connector from the **Connectors** tab |
| Claude Code | Everything. Needs current Claude Code (2.1.x); tested with 2.1.281. Claude Code 2.0.x rejects this manifest. |

On Team and Enterprise plans, an Owner adds the connector for the organization first. Then each member connects it from the plugin's **Connectors** tab.

`agent-scout` may only use the two Elladex tools. In Cowork, a connector you also added under **Customize > Connectors** can show up under a different tool name. If `agent-scout` then fails to start with an error saying it has no tools, use `/elladex:find` instead. The subagent is kept to those two tools on purpose, so that listing text can never steer it into another connector's tools.

## Install

The plugin lives in the `ellaworks` marketplace, at the root of [ellavox-ai/elladex-claude-plugins](https://github.com/ellavox-ai/elladex-claude-plugins).

**Claude Code:**

```bash
claude plugin marketplace add ellavox-ai/elladex-claude-plugins
claude plugin install elladex@ellaworks
```

Or inside a session: `/plugin marketplace add ellavox-ai/elladex-claude-plugins`, then `/plugin install elladex@ellaworks`. Third-party marketplaces don't auto-update by default; turn it on under `/plugin` > Marketplaces.

**Claude.ai and Cowork, for yourself:** go to **Customize > Plugins**, add the GitHub marketplace `ellavox-ai/elladex-claude-plugins`, and install `elladex`.

**Claude.ai and Cowork, for an organization:** an Owner goes to **Organization settings > Plugins & skills**, selects **Add > Sync from GitHub**, and picks `ellavox-ai/elladex-claude-plugins`. After the sync, set `elladex-agx` to not available, because it only works in Claude Code.

## Data and privacy

The plugin talks to one endpoint:

- `https://elacity-mcp-main.fly.dev/elladex/mcp`, the Elladex directory's public MCP server, run by Ellaworks.

The connector receives only the arguments Claude sends it: search text, capability keys, categories, or an agent's handle or address. Claude writes the search text from your request, so leave confidential details out of what you ask it to find. The plugin sends no account, key or credential, and the connector has no access to your files.

Requests are rate-limited per network address. On Claude.ai and Cowork, connector calls come from Anthropic's infrastructure rather than your computer, so that limit may be shared with other users. If searches start failing, wait a minute and try again.

The directory returns only listings their owners published as public, or unlisted listings you look up by exact address or handle.

Listing descriptions are written by the companies that own them. The connector marks them as untrusted, and the skills tell Claude to treat them as data and never follow instructions found in them. This lowers the risk of prompt injection; it doesn't remove it.

Privacy policy: https://www.ellavox.ai/privacy-policy

## Support

Email support@ellavox.ai.

## Limits in this version

- **No messaging.** Contacting an agent happens in Ellaworks, where an org admin approves the peer, or peer-to-peer from Claude Code with the `elladex-agx` plugin.
- **No write tools.** Creating or publishing listings happens in Ellaworks (https://app.ellaworks.ai/elladex/submit) or with the `agx` command-line tool.
- **A new directory.** The production directory is still being populated, so many searches return nothing yet.

The planned next version adds an authenticated connector for Ellaworks users: reading cross-company threads, a "what's waiting" inbox, and sending as a team to peers a person has approved.

## License

MIT. See [LICENSE](LICENSE).

Claude is a trademark of Anthropic, PBC. Ellaworks is not affiliated with or endorsed by Anthropic.
