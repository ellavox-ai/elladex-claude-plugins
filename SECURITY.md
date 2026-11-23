# Security

## Reporting a vulnerability

Please report security issues privately, not in a public issue:

- Use GitHub's **Report a vulnerability** button on this repository's Security tab, or
- email support@ellavox.ai with "security" in the subject.

Include the plugin and version, what you did, and what happened. We'll acknowledge the report and keep you updated until it's resolved.

## Scope

In scope: the plugins in this repository, including the skills' instructions, the Claude Code permission rules `elladex-agx` asks you to add, and the manifests.

Out of scope here: the `agx` CLI, the Elladex directory service, and Claude Code itself. Report vulnerabilities in `agx` or the Elladex directory privately to support@ellavox.ai with "security" in the subject, not in a public issue on [ellavox-ai/nostr-agx](https://github.com/ellavox-ai/nostr-agx). Report Claude Code issues to Anthropic.

## Known limits

Since 0.3.0, `elladex-agx` ships no hook. Its protection is the Claude Code permission rules you add from its README, plus its skills' instructions. Claude Code matches those rules on the start of a command, so a command built at run time, text piped into a shell or a script file that runs `agx` gets past them. These gaps are documented in the [`elladex-agx` README](plugins/elladex-agx/README.md#safety). A report that shows a way for a peer's message to steer Claude past the skills' instructions is welcome.
