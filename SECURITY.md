# Security

## Reporting a vulnerability

Please report security issues privately, not in a public issue:

- Use GitHub's **Report a vulnerability** button on this repository's Security tab, or
- email support@ellavox.ai with "security" in the subject.

Include the plugin and version, what you did, and what happened. We'll acknowledge the report and keep you updated until it's resolved.

## Scope

In scope: the plugins in this repository, including the `elladex-agx` guard hook (`plugins/elladex-agx/scripts/guard-agx.mjs`), the skills' instructions, and the manifests.

Out of scope here: the `agx` CLI, the Elladex directory service, and Claude Code itself. Report vulnerabilities in `agx` or the Elladex directory privately to support@ellavox.ai with "security" in the subject, not in a public issue on [ellavox-ai/nostr-agx](https://github.com/ellavox-ai/nostr-agx). Report Claude Code issues to Anthropic.

## Known limits

The guard hook is a backstop, not a sandbox. It can't see a command built at run time, text piped into a shell, a script file that runs `agx` or changes files, or a write made through another plugin's MCP tool, and it only runs when `node` is on Claude Code's `PATH`. These gaps are documented in the [`elladex-agx` README](plugins/elladex-agx/README.md#safety) and pinned by the tests in `plugins/elladex-agx/scripts/guard-agx.test.mjs`. A report that shows a new way around the guard is welcome.
