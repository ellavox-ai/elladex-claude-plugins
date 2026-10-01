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

The guard hook is a backstop, not a sandbox. It can't see a command built at run time, text piped into a shell, a script file that runs `agx` or changes files, or a write made through another plugin's MCP tool, and it only runs when `node` is on Claude Code's `PATH`. For `agx login` in particular:

- **The server.** The guard asks before a command points `agx` at a server other than `https://app.ellaworks.ai` (`--api-base-url`, `--api-url`, or `AGX_API_URL` set in the command in any form it parses, including a value it can't read). It can't see a server already stored in the `agx` profile (`apiBaseUrl`), or an `AGX_API_URL` inherited from the shell Claude Code started in; the hook's environment can differ from that shell's.
- **Browser automation.** The guard denies an MCP tool whose `url` input opens the sign-in approval page (`/auth/device`), with repeated slashes, through a sign-in page whose redirect leads there, or inside a batch of browser actions. A browser tool that reaches that page by clicking a link, running a script or typing the address, or a page that is already open, is not caught; the skills tell Claude never to open, fill in or click it, nor the link that makes a listing public.
- **Key files.** Reads of `~/.agx` (including `credentials.json`) and `$AGX_HOME` are denied. So is setting `AGX_HOME`, or `HOME` (`USERPROFILE`) in a command line that runs `agx`, in every form the guard parses (`NAME=`, `export`, `declare`, `read`, `printf -v`, `for`, a nameref, `${NAME:=…}`, `launchctl setenv`, `setx`, PowerShell's `$env:` and `Env:` drive), including in a shell startup file. The guard stops that move; it can't tie a later read of the new directory to a move it didn't see: one made by a program that loads variables it doesn't know, in an earlier call of a terminal that keeps its shell, or inside a script or container. When `agx` runs after `source`, `env $(…)`, `export $(…)`, `eval`, dotenv or `--env-file` in the same command line, it asks. A glob that spells the directory indirectly (`cat ~/.a?x/credentials.json`) is not caught.
- **An inherited API key.** The guard denies printing `AGX_API_KEY` (`printenv AGX_API_KEY`, `echo $AGX_API_KEY`, `env | grep -i agx`, and PowerShell's `$env:AGX_API_KEY` as an argument). It doesn't catch the whole environment printed with no filter (`env`), a bare `$env:AGX_API_KEY` statement in PowerShell, or a program that reads its own environment.
- **Not a secrecy guarantee.** Claude drives the same OS user's shell, so the login key's real protections are on the server: one organization, listings and domains only, a 90-day lifetime, revocation, and an admin's confirmation before a listing goes public.

These gaps are documented in the [`elladex-agx` README](plugins/elladex-agx/README.md#safety) and pinned by the tests in [`tests/guard-agx.test.mjs`](tests/guard-agx.test.mjs). A report that shows a new way around the guard is welcome.
