#!/usr/bin/env node
/**
 * PreToolUse guard for the elladex-agx plugin.
 *
 * Claude Code runs this before every Bash, Monitor, PowerShell, Read, Grep,
 * Glob, Write, Edit, MultiEdit and NotebookEdit call, and every MCP tool call
 * (hooks/hooks.json): an MCP tool's `command`, `cmd` or `script` input is
 * checked like Bash (the Desktop terminal tool runs commands in the user's own
 * shell), its path inputs like Read, and its `url` input (a browser tool's)
 * against the sign-in approval page and a listing's manage page, at any depth
 * (a `browser_batch` action's `input.url` too). It reads the hook input as
 * JSON on stdin, and from the environment only the plugin's `send_mode`
 * option (CLAUDE_PLUGIN_OPTION_SEND_MODE) and AGX_HOME (see `guardEnv`). It
 * prints a `hookSpecificOutput` decision of deny or ask, or nothing at all
 * when it has no opinion; it never approves a tool call:
 *
 *   deny   `agx identity export`, `agx config show --reveal`, any tool call that
 *          touches ~/.agx or $AGX_HOME (the secret key, the allowlist and the
 *          `agx login` key in credentials.json live there); setting AGX_HOME,
 *          and setting HOME (or USERPROFILE) in a command line that runs agx;
 *          an agx profile name that is a path (`-p ../../x`, AGX_PROFILE,
 *          `agx config use`), which would move a profile's files the same way;
 *          an API key on a command line or in agx's environment (`agx config
 *          set apiKey <value>`, AGX_API_KEY set, or an `ela_…` key literal);
 *          printing an inherited AGX_API_KEY (`printenv AGX_API_KEY`, `echo
 *          $AGX_API_KEY`, `env | grep -i agx`); an MCP tool (a browser)
 *          opening the sign-in approval page `/auth/device`, directly or
 *          through a sign-in page's redirect; `agx serve` without the watch's
 *          safe flags or with --allow-all, --reply-any or --advertise; any
 *          attempt to change the send mode (`send_mode=` in a command, or a
 *          Claude settings file written with send_mode, claude-sends or
 *          elladex-agx in it); and anything that turns this guard off: `claude
 *          plugin disable|uninstall` of elladex-agx (or `--all`), removing the
 *          `ellaworks` marketplace, `disableAllHooks`, and writes to this
 *          plugin's installed files or Claude Code's plugin registry.
 *          "Setting" a variable means any spelling the parser knows: `NAME=v`
 *          (as a prefix, through `env`, `export`, `declare -x`, or spelled by
 *          brace expansion), `export NAME`, `declare`/`typeset`/`local`/
 *          `readonly`/`setenv NAME`, `read NAME`, `mapfile`, `getopts`,
 *          `printf -v NAME`, `for NAME in`, fish's `set NAME`, a nameref to
 *          it, `${NAME:=v}`, any command that names it once allexport is on
 *          (`set -a; sysread NAME`), `launchctl setenv`, `tmux setenv`,
 *          `setx` and the registry's Environment key, PowerShell's `$env:NAME
 *          =` (and `+=`, `??=`), `Env:` drive writes, `@{NAME='v'}` and
 *          `[Environment]::SetEnvironmentVariable`, and another language's
 *          environment table (`os.environ["NAME"] = v`, `process.env["NAME"]
 *          = v`, `ENV["NAME"] = v`, `$ENV{NAME} = v`). What a heredoc, `echo`,
 *          `printf`, Write/Edit or an MCP file tool puts into a shell startup
 *          file (~/.zshenv, ~/.bashrc, ~/.cshrc, .envrc, …) is read as a
 *          command line.
 *   send   `agx send` / `agx request`: deny in draft mode (the default; the user
 *          runs the command), ask in claude-sends mode (a permission prompt even
 *          when Bash is allowlisted).
 *   ask    trust and publishing changes: `agx identity new|import|sign|allow
 *          <npub>|deny|register`, `agx register`, `agx config set|use`
 *          (including `config set apiKey --stdin`), the `agx peers` decisions,
 *          `agx serve --allow`, `agx listing create|publish|set-visibility|
 *          delist|delete|set-policy` and `agx domain add|verify|remove`. Also
 *          any agx server other than https://app.ellaworks.ai (`--api-base-url`,
 *          `--api-url` or AGX_API_URL, including a value it can't read), `agx
 *          login --new-org|--org-name|--org-slug`, every `agx org` subcommand
 *          except `list`, agx run in a command line that loads variables it
 *          can't read (`source f`, `env $(cat f)`, `export $(…)`, `eval`,
 *          dotenv, `--env-file`, a shell's `--rcfile` or BASH_ENV, node's
 *          NODE_OPTIONS or `--require`, a variable whose name is computed), a
 *          profile name it can't read (`-p "$P"`), a script in another
 *          language (`python3 -c`, `node -e`, a heredoc fed to one) or an
 *          edit of a shell startup file that names AGX_HOME, AGX_PROFILE,
 *          AGX_API_KEY or AGX_API_URL (or HOME, when it also runs agx) in a
 *          way it can't follow, a command line about agx that is too long or
 *          too deeply nested to read in full (see MAX_TEXTS, MAX_AGX_WORDS
 *          and BUDGET_MS), a Grep with no path whose working directory
 *          contains ~/.agx, agx send/request text in a form it can't parse,
 *          and an MCP tool (a browser) opening a listing's manage page
 *          `/elladex/listings/<id>`, which has the Publish button only a
 *          human organization admin may click.
 *   none   everything else, including `agx login` against the default server,
 *          `agx whoami`, `agx logout` and `agx org list`: Claude Code's own
 *          permission rules decide.
 *
 * This is a backstop, not a sandbox. It parses shell well enough to see through
 * quoting, env prefixes, wrappers (env, sudo, timeout, xargs, setsid, …),
 * `bash -c`, `eval`, command substitution, heredocs fed to a shell, package
 * runners (npx, pnpm, npm, yarn, bun, corepack, mise) and `node …/agx.js`, and
 * it treats an agx word followed later by `send` or `request` anywhere in a
 * command (`ssh host agx send …`, `find -exec agx send …`) as a send. It cannot
 * see a command built at run time, for example a subcommand held in a variable
 * (`v=send; agx $v …`, `$E agx login`), text piped into a shell, a script file
 * or a container that runs agx, a script in another language that hands agx
 * its arguments as a list (`subprocess.run(["agx", "send", …])`), variables
 * loaded by a program it doesn't know or from a `.env` file a later command
 * reads on its own, a startup file copied into place or one that sources
 * another file, a variable set in an earlier call of a terminal that keeps its
 * shell between calls, a glob that spells the key directory indirectly
 * (`~/.a?x`), a shell search of the whole home directory (`grep -r … ~`), an
 * agx server or profile stored in agx's config or inherited from the shell
 * (AGX_API_URL, AGX_PROFILE), the whole environment printed with no filter
 * (`env`) or a script file that reads AGX_API_KEY from its own environment, or
 * a browser tool that reaches the approval page by clicking, by script or by
 * typing the address rather than by a `url` input. It stops the step that
 * moves agx's files (AGX_HOME, AGX_PROFILE, HOME), not a later read of
 * wherever they went. The tests list these gaps.
 *
 * It tries not to get in the way of ordinary work: the pattern of grep/rg and
 * the message of `git commit -m` / `gh pr create --body` are text, not paths or
 * commands; echo/printf arguments are not commands, and a heredoc written to a
 * file is not parsed at all, unless the file is a shell startup file. Keep
 * permission prompts on; see the plugin README.
 *
 * Dependency-free ESM for Node >= 20.
 */
import { readFileSync, realpathSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const DRAFT = "draft";
const CLAUDE_SENDS = "claude-sends";

/** Flags the watch must run with (see skills/watch/SKILL.md). */
const REQUIRED_SERVE_FLAGS = [
	"--no-reply",
	"--no-tasks",
	"--allowed-only",
	"--full-ids",
];
/** How the user changes the send mode. Kept word for word in the README and
 * the agx-peer skill, so Claude and the user read the same directions. */
const MODE_SWITCH =
	"change it in /config (elladex-agx → Who sends messages) or /plugin → Installed → elladex-agx → Configure options";

/** `agx listing` and `agx domain` subcommands that change what is published. */
const LISTING_WRITES = new Set([
	"create",
	"publish",
	"set-visibility",
	"delist",
	"delete",
	"set-policy",
]);
const DOMAIN_WRITES = new Set(["add", "verify", "remove"]);

/** The Ellaworks server `agx login` uses by default. Must equal agx's
 * `DEFAULT_API_BASE_URL` (agx 0.4.0, src/lib/config.ts). */
const DEFAULT_API_ORIGIN = "https://app.ellaworks.ai";
/** agx options that name the server: `agx login --api-base-url`, and the
 * shorter spelling some commands take. */
const API_BASE_OPTION = /^--api(?:-base)?-url$/;
/** `agx login` options that ask the approver to create an organization. */
const NEW_ORG_OPTIONS = ["--new-org", "--org-name", "--org-slug"];
/** `agx org` subcommands that only read. Every other one asks (fail closed). */
const ORG_READS = new Set(["list"]);
/** An Ellaworks API key: `ela_` and 64 letters. 32 is enough to tell it from
 * prose without matching a shortened example such as `ela_…`. */
const ELA_KEY = /(?<![A-Za-z0-9_])ela_[A-Za-z]{32,}/;

const API_KEY_REASON =
	"elladex-agx: this puts an Ellaworks API key on a command line or into agx's environment (AGX_API_KEY), where it can land in the transcript and the process list. Claude never handles API keys: to sign agx in, Claude runs `agx login`, which sends the user to the browser and stores the key without showing it. If this is a real key, treat it as exposed: revoke it in Settings → API keys. To store a key for CI, the user runs `agx config set apiKey --stdin` in their own terminal.";
const API_KEY_READ_REASON =
	"elladex-agx: this prints or passes on AGX_API_KEY, an Ellaworks API key inherited from the shell, which would put it in the transcript or another program's hands. Claude never prints, inspects or uses it; agx reads it itself. To tell whether it is set, use a test that prints nothing else: `[ -n \"$AGX_API_KEY\" ] && echo set`. If the key was printed, the user revokes it in Settings → API keys, and Claude signs agx in with `agx login` instead.";
const API_KEY_STDIN_REASON =
	"elladex-agx: `agx config set apiKey --stdin` stores an Ellaworks API key that someone would have to paste. Claude signs agx in with `agx login` instead, which needs no key from anyone. Approve only if you started this yourself and the key never passed through the chat.";
const AGX_HOME_REASON =
	"elladex-agx: Claude never sets AGX_HOME, and never sets HOME (USERPROFILE on Windows) in a command that runs agx. agx keeps the agx secret key and the `agx login` key (credentials.json) in AGX_HOME, or in .agx under the home directory, so moving either would put them where Claude could read them. Run agx without it: to sign in, `agx login`. If a login was already made under another directory, the user revokes it with `agx logout` in their own terminal.";
const UNCHECKED_REASON =
	"elladex-agx: this command line is too long, too deeply nested or too full of agx words for the guard to check all of it, and it mentions agx, Claude Code's settings or its plugins. Approve only if you know what every part of it does.";
/** What makes an unchecked command line worth a prompt. */
const UNCHECKED_TEXT = /agx|send_mode|claude|disableAllHooks|ellaworks/i;
/** How many pieces of one command line (the line itself, its substitutions,
 * heredocs and quoted scripts) the guard reads. */
const MAX_TEXTS = 200;
/** How many times one simple command may say `agx` before the guard stops
 * reading it word by word: those checks cost time for every agx word. */
const MAX_AGX_WORDS = 64;
/** How long the guard works on one command line, in milliseconds. Claude
 * Code stops the hook after 10 seconds (hooks/hooks.json), and a hook that
 * is stopped decides nothing, so the guard gives up well before that and
 * asks instead. */
const BUDGET_MS = 3000;

const PROFILE_PATH_REASON =
	"elladex-agx: this gives agx a profile name that isn't a plain name (`--profile`, `agx config use` or AGX_PROFILE with `/`, `\\`, `..` or white space in it). agx keeps each profile's secret key and its pending `agx login` in a directory named after the profile, inside its private directory, so a path there would put them where Claude could read them. Claude never does this: use a plain profile name, such as `work`, or none.";
const PROFILE_UNREAD_REASON =
	"elladex-agx: this gives agx a profile name the guard can't read (`--profile`, `agx config use` or AGX_PROFILE, computed at run time). agx keeps each profile's secret key and its pending `agx login` in a directory named after the profile, so a name that is a path would move them out of agx's private directory. Approve only if you know the name is a plain one.";
const LOADED_ENV_REASON =
	"elladex-agx: this command runs agx after loading environment variables the guard can't read, from a file (`source`, `.`, dotenv, `--env-file`, a shell's `--rcfile` or BASH_ENV, node's NODE_OPTIONS or `--require`) or computed at run time (`env $(…)`, `export $(…)`, `eval`, a variable whose name is computed). They could move agx's files (AGX_HOME, AGX_PROFILE, HOME), set an API key (AGX_API_KEY) or change its server (AGX_API_URL). Claude runs agx with the environment it already has. Approve only if you know what this loads.";

/**
 * The prompt for a script in another language (`python3 -c`, `node -e`, a
 * heredoc fed to one), or an edit of a shell startup file, that names one of
 * agx's variables in a way the guard can't follow.
 * @param {string[]} names
 */
function namedInScriptReason(names) {
	return `elladex-agx: this runs a script, or edits a shell startup file, that names ${names.join(", ")}, and the guard can't read what it does with ${names.length > 1 ? "them" : "it"}. It could move agx's files (AGX_HOME, AGX_PROFILE, HOME), set or print an API key (AGX_API_KEY) or change agx's server (AGX_API_URL). Claude runs agx with the environment it already has, and never prints or passes on an API key. Approve only if you know what this does.`;
}
const NEW_ORG_REASON =
	"elladex-agx: this asks you to create a new Ellaworks organization on the sign-in page (`agx login --new-org`, `--org-name` or `--org-slug`, or `agx org create`). Approve only if you asked for a new organization; the organization itself is created only when you approve it in the browser.";

/**
 * The prompt for an agx server other than the default. Names each server's
 * host as a URL parser reads it, next to the value as written, so a
 * lookalike (`https://app.ellaworks.ai@evil.example`) shows its real host.
 * @param {(string | null)[]} urls
 */
function apiBaseReason(urls) {
	const shown = unique(urls.map(describeApiBase)).join(", ");
	return `elladex-agx: this points agx at ${shown} instead of the default Ellaworks server, ${DEFAULT_API_ORIGIN}. agx would send its login key to that server, and \`agx login\` would show a sign-in link and code from it. Approve only if you named this server yourself.`;
}

/** @param {string | null} value null when the guard can't read it */
function describeApiBase(value) {
	if (value === null) {
		return "a server the guard can't read";
	}
	if (value === "") {
		return "an empty server address";
	}
	try {
		const url = new URL(value);
		return `${url.protocol}//${url.host} (written \`${value}\`)`;
	} catch {
		return `\`${value}\``;
	}
}

/** Flags that make `serve` answer, trust or publish on its own. */
const FORBIDDEN_SERVE_FLAGS = ["--allow-all", "--reply-any", "--advertise"];

const SHELLS = new Set(["sh", "bash", "zsh", "dash", "ksh", "mksh", "fish"]);
const JS_RUNTIMES = new Set([
	"node",
	"nodejs",
	"bun",
	"deno",
	"tsx",
	"ts-node",
]);
const SHELL_KEYWORDS = new Set([
	"!",
	"{",
	"}",
	"(",
	")",
	"if",
	"then",
	"else",
	"elif",
	"fi",
	"do",
	"done",
	"while",
	"until",
	"time",
	"coproc",
]);

/** Node options that take a separate value. */
const NODE_VALUE_OPTIONS = new Set([
	"-r",
	"--require",
	"--import",
	"--loader",
	"--experimental-loader",
	"--env-file",
	"--conditions",
	"-C",
	"--title",
	"--input-type",
]);

// ---------------------------------------------------------------- tokenizer

/**
 * @typedef {{ argv: string[], body: string }} Heredoc
 * @typedef {{ delim: string, strip: boolean, argv: string[] }} PendingHeredoc
 */

/**
 * Split a shell command line into simple commands (argv arrays) plus the text
 * of every command substitution, process substitution and here-string found
 * along the way, which the caller analyzes recursively. Quotes are removed the
 * way the shell would; `$(…)` and backticks leave `$(<body>)` in the word, so
 * the word is visibly dynamic and still names what it runs.
 *
 * Redirection targets are returned separately (they are files, not
 * arguments), and each here-document body is returned with the argv of the
 * command that reads it, so the caller can decide whether the body is a
 * script (`bash <<EOF`) or just text (`cat > notes.md <<EOF`).
 *
 * @param {string} src
 * @returns {{ commands: string[][], nested: string[], redirects: string[], heredocs: Heredoc[] }}
 */
export function tokenize(src) {
	/** @type {string[][]} */
	const commands = [];
	/** @type {string[]} */
	const nested = [];
	/** @type {string[]} */
	const redirects = [];
	/** @type {Heredoc[]} */
	const heredocs = [];
	/** @type {PendingHeredoc[]} */
	let pending = [];
	/** @type {string[]} */
	let words = [];
	let word = "";
	let inWord = false;
	let skipNextWord = false;
	let hereString = false;
	let i = 0;

	function endWord() {
		if (!inWord) {
			return;
		}
		if (hereString) {
			nested.push(word);
			hereString = false;
			skipNextWord = false;
		} else if (skipNextWord) {
			redirects.push(word);
			skipNextWord = false;
		} else {
			words.push(word);
		}
		word = "";
		inWord = false;
	}

	function endCommand() {
		endWord();
		if (words.length > 0) {
			commands.push(words);
		}
		words = [];
	}

	/** Read a `$(…)` body starting just after the `(`; returns [body, nextIndex].
	 * Here-document lines inside it are skipped whole, so an apostrophe in a
	 * commit message (`$(cat <<'EOF' … don't … EOF)`) doesn't unbalance it. */
	function readParenBody(start) {
		let depth = 1;
		let j = start;
		/** @type {PendingHeredoc[]} */
		let inner = [];
		while (j < src.length && depth > 0) {
			const c = src[j];
			if (c === "\n" && inner.length > 0) {
				j = skipHeredocBodies(j + 1, inner, null);
				inner = [];
				continue;
			}
			if (c === "<" && src[j + 1] === "<" && src[j + 2] !== "<") {
				const [h, next] = readHeredocDelimiter(j + 2, []);
				if (isDelimiter(h.delim)) {
					inner.push(h);
				}
				j = next;
				continue;
			}
			if (c === "\\") {
				j += 2;
				continue;
			}
			if (c === "'") {
				const close = src.indexOf("'", j + 1);
				j = close === -1 ? src.length : close + 1;
				continue;
			}
			if (c === '"') {
				j = skipDoubleQuoted(j + 1);
				continue;
			}
			if (c === "(") {
				depth += 1;
			} else if (c === ")") {
				depth -= 1;
				if (depth === 0) {
					break;
				}
			}
			j += 1;
		}
		return [src.slice(start, j), Math.min(j + 1, src.length)];
	}

	function skipDoubleQuoted(start) {
		let j = start;
		while (j < src.length && src[j] !== '"') {
			j += src[j] === "\\" ? 2 : 1;
		}
		return j + 1;
	}

	/**
	 * Read a here-document operator's delimiter word, starting just after `<<`.
	 * @param {number} start
	 * @param {string[]} argv the command that reads the body
	 * @returns {[PendingHeredoc, number]}
	 */
	function readHeredocDelimiter(start, argv) {
		let j = start;
		const strip = src[j] === "-";
		if (strip) {
			j += 1;
		}
		while (src[j] === " " || src[j] === "\t") {
			j += 1;
		}
		let delim = "";
		while (j < src.length && !/[\s;&|<>()]/.test(src[j])) {
			const d = src[j];
			if (d === "'" || d === '"') {
				const close = src.indexOf(d, j + 1);
				const end = close === -1 ? src.length : close;
				delim += src.slice(j + 1, end);
				j = end + 1;
				continue;
			}
			if (d === "\\") {
				delim += src[j + 1] ?? "";
				j += 2;
				continue;
			}
			delim += d;
			j += 1;
		}
		return [{ delim, strip, argv }, j];
	}

	/**
	 * Consume the bodies of `list`'s here-documents, starting at the line after
	 * the operator. Returns the index after the last delimiter line.
	 * @param {number} start
	 * @param {PendingHeredoc[]} list
	 * @param {Heredoc[] | null} out where to record the bodies, if anywhere
	 */
	function skipHeredocBodies(start, list, out) {
		let j = start;
		for (const h of list) {
			/** @type {string[]} */
			const lines = [];
			while (j < src.length) {
				const nl = src.indexOf("\n", j);
				const lineEnd = nl === -1 ? src.length : nl;
				const raw = src.slice(j, lineEnd);
				j = nl === -1 ? src.length : nl + 1;
				const line = h.strip ? raw.replace(/^\t+/, "") : raw;
				if (line === h.delim) {
					break;
				}
				lines.push(line);
			}
			out?.push({ argv: h.argv, body: lines.join("\n") });
		}
		return j;
	}

	/** Read a backtick body starting just after the opening backtick. */
	function readBacktickBody(start) {
		let j = start;
		let body = "";
		while (j < src.length && src[j] !== "`") {
			if (src[j] === "\\" && j + 1 < src.length) {
				body += src[j + 1];
				j += 2;
				continue;
			}
			body += src[j];
			j += 1;
		}
		return [body, j + 1];
	}

	while (i < src.length) {
		const c = src[i];

		if (c === "\\") {
			if (src[i + 1] === "\n") {
				i += 2;
				continue;
			}
			if (i + 1 < src.length) {
				word += src[i + 1];
				inWord = true;
			}
			i += 2;
			continue;
		}

		if (c === "'") {
			const close = src.indexOf("'", i + 1);
			const end = close === -1 ? src.length : close;
			word += src.slice(i + 1, end);
			inWord = true;
			i = end + 1;
			continue;
		}

		if (c === "$" && src[i + 1] === "'") {
			const [text, next] = readAnsiC(src, i + 2);
			word += text;
			inWord = true;
			i = next;
			continue;
		}

		if (c === '"') {
			let j = i + 1;
			while (j < src.length && src[j] !== '"') {
				const d = src[j];
				if (d === "\\" && j + 1 < src.length) {
					const e = src[j + 1];
					if (e === '"' || e === "\\" || e === "$" || e === "`") {
						word += e;
					} else if (e !== "\n") {
						word += d + e;
					}
					j += 2;
					continue;
				}
				if (d === "$" && src[j + 1] === "(") {
					const [body, next] = readParenBody(j + 2);
					nested.push(body);
					word += `$(${body})`;
					j = next;
					continue;
				}
				if (d === "`") {
					const [body, next] = readBacktickBody(j + 1);
					nested.push(body);
					word += `$(${body})`;
					j = next;
					continue;
				}
				word += d;
				j += 1;
			}
			inWord = true;
			i = j + 1;
			continue;
		}

		if (c === "$" && src[i + 1] === "(") {
			const [body, next] = readParenBody(i + 2);
			nested.push(body);
			word += `$(${body})`;
			inWord = true;
			i = next;
			continue;
		}

		if (c === "`") {
			const [body, next] = readBacktickBody(i + 1);
			nested.push(body);
			word += `$(${body})`;
			inWord = true;
			i = next;
			continue;
		}

		if (c === "#" && !inWord) {
			const nl = src.indexOf("\n", i);
			i = nl === -1 ? src.length : nl;
			continue;
		}

		if (c === " " || c === "\t") {
			endWord();
			i += 1;
			continue;
		}

		if ((c === "<" || c === ">") && src[i + 1] === "(") {
			// Process substitution: <(…) or >(…).
			endWord();
			const [body, next] = readParenBody(i + 2);
			nested.push(body);
			i = next;
			continue;
		}

		if (c === "<" && src[i + 1] === "<" && src[i + 2] !== "<") {
			// A here-document: `<<EOF`, `<<-EOF`, `<<'EOF'`. Its body starts on
			// the next line and is returned with this command's argv.
			if (inWord && /^\d+$/.test(word)) {
				word = "";
				inWord = false;
			}
			endWord();
			const [h, next] = readHeredocDelimiter(i + 2, words);
			if (isDelimiter(h.delim)) {
				pending.push(h);
			}
			i = next;
			continue;
		}

		if (c === "<" || c === ">" || (c === "&" && src[i + 1] === ">")) {
			// A redirection. A bare fd number before it (`2>`) is not an argument.
			if (inWord && /^\d+$/.test(word)) {
				word = "";
				inWord = false;
			}
			endWord();
			let j = i;
			if (src.startsWith("<<<", j)) {
				hereString = true;
				j += 3;
			} else {
				while (j < src.length && "<>&|".includes(src[j])) {
					// Stop before a `&` that is not part of `>&` / `&>`.
					if (src[j] === "&" && j > i && !">".includes(src[j - 1])) {
						break;
					}
					j += 1;
				}
				// `>&2`, `2>&-`: an fd duplication has no filename word.
				if (src[j - 1] === "&" && /[\d-]/.test(src[j] ?? "")) {
					while (j < src.length && /[\d-]/.test(src[j])) {
						j += 1;
					}
					i = j;
					continue;
				}
			}
			skipNextWord = true;
			i = j;
			continue;
		}

		if (c === "\n" && pending.length > 0) {
			endCommand();
			i = skipHeredocBodies(i + 1, pending, heredocs);
			pending = [];
			continue;
		}

		if (
			c === ";" ||
			c === "&" ||
			c === "|" ||
			c === "\n" ||
			c === "(" ||
			c === ")"
		) {
			endCommand();
			i += 1;
			continue;
		}

		word += c;
		inWord = true;
		i += 1;
	}
	endCommand();
	return { commands, nested, redirects, heredocs };
}

/** A plausible here-document delimiter (not the `2` of an arithmetic `1<<2`). */
function isDelimiter(d) {
	return /^[A-Za-z_][\w.-]*$/.test(d);
}

/** Decode a `$'…'` ANSI-C quoted string starting just after the quote. */
function readAnsiC(src, start) {
	let j = start;
	let out = "";
	const simple = {
		n: "\n",
		t: "\t",
		r: "\r",
		a: "\x07",
		b: "\b",
		e: "\x1b",
		E: "\x1b",
		f: "\f",
		v: "\v",
		"\\": "\\",
		"'": "'",
		'"': '"',
		"?": "?",
	};
	while (j < src.length && src[j] !== "'") {
		if (src[j] !== "\\") {
			out += src[j];
			j += 1;
			continue;
		}
		const e = src[j + 1] ?? "";
		if (e in simple) {
			out += simple[/** @type {keyof typeof simple} */ (e)];
			j += 2;
		} else if (e === "x") {
			const hex = /^[0-9a-fA-F]{1,2}/.exec(src.slice(j + 2))?.[0] ?? "";
			out += hex ? String.fromCharCode(Number.parseInt(hex, 16)) : "\\x";
			j += 2 + hex.length;
		} else if (e === "u" || e === "U") {
			const max = e === "u" ? 4 : 8;
			const hex =
				new RegExp(`^[0-9a-fA-F]{1,${max}}`).exec(
					src.slice(j + 2),
				)?.[0] ?? "";
			out += hex
				? String.fromCodePoint(Number.parseInt(hex, 16))
				: `\\${e}`;
			j += 2 + hex.length;
		} else if (/[0-7]/.test(e)) {
			const oct = /^[0-7]{1,3}/.exec(src.slice(j + 1))?.[0] ?? "";
			out += String.fromCharCode(Number.parseInt(oct, 8));
			j += 1 + oct.length;
		} else {
			out += `\\${e}`;
			j += 2;
		}
	}
	return [out, j + 1];
}

// ---------------------------------------------------------- argv analysis

function basename(p) {
	const parts = p.split(/[\\/]/);
	return parts[parts.length - 1] ?? p;
}

function isAssignment(w) {
	return /^[A-Za-z_][A-Za-z0-9_]*=/.test(w);
}

/** `agx`, `agx.js`, `agx.mjs`, `agx.ts` (the CLI entry, a checkout's
 * `scripts/agx.mjs`, or a symlink named `agx`). */
function isAgxEntry(w) {
	return /^agx(\.[cm]?[jt]s)?$/.test(basename(w));
}

/** The CLI's npm package, `@nostr-agx/cli` (formerly `@agx/cli`), optionally
 * with a version or tag, or as deno's `npm:@nostr-agx/cli`. */
function isAgxPackage(w) {
	return /^(?:npm:)?@(?:nostr-agx|agx)\/cli(@.*)?$/.test(w);
}

/**
 * Skip options at the front of `argv`. `valueOptions` take a separate value.
 * Returns the index of the first non-option word.
 */
function skipOptions(argv, start, valueOptions) {
	let i = start;
	while (i < argv.length && argv[i].startsWith("-") && argv[i] !== "-") {
		if (argv[i] === "--") {
			return i + 1;
		}
		if (valueOptions.has(argv[i])) {
			i += 1;
		}
		i += 1;
	}
	return i;
}

/**
 * Find agx invocations in one simple command. Returns the argument lists that
 * follow `agx` (one per invocation found), and any command strings to analyze
 * recursively (`bash -c`, `eval`, `env -S`, `npx -c`).
 *
 * @param {string[]} argv
 * @returns {{ agx: string[][], nested: string[] }}
 */
export function findAgx(argv) {
	/** @type {string[][]} */
	const agx = [];
	/** @type {string[]} */
	const nested = [];
	let i = 0;

	for (let guard = 0; guard < 64 && i < argv.length; guard += 1) {
		const w = argv[i];
		const name = basename(w);

		if (SHELL_KEYWORDS.has(w) || isAssignment(w)) {
			i += 1;
			continue;
		}

		if (name === "env") {
			i += 1;
			while (i < argv.length) {
				const a = argv[i];
				if (a === "-S" || a === "--split-string") {
					nested.push(argv.slice(i + 1).join(" "));
					return { agx, nested };
				}
				if (a.startsWith("-S") || a.startsWith("--split-string=")) {
					nested.push(
						[
							a.replace(/^(-S|--split-string=)/, ""),
							...argv.slice(i + 1),
						].join(" "),
					);
					return { agx, nested };
				}
				if (
					a === "-u" ||
					a === "--unset" ||
					a === "-C" ||
					a === "--chdir"
				) {
					i += 2;
				} else if (a.startsWith("-") || isAssignment(a)) {
					i += 1;
				} else {
					break;
				}
			}
			continue;
		}

		if (
			[
				"command",
				"builtin",
				"exec",
				"nohup",
				"time",
				"caffeinate",
				"unbuffer",
				"setsid",
				"chronic",
			].includes(name)
		) {
			i = skipOptions(argv, i + 1, new Set(["-a", "-w"]));
			continue;
		}
		if (name === "sudo" || name === "doas") {
			i = skipOptions(
				argv,
				i + 1,
				new Set(["-u", "-g", "-h", "-p", "-C", "-D", "-r", "-t", "-U"]),
			);
			continue;
		}
		if (name === "corepack" || name === "busybox") {
			// `corepack pnpm dlx …`, `busybox sh -c …`: the next word runs.
			i += 1;
			continue;
		}
		if (
			(name === "mise" || name === "rtx") &&
			["exec", "x"].includes(argv[i + 1] ?? "")
		) {
			// `mise exec [tool@version …] -- <command>`
			const dash = argv.indexOf("--", i + 2);
			i = dash === -1 ? skipOptions(argv, i + 2, new Set()) : dash + 1;
			continue;
		}
		if (name === "nice" || name === "ionice") {
			i = skipOptions(argv, i + 1, new Set(["-n", "-c"]));
			continue;
		}
		if (name === "stdbuf") {
			i = skipOptions(argv, i + 1, new Set(["-i", "-o", "-e"]));
			continue;
		}
		if (name === "timeout" || name === "gtimeout") {
			i = skipOptions(argv, i + 1, new Set(["-s", "--signal", "-k"]));
			i += 1; // the duration
			continue;
		}
		if (name === "xargs") {
			i = skipOptions(
				argv,
				i + 1,
				new Set(["-I", "-n", "-P", "-L", "-d", "-E", "-s", "-a"]),
			);
			continue;
		}
		if (name === "watch") {
			const j = skipOptions(argv, i + 1, new Set(["-n", "--interval"]));
			nested.push(argv.slice(j).join(" "));
			return { agx, nested };
		}
		if (name === "eval" || PS_EVAL.test(name)) {
			nested.push(argv.slice(i + 1).join(" "));
			return { agx, nested };
		}
		if (name === "trap" || name === "emulate") {
			// `trap '<string>' EXIT`, zsh's `emulate sh -c '<string>'`: the
			// shell itself runs the string.
			const j =
				name === "trap"
					? skipOptions(argv, i + 1, new Set())
					: argv.indexOf("-c", i + 1) + 1;
			if (j > i && j < argv.length) {
				nested.push(argv[j]);
			}
			return { agx, nested };
		}
		if (SHELLS.has(name)) {
			// `bash -c '<string>' …`, including combined flags like `-lc`, `-ec`.
			for (let j = i + 1; j < argv.length; j += 1) {
				const a = argv[j];
				if (!a.startsWith("-")) {
					break;
				}
				if (/^-[a-z]*c[a-z]*$/i.test(a) && !a.startsWith("--")) {
					if (j + 1 < argv.length) {
						nested.push(argv[j + 1]);
					}
					break;
				}
				if (["-o", "+o", "-O", "+O"].includes(a)) {
					// `bash -O extglob -c '…'`: these options take a value.
					j += 1;
				}
			}
			return { agx, nested };
		}

		if (["npx", "pnpx", "bunx"].includes(name)) {
			let j = i + 1;
			while (j < argv.length && argv[j].startsWith("-")) {
				const a = argv[j];
				if (a === "--") {
					j += 1;
					break;
				}
				if (a === "-c" || a === "--call") {
					if (j + 1 < argv.length) {
						nested.push(argv[j + 1]);
					}
					return { agx, nested };
				}
				j += a === "-p" || a === "--package" ? 2 : 1;
			}
			if (
				j < argv.length &&
				(isAgxEntry(argv[j]) || isAgxPackage(argv[j]))
			) {
				agx.push(argv.slice(j + 1));
			}
			return { agx, nested };
		}

		if (["pnpm", "npm", "yarn"].includes(name) || name === "bun") {
			const valueOptions = new Set([
				"--filter",
				"-F",
				"-C",
				"--dir",
				"--prefix",
				"--workspace",
				"-w",
				"--reporter",
				"--loglevel",
				"-p",
				"--package",
				"--cwd",
			]);
			// `-w` is a flag for pnpm (workspace root) but takes a value for npm.
			if (name === "pnpm") {
				valueOptions.delete("-w");
			}
			let j = skipOptions(argv, i + 1, valueOptions);
			if (["exec", "x", "dlx", "run", "run-script"].includes(argv[j])) {
				j = skipOptions(argv, j + 1, valueOptions);
			}
			if (
				j < argv.length &&
				(isAgxEntry(argv[j]) || isAgxPackage(argv[j]))
			) {
				let rest = argv.slice(j + 1);
				if (rest[0] === "--") {
					rest = rest.slice(1);
				}
				agx.push(rest);
			}
			return { agx, nested };
		}

		if (JS_RUNTIMES.has(name)) {
			let j = i + 1;
			if (name === "deno" && argv[j] === "run") {
				j += 1;
			}
			j = skipOptions(argv, j, NODE_VALUE_OPTIONS);
			// `node "$(command -v agx)" send …`: the usual fallback when the
			// `agx` shebang fails. A computed script path that mentions agx is agx.
			if (j < argv.length && isAgxWord(argv[j])) {
				agx.push(argv.slice(j + 1));
			}
			return { agx, nested };
		}

		if (isAgxEntry(w) || isAgxPackage(w)) {
			agx.push(argv.slice(i + 1));
		} else if (
			isDynamic(w) &&
			(/\bagx\b/.test(w) ||
				isAgxVerb(splitAgxArgs(argv.slice(i + 1)).positional[0]))
		) {
			// `$(which agx) send …`, `"$AGX" send …`, `"$AGX" -p work login …`: a
			// command name computed at run time. Treat it as agx when it mentions
			// agx or its first argument (after agx's global options) is one of
			// agx's sensitive subcommands.
			agx.push(argv.slice(i + 1));
		}
		return { agx, nested };
	}
	return { agx, nested };
}

function isDynamic(w) {
	return w.includes("$");
}

/** PowerShell's `eval`: `Invoke-Expression`, or its alias `iex`. */
const PS_EVAL = /^(?:iex|invoke-expression)$/i;

/** An agx entry point, the npm package, or a computed word that mentions agx. */
function isAgxWord(w) {
	return (
		isAgxEntry(w) || isAgxPackage(w) || (isDynamic(w) && /\bagx\b/.test(w))
	);
}

/** agx subcommands that make a computed command name (`"$AGX" login`) count as
 * agx: the ones the guard has an opinion about. */
function isAgxVerb(w) {
	return [
		"send",
		"request",
		"identity",
		"serve",
		"config",
		"register",
		"peers",
		"login",
		"org",
		"listing",
		"domain",
	].includes(w ?? "");
}

// ------------------------------------------------------------- decisions

/**
 * agx options that take a separate value: the global `--profile`, and the
 * server and organization options, so that `agx --api-base-url <url> login`
 * still reads `login` as the subcommand. (commander rejects most of these
 * before the subcommand, but the guard shouldn't depend on that.)
 */
const AGX_VALUE_OPTIONS = new Set([
	"-p",
	"--profile",
	"--api-base-url",
	"--api-url",
	"--org",
	"--org-name",
	"--org-slug",
]);

/**
 * The positional words of an agx argument list (options and the values of
 * `--profile` removed; everything after `--` is positional), and the options
 * seen before `--`.
 */
function splitAgxArgs(args) {
	/** @type {string[]} */
	const positional = [];
	/** @type {string[]} */
	const options = [];
	for (let i = 0; i < args.length; i += 1) {
		const a = args[i];
		if (a === "--") {
			positional.push(...args.slice(i + 1));
			break;
		}
		if (a.startsWith("-") && a !== "-") {
			options.push(a);
			if (AGX_VALUE_OPTIONS.has(a)) {
				i += 1;
			}
			continue;
		}
		positional.push(a);
	}
	return { positional, options };
}

function hasOption(options, flag) {
	return options.some((o) => o === flag || o.startsWith(`${flag}=`));
}

/**
 * The values given to options whose name matches `re`, as `--x v` or
 * `--x=v`, up to `--` (after it, words are positional). A matching option
 * with no value yields "".
 *
 * @param {string[]} args
 * @param {RegExp} re
 */
function optionValues(args, re) {
	/** @type {string[]} */
	const values = [];
	for (let i = 0; i < args.length; i += 1) {
		const a = args[i];
		if (a === "--") {
			break;
		}
		const eq = a.indexOf("=");
		if (a.startsWith("--") && eq > 0 && re.test(a.slice(0, eq))) {
			values.push(a.slice(eq + 1));
		} else if (re.test(a)) {
			values.push(args[i + 1] ?? "");
			i += 1;
		}
	}
	return values;
}

/**
 * True only for the default server written plainly: https, the default
 * host (any case, default port), no userinfo, path `/` or none, no query or
 * fragment. Anything computed at run time (`$URL`, `$(…)`), `http:`, a
 * lookalike host, userinfo or a value that doesn't parse is not the default,
 * and neither is a value the guard couldn't read (null).
 *
 * @param {string | null} value
 */
function isDefaultApiBase(value) {
	if (
		value === null ||
		isDynamic(value) ||
		/[\s?#`\\]/.test(value) ||
		!/^https:\/\//i.test(value)
	) {
		return false;
	}
	let url;
	try {
		url = new URL(value);
	} catch {
		return false;
	}
	return (
		url.origin === DEFAULT_API_ORIGIN &&
		url.username === "" &&
		url.password === "" &&
		(url.pathname === "/" || url.pathname === "")
	);
}

/**
 * @typedef {{ decision: "deny" | "ask", reason: string }} Verdict
 */

/**
 * Decide one agx invocation. A server other than the default prompts
 * whatever the subcommand: it is where agx sends its key, and where a login
 * link would come from.
 *
 * @param {string[]} args the words after `agx`
 * @param {string} mode "draft" | "claude-sends"
 * @returns {Verdict | null}
 */
export function decideAgx(args, mode) {
	const nonDefault = optionValues(args, API_BASE_OPTION).filter(
		(v) => !isDefaultApiBase(v),
	);
	return strongest([
		nonDefault.length > 0 ? ask(apiBaseReason(nonDefault)) : null,
		profileVerdict(profileValues(args)),
		decideAgxSub(args, mode),
	]);
}

/**
 * The profile names an agx argument list gives: `-p v`, `-pv`, `--profile v`
 * and `--profile=v` up to `--`, and the name `config use <name>` switches to.
 * An option with no value after it is null: the value comes from somewhere
 * the guard can't see (`… | xargs agx login -p`).
 *
 * @param {string[]} args the words after `agx`
 * @returns {(string | null)[]}
 */
function profileValues(args) {
	/** @type {(string | null)[]} */
	const values = [];
	for (let i = 0; i < args.length && args[i] !== "--"; i += 1) {
		const a = args[i];
		if (a === "-p" || a === "--profile") {
			values.push(args[i + 1] ?? null);
			i += 1;
		} else if (a.startsWith("--profile=")) {
			values.push(a.slice("--profile=".length));
		} else if (/^-p./.test(a)) {
			values.push(a.slice(2));
		}
	}
	const [sub, sub2, name] = splitAgxArgs(args).positional;
	if (sub === "config" && sub2 === "use" && name !== undefined) {
		values.push(name);
	}
	return values;
}

/**
 * agx keeps a profile's files in `<its directory>/profiles/<name>`, and agx
 * 0.4.0 takes the name as given (src/lib/paths.ts, `profileDir`), so a name
 * with `..` in it is a path out of that directory: `agx -p ../../../tmp/x
 * login` would write the pending login, device code included, to /tmp/x.
 * A name that isn't plain is denied; one the guard can't read (null, or
 * computed at run time) asks.
 *
 * @param {(string | null)[]} values
 * @returns {Verdict | null}
 */
function profileVerdict(values) {
	const unread = (v) => v === null || isDynamic(v);
	if (values.some((v) => !unread(v) && !isPlainProfile(v))) {
		return deny(PROFILE_PATH_REASON);
	}
	return values.some(unread) ? ask(PROFILE_UNREAD_REASON) : null;
}

/** A profile name with nothing of a path in it: letters, digits and `_ . @
 * + -`, not starting with a dot or a dash, and no `..`. Empty is no name. */
function isPlainProfile(v) {
	return (
		v === "" ||
		(/^[A-Za-z0-9_][A-Za-z0-9_.@+-]*$/.test(v) && !v.includes(".."))
	);
}

/**
 * Decide one agx invocation by its subcommand.
 *
 * @param {string[]} args the words after `agx`
 * @param {string} mode "draft" | "claude-sends"
 * @returns {Verdict | null}
 */
function decideAgxSub(args, mode) {
	const { positional, options } = splitAgxArgs(args);
	const [sub, sub2] = positional;

	if (sub === "login") {
		// Signing in against the default server needs no verdict: agx shows a
		// link and a code, and a person approves in the browser. Creating an
		// organization there is a bigger step, so it prompts first.
		return NEW_ORG_OPTIONS.some((o) => hasOption(options, o))
			? ask(NEW_ORG_REASON)
			: null;
	}

	if (sub === "whoami" || sub === "logout") {
		// whoami only reads; logout revokes this machine's own login key, which
		// the user gets back with `agx login`. Neither needs a verdict.
		return null;
	}

	if (sub === "org") {
		if (sub2 === undefined || ORG_READS.has(sub2)) {
			return null;
		}
		return sub2 === "create"
			? ask(NEW_ORG_REASON)
			: ask(
					`elladex-agx: \`agx org ${sub2}\` isn't an agx command the guard knows to be read-only. Approve only if you asked for it.`,
				);
	}

	if (sub === "identity") {
		if (sub2 === "export") {
			return deny(
				"elladex-agx: `agx identity export` prints the secret key. Claude must never run it. If the user needs the key, they run it in their own terminal.",
			);
		}
		if (["new", "import", "sign", "deny", "register"].includes(sub2)) {
			return ask(
				`elladex-agx: \`agx identity ${sub2}\` changes this agent's identity or trust. Approve only if you asked for it.`,
			);
		}
		if (sub2 === "allow") {
			const peers = positional.slice(2);
			if (peers.length > 0 && !hasOption(options, "--list")) {
				return ask(
					`elladex-agx: this adds ${peers.join(", ")} to the allowlist, so their messages reach Claude in full. Approve only if you chose this peer yourself.`,
				);
			}
		}
		return null;
	}

	if (sub === "config") {
		if (sub2 === "show" && hasOption(options, "--reveal")) {
			return deny(
				"elladex-agx: `agx config show --reveal` prints the API key. Claude must never run it; use `agx config show` without --reveal.",
			);
		}
		if (sub2 === "set" && isApiKeyName(positional[2])) {
			// `config set apiKey <value>` (or `apiKey=<value>`) puts the key in
			// argv; with no value, agx reads it from stdin (`--stdin`, or a pipe).
			return positional[2].includes("=") || positional.length > 3
				? deny(API_KEY_REASON)
				: ask(API_KEY_STDIN_REASON);
		}
		if (sub2 === "set" || sub2 === "use") {
			return ask(
				`elladex-agx: \`agx config ${sub2}\` changes agx settings (relays, profile or credentials). Approve only if you asked for it.`,
			);
		}
		return null;
	}

	if (sub === "register") {
		return ask(
			"elladex-agx: `agx register` proves this key and creates an Elladex listing. Approve only if you asked for it.",
		);
	}

	if (
		(sub === "listing" && LISTING_WRITES.has(sub2 ?? "")) ||
		(sub === "domain" && DOMAIN_WRITES.has(sub2 ?? ""))
	) {
		return ask(
			`elladex-agx: \`agx ${sub} ${sub2}\` changes what your organization publishes in the Elladex directory, or who may reach it. Approve only if you asked for it.`,
		);
	}

	if (
		sub === "peers" &&
		sub2 !== undefined &&
		sub2 !== "list" &&
		!sub2.startsWith("-")
	) {
		return ask(
			`elladex-agx: \`agx peers ${sub2}\` changes a team's exchange trust decisions. Approve only if you asked for it.`,
		);
	}

	if (sub === "send" || sub === "request") {
		if (mode === CLAUDE_SENDS) {
			return ask(
				`elladex-agx: this sends an Agent Exchange ${sub === "send" ? "message" : "typed request"} as you. Check the recipient npub and the exact text before approving.`,
			);
		}
		return deny(
			`elladex-agx is in draft mode, so Claude does not run \`agx ${sub}\`. Show the user the recipient npub, the exact text and the exact command (options first, then \`--\`, then the npub and the single-quoted text), and ask them to run it in their own terminal. Don't retry it another way. Only the user can switch the plugin to claude-sends: they ${MODE_SWITCH}. Never change that setting yourself.`,
		);
	}

	if (sub === "serve") {
		const forbidden = FORBIDDEN_SERVE_FLAGS.filter((f) =>
			hasOption(options, f),
		);
		const missing = REQUIRED_SERVE_FLAGS.filter(
			(f) => !hasOption(options, f),
		);
		if (forbidden.length > 0 || missing.length > 0) {
			const problems = [
				forbidden.length > 0 ? `it has ${forbidden.join(", ")}` : "",
				missing.length > 0 ? `it lacks ${missing.join(", ")}` : "",
			]
				.filter(Boolean)
				.join(" and ");
			return deny(
				`elladex-agx: \`agx serve\` must run exactly as the watch skill says (--no-reply --no-tasks --allowed-only --full-ids --no-color), never with --allow-all, --reply-any or --advertise; ${problems}. Use /elladex-agx:watch.`,
			);
		}
		if (hasOption(options, "--allow")) {
			return ask(
				"elladex-agx: `agx serve --allow` lets extra peers' messages reach Claude in full for this watch. Approve only if you passed --allow to /elladex-agx:watch yourself.",
			);
		}
		return null;
	}

	return null;
}

/** The `apiKey` config key in any case or spelling agx might accept
 * (`apiKey`, `APIKEY`, `api-key`, `api_key`), alone or as `apiKey=<value>`. */
function isApiKeyName(w) {
	return /^api[-_]?key(?:=|$)/i.test(w ?? "");
}

/** @returns {Verdict} */
function deny(reason) {
	return { decision: "deny", reason };
}

/** @returns {Verdict} */
function ask(reason) {
	return { decision: "ask", reason };
}

/** Pick the strongest verdict: deny > ask > none. */
function strongest(verdicts) {
	const denies = verdicts.filter((v) => v?.decision === "deny");
	if (denies.length > 0) {
		return deny(unique(denies.map((v) => v.reason)).join(" "));
	}
	const asks = verdicts.filter((v) => v?.decision === "ask");
	if (asks.length > 0) {
		return ask(unique(asks.map((v) => v.reason)).join(" "));
	}
	return null;
}

function unique(list) {
	return [...new Set(list)];
}

// ----------------------------------------------------------- key files

const KEY_FILES_REASON =
	"elladex-agx: this touches agx's private files (~/.agx or $AGX_HOME), which hold the secret key, the allowlist, and credentials.json with the `agx login` API key. Claude must never read, search, copy or edit them. Use `agx whoami` to see who agx is signed in as, `agx identity show` for the npub and /elladex-agx:allow for the allowlist. If a key from these files ever reached the chat, the user revokes it (`agx logout`, or Settings → API keys) and signs in again with `agx login`.";

const EXPORT_REASON =
	"elladex-agx: `agx identity export` prints the secret key. Claude must never run it. If the user needs the key, they run it in their own terminal.";

/** A `.agx` path segment, as in `~/.agx`, `$HOME/.agx/identity.json`, `.agx/`. */
const AGX_DIR_SEGMENT = /(^|[\\/\s'"=:~(,])\.agx(?=$|[\\/\s'"*?;&|)<>,])/;

/**
 * @param {string} text a command word, path or glob
 * @param {{ agxHome?: string, cwd?: string }} ctx
 */
function touchesKeyFiles(text, ctx) {
	if (!text) {
		return false;
	}
	const normalized = text.replace(/\\/g, "/");
	if (AGX_DIR_SEGMENT.test(normalized)) {
		return true;
	}
	if (/\$(\{?|env:)AGX_HOME/i.test(text)) {
		return true;
	}
	const home = ctx.agxHome?.replace(/\\/g, "/").replace(/\/+$/, "");
	if (home && home.length > 1) {
		if (normalized.includes(home)) {
			return true;
		}
		if (ctx.cwd && !isAbsolute(text) && !/\s/.test(text)) {
			const abs = resolve(ctx.cwd, text).replace(/\\/g, "/");
			if (abs === home || abs.startsWith(`${home}/`)) {
				return true;
			}
		}
	}
	return false;
}

// ------------------------------------------------------- the send mode

const MODE_REASON = `elladex-agx: only the user changes this plugin's send mode (send_mode). To change it, they ${MODE_SWITCH}. Claude never changes it, not with \`claude plugin\` commands, not by editing settings files, and not through another tool.`;

/** `.claude/settings*.json` at any level, and managed settings files. */
const CLAUDE_SETTINGS_FILE =
	/(^|[\\/])\.claude[\\/]settings[^\\/]*\.json$|(^|[\\/])managed-settings[^\\/]*\.json$|[\\/]managed-settings\.d[\\/]/;

/**
 * Settings text that could change the send mode or switch this plugin (and so
 * this guard) off: its options and enabled flag are keyed by `elladex-agx@…`,
 * and `disableAllHooks` turns every hook off. Other plugins' options
 * (`pluginConfigs` entries that don't name elladex-agx) are left alone.
 */
const MODE_TEXT = /send_mode|claude-sends|elladex-agx|disableAllHooks/i;

/** JSON may spell a key with `\u` escapes (`elladex\u002dagx`); read it as JSON would. */
function unescapeJson(text) {
	return text.replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) =>
		String.fromCharCode(Number.parseInt(hex, 16)),
	);
}

function mentionsModeText(text) {
	return MODE_TEXT.test(text) || MODE_TEXT.test(unescapeJson(text));
}

function isClaudeSettings(path) {
	return CLAUDE_SETTINGS_FILE.test(path.trim().replace(/['"]/g, ""));
}

/** The current text of a file, or "" when it can't be read. */
function currentText(path, cwd) {
	try {
		const home = homedir();
		let p = path.replace(/^~(?=$|[\\/])/, home);
		if (!isAbsolute(p) && cwd) {
			p = resolve(cwd, p);
		}
		return readFileSync(p, "utf8");
	} catch {
		return "";
	}
}

// ------------------------------------------- switching the guard off

/** This plugin's own directory (the installed copy the hook runs from). */
const PLUGIN_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..").replace(
	/\\/g,
	"/",
);

const GUARD_OFF_REASON = `elladex-agx: this would turn off the plugin's guard, and with it draft mode, from the next session on. Only the user does that: /plugin in Claude Code, or \`claude plugin disable elladex-agx@ellaworks\` in their own terminal. Claude never disables, uninstalls or edits this plugin, its marketplace or its hook.`;

/**
 * `claude plugin disable|uninstall|remove` naming elladex-agx (or every
 * plugin), and `claude plugin marketplace remove ellaworks`.
 */
function turnsGuardOff(argv) {
	const p = argv.findIndex((w) => w === "plugin" || w === "plugins");
	if (p < 1 || !argv.slice(0, p).some((w) => /claude/i.test(basename(w)))) {
		return false;
	}
	const rest = argv.slice(p + 1);
	if (["disable", "uninstall", "remove", "rm"].includes(rest[0] ?? "")) {
		return rest.some(
			(w) =>
				/(^|@)elladex-agx(@|$)|^elladex-agx@/i.test(w) ||
				w === "-a" ||
				w === "--all",
		);
	}
	return (
		rest[0] === "marketplace" &&
		["remove", "rm"].includes(rest[1] ?? "") &&
		rest.slice(2).some((w) => /^ellaworks$/i.test(w))
	);
}

/**
 * This plugin's installed files, anything of elladex-agx's in Claude Code's
 * plugin directory, and that directory's registry files
 * (installed_plugins.json, known_marketplaces.json, …).
 */
function isGuardFile(path, cwd) {
	if (!path) {
		return false;
	}
	const home = homedir().replace(/\\/g, "/");
	let p = path.trim().replace(/['"]/g, "").replace(/\\/g, "/");
	p = p.replace(/^(~|\$HOME|\$\{HOME\})(?=$|\/)/, home);
	if (!isAbsolute(p) && cwd) {
		p = resolve(cwd, p).replace(/\\/g, "/");
	}
	if (isUnder(p, PLUGIN_ROOT)) {
		return true;
	}
	const plugins = `${home}/.claude/plugins`;
	if (!isUnder(p, plugins)) {
		return false;
	}
	const rel = p.slice(plugins.length + 1);
	return /(^|\/)elladex-agx(\/|$)/.test(rel) || /^[^/]+\.json$/.test(rel);
}

/** Programs that change or remove the files named in their arguments. */
const MUTATORS = new Set([
	"rm",
	"rmdir",
	"unlink",
	"mv",
	"cp",
	"ln",
	"install",
	"rsync",
	"sed",
	"perl",
	"tee",
	"truncate",
	"chmod",
	"chown",
	"dd",
	"touch",
]);

/** Everything a Write, Edit or MultiEdit call would put in or take out. */
function editedText(toolInput) {
	const parts = [
		toolInput.content,
		toolInput.old_string,
		toolInput.new_string,
	];
	if (Array.isArray(toolInput.edits)) {
		for (const edit of toolInput.edits) {
			parts.push(edit?.old_string, edit?.new_string);
		}
	}
	return parts.filter((p) => typeof p === "string").join("\n");
}

// ------------------------------------------------- text, not commands

/** Programs that search text: their pattern argument is text, not a path. */
const GREP_TOOLS = new Set([
	"grep",
	"egrep",
	"fgrep",
	"rg",
	"ag",
	"ack",
	"ugrep",
]);
/** Search options that take a separate value (which is not the pattern). */
const GREP_VALUE_OPTIONS = new Set([
	"-A",
	"-B",
	"-C",
	"-m",
	"-f",
	"-g",
	"-t",
	"-T",
	"-M",
	"-j",
	"--after-context",
	"--before-context",
	"--context",
	"--max-count",
	"--file",
	"--glob",
	"--iglob",
	"--type",
	"--type-not",
	"--include",
	"--exclude",
	"--exclude-dir",
	"--max-columns",
	"--threads",
	"--sort",
	"--sortr",
]);
/** git subcommands that only record or show text. */
const GIT_TEXT_SUBCOMMANDS = new Set([
	"commit",
	"tag",
	"notes",
	"log",
	"show",
	"diff",
	"status",
	"add",
	"blame",
]);
/** Options whose value is prose: `git commit -m`, `gh pr create --body`. */
const GIT_MESSAGE_OPTIONS = new Set(["-m", "--message"]);
const GH_MESSAGE_OPTIONS = new Set([
	"-b",
	"--body",
	"-t",
	"--title",
	"-n",
	"--notes",
]);
/** Options whose value names a workspace package rather than running it. */
const PACKAGE_FILTER_OPTIONS = new Set(["--filter", "-F", "--workspace", "-w"]);

/**
 * Which words of a simple command are prose or a search pattern, and whether
 * the command only prints, searches or records text, so that `agx send`
 * appearing in its arguments is something it mentions, not something it runs.
 *
 * @param {string[]} argv
 * @returns {{ textOnly: boolean, data: Set<number> }}
 */
function textArguments(argv) {
	/** @type {Set<number>} */
	const data = new Set();
	let p = 0;
	while (
		p < argv.length &&
		(isAssignment(argv[p]) || SHELL_KEYWORDS.has(argv[p]))
	) {
		p += 1;
	}
	const name = basename(argv[p] ?? "");
	if (name === "echo" || name === "printf") {
		return { textOnly: true, data };
	}
	if (GREP_TOOLS.has(name)) {
		markPatterns(argv, p + 1, data);
		return { textOnly: true, data };
	}
	if (name === "git") {
		const j = skipOptions(
			argv,
			p + 1,
			new Set(["-C", "-c", "--git-dir", "--work-tree", "--namespace"]),
		);
		if (argv[j] === "grep") {
			markPatterns(argv, j + 1, data);
			return { textOnly: true, data };
		}
		if (GIT_TEXT_SUBCOMMANDS.has(argv[j] ?? "")) {
			markMessages(argv, j + 1, GIT_MESSAGE_OPTIONS, data);
			return { textOnly: true, data };
		}
	}
	if (
		name === "gh" &&
		["pr", "issue", "release"].includes(argv[p + 1] ?? "")
	) {
		markMessages(argv, p + 2, GH_MESSAGE_OPTIONS, data);
		return { textOnly: true, data };
	}
	return { textOnly: false, data };
}

/** Mark a grep-like command's pattern arguments: every `-e` value, or else
 * the first positional word. The rest (paths, `-f` files) stay checked. */
function markPatterns(argv, start, data) {
	let explicit = false;
	let first = -1;
	for (let k = start; k < argv.length; k += 1) {
		const a = argv[k];
		if (a === "--") {
			if (first === -1 && k + 1 < argv.length) {
				first = k + 1;
			}
			break;
		}
		if (a === "--regexp" || /^-[A-Za-z]*e$/.test(a)) {
			data.add(k + 1);
			explicit = true;
			k += 1;
			continue;
		}
		if (/^(-e|--regexp=)./.test(a)) {
			data.add(k);
			explicit = true;
			continue;
		}
		if (a.startsWith("-") && a !== "-") {
			if (GREP_VALUE_OPTIONS.has(a)) {
				k += 1;
			}
			continue;
		}
		if (first === -1) {
			first = k;
		}
	}
	if (!explicit && first !== -1) {
		data.add(first);
	}
}

/** Mark the values of message options (`-m <text>`, `--body=<text>`). */
function markMessages(argv, start, options, data) {
	for (let k = start; k < argv.length; k += 1) {
		const a = argv[k];
		const long = a.split("=")[0];
		if (options.has(a)) {
			data.add(k + 1);
			k += 1;
		} else if (a.startsWith("--") && a.includes("=") && options.has(long)) {
			data.add(k);
		} else if (options.has("-m") && /^-m./.test(a)) {
			data.add(k);
		}
	}
}

// ------------------------------------------------ what a heredoc feeds

/** Interpreters that run a script read from standard input. */
function isInterpreter(name) {
	return (
		JS_RUNTIMES.has(name) ||
		/^(python[\d.]*|ruby|perl|php|lua|osascript|tclsh|Rscript|pwsh|powershell)$/.test(
			name,
		)
	);
}

/** ssh options that take a separate value. */
const SSH_VALUE_OPTIONS = new Set([
	"-b",
	"-c",
	"-D",
	"-E",
	"-e",
	"-F",
	"-I",
	"-i",
	"-J",
	"-L",
	"-l",
	"-m",
	"-O",
	"-o",
	"-p",
	"-Q",
	"-R",
	"-S",
	"-W",
	"-w",
]);

/**
 * True when a here-document body becomes shell commands: the command reading
 * it is a shell with no `-c` string and no script file (or with `-s`), or
 * `ssh host` with no remote command.
 *
 * @param {string[]} argv
 */
function feedsShell(argv) {
	for (let k = 0; k < argv.length; k += 1) {
		const name = basename(argv[k]);
		if (name === "ssh") {
			const j = skipOptions(argv, k + 1, SSH_VALUE_OPTIONS);
			if (argv.length - j <= 1) {
				return true;
			}
			continue;
		}
		if (!SHELLS.has(name)) {
			continue;
		}
		let readsStdin = true;
		for (let j = k + 1; j < argv.length; j += 1) {
			const a = argv[j];
			if (/^-[A-Za-z]*s[A-Za-z]*$/.test(a)) {
				return true;
			}
			if (/^-[A-Za-z]*c[A-Za-z]*$/.test(a)) {
				readsStdin = false;
				break;
			}
			if (["-o", "+o", "-O", "+O"].includes(a)) {
				j += 1;
				continue;
			}
			if (!a.startsWith("-") && !a.startsWith("+")) {
				readsStdin = false;
				break;
			}
		}
		if (readsStdin) {
			return true;
		}
	}
	return false;
}

/** True when a here-document body is a script for another interpreter. */
function feedsInterpreter(argv) {
	return argv.some((w) => isInterpreter(basename(w)));
}

// ------------------------------------------------- agx's environment

/**
 * The index of a simple command's program: after assignment prefixes, shell
 * keywords, `function name` (the head of `function f { read NAME; }`),
 * `builtin` / `command` (with their options) and zsh's `noglob` / `nocorrect`.
 *
 * @param {string[]} argv
 */
function programIndex(argv) {
	let p = 0;
	while (p < argv.length) {
		const w = argv[p];
		if (isAssignment(w) || SHELL_KEYWORDS.has(w)) {
			p += 1;
		} else if (w === "function" && argv[p + 2] === "{") {
			p += 2;
		} else if (
			w === "builtin" ||
			w === "command" ||
			w === "noglob" ||
			w === "nocorrect"
		) {
			p += 1;
			while (argv[p]?.startsWith("-")) {
				p += 1;
			}
		} else {
			break;
		}
	}
	return p;
}

/**
 * What a shell's brace expansion makes of `word`, as far as `name` goes:
 * "set" when some expansion starts an assignment to it (`AGX_{HOME,X}=v` and
 * `{AGX_,X}HOME=v` both expand to `AGX_HOME=v`), "bare" when one is the name
 * itself (`export AGX_{HOME,X}`), null otherwise. The word is read once,
 * whatever its length, and never expanded: each brace group is tried
 * against the name where it stands. A word with white space was quoted, so
 * the shell doesn't expand it.
 *
 * @param {string} word
 * @param {string} name
 * @param {boolean} ignoreCase
 * @returns {"set" | "bare" | null}
 */
function braceSpells(word, name, ignoreCase) {
	if (!word.includes("{") || !word.includes(",") || /\s/.test(word)) {
		return null;
	}
	const target = ignoreCase ? name.toLowerCase() : name;
	const nodes = parseBraces(ignoreCase ? word.toLowerCase() : word);
	// A state is how much of the name has matched so far: 0…length, then
	// PLUS (`NAME+`, waiting for `=`) and SET (`NAME=`, `NAME+=` or `NAME[`
	// seen: whatever follows is the value).
	const PLUS = target.length + 1;
	const SET = target.length + 2;
	/** @param {number} state @param {string} c @returns {number} -1: no match */
	const step = (state, c) => {
		if (state === SET) {
			return SET;
		}
		if (state < target.length) {
			return c === target[state] ? state + 1 : -1;
		}
		if (state === PLUS) {
			return c === "=" ? SET : -1;
		}
		return c === "=" || c === "[" ? SET : c === "+" ? PLUS : -1;
	};
	/** @param {BraceNode[]} sequence @param {Set<number>} states */
	const walk = (sequence, states) => {
		let current = states;
		for (const node of sequence) {
			if (current.size === 0) {
				break;
			}
			if (typeof node !== "string") {
				const after = new Set();
				for (const alternative of node.alternatives) {
					for (const state of walk(alternative, current)) {
						after.add(state);
					}
				}
				current = after;
				continue;
			}
			for (let k = 0; k < node.length; k += 1) {
				if (current.size === 1 && current.has(SET)) {
					break;
				}
				const next = new Set();
				for (const state of current) {
					const moved = step(state, node[k]);
					if (moved !== -1) {
						next.add(moved);
					}
				}
				current = next;
				if (current.size === 0) {
					break;
				}
			}
		}
		return current;
	};
	const end = walk(nodes, new Set([0]));
	return end.has(SET) ? "set" : end.has(target.length) ? "bare" : null;
}

/**
 * @typedef {string | { alternatives: BraceNode[][] }} BraceNode
 */

/**
 * A word as literal text and brace groups, read in one pass. A group needs
 * a comma and a closing brace; without either its braces are literal text,
 * and so is a `${…}` parameter expansion. Groups nest up to 32 deep.
 *
 * @param {string} text
 * @returns {BraceNode[]}
 */
function parseBraces(text) {
	/** @type {{ alternatives: BraceNode[][], parameter: boolean }[]} */
	const stack = [{ alternatives: [[]], parameter: false }];
	const top = () => stack[stack.length - 1];
	/** @param {BraceNode} node append to the alternative being read */
	const append = (node) => {
		const sequence = top().alternatives[top().alternatives.length - 1];
		const last = sequence.length - 1;
		if (typeof node === "string" && typeof sequence[last] === "string") {
			sequence[last] += node;
		} else {
			sequence.push(node);
		}
	};
	/** Put a group back as the text it was: `{a,b`, or `{a}`. */
	const appendLiteral = (group, closed) => {
		append("{");
		group.alternatives.forEach((sequence, k) => {
			if (k > 0) {
				append(",");
			}
			sequence.forEach(append);
		});
		if (closed) {
			append("}");
		}
	};
	for (let i = 0; i < text.length; i += 1) {
		const c = text[i];
		if (c === "{" && stack.length <= 32) {
			stack.push({ alternatives: [[]], parameter: text[i - 1] === "$" });
		} else if (c === "," && stack.length > 1 && !top().parameter) {
			top().alternatives.push([]);
		} else if (c === "}" && stack.length > 1) {
			const group = /** @type {typeof stack[number]} */ (stack.pop());
			if (group.alternatives.length > 1) {
				append({ alternatives: group.alternatives });
			} else {
				appendLiteral(group, true);
			}
		} else {
			append(c);
		}
	}
	while (stack.length > 1) {
		appendLiteral(/** @type {typeof stack[number]} */ (stack.pop()), false);
	}
	return stack[0].alternatives[0];
}

/** Builtins that declare, export or set the variables named in their
 * arguments, even with no `=value` (`export NAME` exports a value set some
 * other way). csh's `setenv NAME value` too. */
const DECLARERS = new Set([
	"export",
	"declare",
	"typeset",
	"local",
	"readonly",
	"integer",
	"float",
	"setenv",
]);
/** Builtins that read a value into the variables named in their arguments. */
const READERS = new Set(["read", "mapfile", "readarray", "getopts", "vared"]);
/** Loops that assign their first argument (`for NAME in …`). */
const LOOPS = new Set(["for", "select", "foreach"]);
/** PowerShell cmdlets (and aliases) that write, copy or rename an `env:`
 * drive item. */
const PS_ITEM_WRITERS =
	/^(?:set-item|new-item|set-content|add-content|copy-item|rename-item|move-item|si|ni|ac|sc|cpi|rni|mi)$/i;

/**
 * Every value one simple command gives environment variable `name`, with
 * null for a value the guard can't read. Empty when it doesn't set `name`.
 *
 * Read: `NAME=v` and `NAME+=v` as a word (an assignment prefix, `env`,
 * `export`, `declare -x`) or inside one (a quoted script), PowerShell's
 * `$env:NAME = v`, `${env:NAME} = v` and `??=`, and `${NAME:=v}`. Not read
 * (null): `+=`, an array element, a PowerShell value with more after it
 * (`'a' + 'b'`), and every way to set a variable without `NAME=`: `export`,
 * `declare`, `typeset`, `local`, `readonly` or `setenv` naming it; `read`,
 * `mapfile`, `getopts` or `printf -v` / `print -v` into it; `for NAME in`;
 * fish's `set NAME`; a nameref to it (`declare -n r=NAME`, which the word
 * `r=NAME` gives away); `launchctl setenv NAME`; `tmux setenv NAME`; `setx
 * NAME` and the registry's Environment key; a PowerShell `Env:` drive
 * write; and another language's environment table indexed by the name
 * (`os.environ["NAME"] = v`). A reference (`[ "$NAME" = x ]`), `unset NAME`
 * and `env -u NAME` are not writes.
 *
 * @param {string[]} live the command's words that aren't prose or patterns
 * @param {string} name
 * @param {boolean} [ignoreCase] match POSIX spellings in any case (true for
 *   agx's own names; HOME is matched exactly). PowerShell spellings always
 *   ignore case, as Windows does.
 * @returns {(string | null)[]}
 */
function envSets(live, name, ignoreCase = true) {
	// The name spelled by brace expansion: `AGX_{HOME,X}=v` sets it (to a
	// value the guard doesn't read), `export AGX_{HOME,X}` names it.
	const spelled = live.map((w) => braceSpells(w, name, ignoreCase));
	// Every other spelling has the name in it: skip the commands that don't
	// (nearly all of them) before building any pattern.
	const needle = name.toLowerCase();
	if (
		!spelled.includes("bare") &&
		!live.some((w) => w.toLowerCase().includes(needle))
	) {
		return spelled.includes("set") ? [null] : [];
	}
	const f = ignoreCase ? "i" : "";
	const sub = "(?:\\[[^\\]]*\\])?";
	/** @type {(string | null)[]} */
	const values = spelled.includes("set") ? [null] : [];

	// `NAME=v` as a whole word: the rest of the word is the value.
	const word = new RegExp(`^${name}(${sub})(\\+)?=`, f);
	/** @type {string[]} */
	const rest = [];
	for (const w of live) {
		const m = word.exec(w);
		if (m) {
			values.push(m[1] || m[2] ? null : w.slice(m[0].length));
		} else {
			rest.push(w);
		}
	}
	const text = rest.join(" ");
	// PowerShell: `$env:NAME = v`. The value must end the statement; `+ …`
	// after it (or a `(…)` call) makes it unreadable.
	const ps = new RegExp(
		`\\$(?:env:${name}|\\{env:${name}\\})\\s*(\\?\\?|\\+)?=(?!=)\\s*([^\\s;&|'"]*)`,
		"gi",
	);
	for (const m of text.matchAll(ps)) {
		const after = text.slice(m.index + m[0].length);
		const ends = /^\s*(?:$|[;&|\n])/.test(after);
		values.push(m[1] === "+" || !ends ? null : m[2]);
	}
	// POSIX inside a word (`bash -c '… NAME=v …'`): a value that runs into a
	// quote is concatenated, so unreadable. `${NAME=v}` is read below; a `{`
	// with no `$` is PowerShell's `@{NAME='v'}` (`Start-Process -Environment`).
	const sh = new RegExp(
		`(?<![A-Za-z0-9_$:])(?<!\\$\\{)${name}(${sub})\\s*(\\?\\?|\\+)?=(?!=)\\s*([^\\s;&|'"]*)(['"])?`,
		`g${f}`,
	);
	for (const m of text.matchAll(sh)) {
		values.push(m[1] || m[2] === "+" || m[4] ? null : m[3]);
	}
	// Another language's environment table, indexed by the name:
	// `os.environ["NAME"] = v`, `process.env["NAME"] = v`, `ENV["NAME"] = v`,
	// perl's `$ENV{NAME} = v`, .NET's `$psi.Environment['NAME'] = v`.
	const indexed = new RegExp(
		`(?<!\\$)[\\[{]\\s*['"]?${name}['"]?\\s*[\\]}]\\s*(?:\\?\\?|\\+)?=(?!=)`,
		f,
	);
	if (indexed.test(text)) {
		values.push(null);
	}
	// `${NAME=v}`, `${NAME:=v}`, zsh's `${NAME::=v}`.
	const expansion = new RegExp(`\\$\\{${name}${sub}:{0,2}=([^}]*)`, f);
	for (const w of live) {
		const m = expansion.exec(w);
		if (m) {
			values.push(m[1]);
		}
	}

	const named = new RegExp(`^${name}${sub}$`, f);
	const p = programIndex(live);
	const program = basename(live[p] ?? "");
	const args = live.slice(p + 1);
	const isName = (w) =>
		named.test(w ?? "") ||
		braceSpells(w ?? "", name, ignoreCase) === "bare";
	// zsh's `read NAME?prompt` reads into NAME and shows the rest as a prompt.
	const prompted = new RegExp(`^${name}${sub}\\?`, f);
	const setsByName =
		((DECLARERS.has(program) || READERS.has(program)) &&
			args.some((w) => !w.startsWith("-") && isName(w))) ||
		(READERS.has(program) && args.some((w) => prompted.test(w))) ||
		((program === "printf" || program === "print") &&
			args.some(
				(w, k) =>
					(/^-[A-Za-z]*v$/.test(w) && isName(args[k + 1])) ||
					isName(/^-[A-Za-z]*v(.+)$/.exec(w)?.[1]),
			)) ||
		(LOOPS.has(program) && isName(args[0])) ||
		// fish: `set -gx NAME v`; `set -e` erases and `set -q` only tests.
		(program === "set" &&
			!args.some((w) => /^(?:-[A-Za-z]*[eq][A-Za-z]*|--erase|--query)$/.test(w)) &&
			isName(args.find((w) => !/^[-+]/.test(w)))) ||
		// `setx NAME v`, also behind `cmd /c`.
		live.some(
			(w, k) =>
				/^setx(?:\.exe)?$/i.test(basename(w)) &&
				live
					.slice(k + 1)
					.some((a) => new RegExp(`^${name}$`, "i").test(a)),
		) ||
		(program === "launchctl" &&
			args.includes("setenv") &&
			args.slice(args.indexOf("setenv") + 1).some(isName)) ||
		// tmux hands its environment to every window it opens later.
		(program === "tmux" &&
			args.some((w) => w === "setenv" || w === "set-environment") &&
			args.some(isName)) ||
		writesEnvRegistry(live, name) ||
		// A nameref: `declare -n r=NAME` (or `r=NAME` after `declare -n r`).
		live.some((w) =>
			new RegExp(`^[A-Za-z_][A-Za-z0-9_]*=${name}${sub}$`, f).test(w),
		) ||
		writesEnvDrive(program, args, name);
	if (setsByName) {
		values.push(null);
	}
	return values;
}

/**
 * PowerShell writing an `env:` drive item: `Set-Item Env:\NAME v`,
 * `New-Item -Path Env: -Name NAME -Value v`, `Rename-Item Env:\X NAME`.
 * (The PowerShell tool's backslashes arrive as `/`.)
 *
 * @param {string} program
 * @param {string[]} args
 * @param {string} name
 */
function writesEnvDrive(program, args, name) {
	if (!PS_ITEM_WRITERS.test(program)) {
		return false;
	}
	const plain = args.map((w) => w.replace(/^-\w+:/, ""));
	const item = new RegExp(`^(?:env:[\\\\/]?)?${name}$`, "i");
	return (
		plain.some((w) => /^env:/i.test(w)) && plain.some((w) => item.test(w))
	);
}

/**
 * Windows keeps a user's (and the machine's) environment in the registry,
 * which is what `setx` writes: `reg add HKCU\Environment /v NAME /d v`,
 * `Set-ItemProperty -Path HKCU:\Environment -Name NAME -Value v`.
 *
 * @param {string[]} live
 * @param {string} name
 */
function writesEnvRegistry(live, name) {
	const item = new RegExp(`^(?:-\\w+:)?${name}$`, "i");
	return (
		live.some((w) => /(?:^|[\\/:])Environment$/i.test(w)) &&
		live.some((w) => REGISTRY_WRITERS.test(basename(w))) &&
		live.some((w) => item.test(w))
	);
}

/** `reg add`, and PowerShell's cmdlets (and alias) that write a registry
 * value. */
const REGISTRY_WRITERS = /^(?:reg(?:\.exe)?|(?:set|new)-itemproperty|sp)$/i;

/** The variables that decide where agx keeps its files (its directory, and
 * the profile's directory inside it), which key it uses and which server it
 * talks to. HOME is matched exactly; the others in any case, as Windows reads
 * them. `bare` matches the name as a whole word (`{NAME}` too: `exec {NAME}<
 * file` puts a descriptor number in NAME), and `mention` the name as an
 * identifier of its own inside a longer word, not as a shell reference
 * (`$NAME`, which other rules judge). */
const GUARDED_NAMES = [
	["AGX_HOME", "i"],
	["AGX_PROFILE", "i"],
	["AGX_API_KEY", "i"],
	["AGX_API_URL", "i"],
	["HOME", ""],
	["USERPROFILE", "i"],
].map(([name, flags]) => ({
	name,
	bare: new RegExp(`^\\{?${name}(?:\\[[^\\]]*\\])?\\}?$`, flags),
	mention: new RegExp(`(?<![A-Za-z0-9_$])${name}(?![A-Za-z0-9_])`, flags),
}));

/** Commands that name a variable without giving it a value: they unset it,
 * print it or test it. */
const NAME_READERS = new Set([
	"unset",
	"printenv",
	"env",
	"test",
	"[",
	"[[",
	"case",
	"set",
	"launchctl",
]);

/**
 * True when this simple command turns on the shell's allexport option, under
 * which every variable a later command sets, in any way, is exported: `set
 * -a`, `set -o allexport`, zsh's `setopt allexport` and `emulate -o
 * allexport`, `bash -a -c …`.
 *
 * @param {string[]} live
 */
function turnsOnAllExport(live) {
	const p = programIndex(live);
	const program = basename(live[p] ?? "");
	const args = live.slice(p + 1);
	if (args.some((w) => /^all_?export$/i.test(w))) {
		return true;
	}
	return (
		(program === "set" || SHELLS.has(program)) &&
		args.some((w) => /^-[A-Za-z]*a[A-Za-z]*$/.test(w))
	);
}

/**
 * The guarded variables this simple command names as a bare argument
 * (`sysread AGX_HOME`, `zstyle -s :x y AGX_HOME`, `wait -p AGX_HOME`). Under
 * allexport any builtin that fills a variable exports it, and the guard can't
 * list them all, so there the bare name counts as setting it. Without
 * allexport such a variable stays in the shell: agx never sees it unless a
 * command exports it, and every way to export it by name is a write `envSets`
 * already reads.
 *
 * @param {string[]} live
 * @returns {string[]}
 */
function bareNames(live) {
	const p = programIndex(live);
	if (NAME_READERS.has(basename(live[p] ?? ""))) {
		return [];
	}
	const args = live.slice(p + 1);
	return GUARDED_NAMES.filter(({ bare }) =>
		args.some((w) => bare.test(w)),
	).map(({ name }) => name);
}

/**
 * The guarded variables a word names as an identifier of its own:
 * `os.environ["NAME"]`, `{ env: { NAME: v } }`, `putenv("NAME", v)`.
 *
 * @param {string} word
 * @returns {string[]}
 */
function namesIn(word) {
	return GUARDED_NAMES.filter(({ mention }) => mention.test(word)).map(
		({ name }) => name,
	);
}

/** `agx`, or its npm package, as a word of a script in another language:
 * `subprocess.run(["agx", "login"])`, `execSync("npx @nostr-agx/cli login")`.
 * Not a directory or a longer name (`tools/agx/build.py`, `agx-core`). */
const AGX_IN_SCRIPT =
	/(?<![A-Za-z0-9_-])agx(?:\.[cm]?[jt]s)?(?![A-Za-z0-9_\-/.])|@(?:nostr-agx|agx)\/cli/;

/** A word that keeps agx under another name: `A=agx`, `alias a=agx`,
 * `AGX=/opt/bin/agx`. */
function namesAgx(w) {
	const value = isAssignment(w) ? w.slice(w.indexOf("=") + 1) : "";
	return isAgxEntry(value) || isAgxPackage(value);
}

/** Interpreters whose script the guard can't parse, and shells with a syntax
 * of their own (nushell's `with-env { NAME: v }`). A POSIX shell's `-c`
 * string, and PowerShell's, is parsed as a command line instead. */
function isScriptLanguage(name) {
	return (
		(isInterpreter(name) && !/^(?:pwsh|powershell)$/.test(name)) ||
		/^(?:nu|xonsh|elvish)$/.test(name)
	);
}

/**
 * Verdicts on the agx environment a simple command sets up, and on an API
 * key written into it or read out of it. `findAgx` skips assignments, so
 * they are checked here, for every command and not just agx: `export
 * AGX_API_URL=…` changes the agx calls that follow it.
 *
 * @param {string[]} live the command's words that aren't prose or patterns
 * @returns {Verdict[]}
 */
function envVerdicts(live) {
	/** @type {Verdict[]} */
	const out = [];
	if (
		envSets(live, "AGX_API_KEY").length > 0 ||
		live.some((w) => ELA_KEY.test(w))
	) {
		out.push(deny(API_KEY_REASON));
	}
	if (exposesApiKey(live)) {
		out.push(deny(API_KEY_READ_REASON));
	}
	if (envSets(live, "AGX_HOME").length > 0) {
		out.push(deny(AGX_HOME_REASON));
	}
	const profile = profileVerdict(envSets(live, "AGX_PROFILE"));
	if (profile) {
		out.push(profile);
	}
	const urls = envSets(live, "AGX_API_URL").filter(
		(v) => !isDefaultApiBase(v),
	);
	if (urls.length > 0) {
		out.push(ask(apiBaseReason(urls)));
	}
	return out;
}

/**
 * True when this simple command moves the home directory, where agx keeps
 * `.agx` when AGX_HOME is unset: HOME, or USERPROFILE on Windows.
 *
 * @param {string[]} live
 */
function movesHome(live) {
	return (
		envSets(live, "HOME", false).length > 0 ||
		envSets(live, "USERPROFILE").length > 0
	);
}

/** Shell builtins that read a file's assignments into the shell itself. */
const SOURCE_BUILTINS = new Set(["source", "."]);
/** PowerShell's: a module runs in the session that imports it. */
const PS_IMPORT = /^(?:import-module|ipmo)$/i;
/** Programs that run a command with variables loaded from a file or a
 * directory, on their own or behind a package runner (`npx dotenv-cli -e f
 * -- agx login`, `pnpm exec dotenv -- agx login`). */
const ENV_FILE_LOADERS = new Set([
	"dotenv",
	"dotenv-cli",
	"dotenvx",
	"env-cmd",
	"direnv",
	"envdir",
]);
/** Variables that make a shell or node read a file, or run code, before the
 * command: `BASH_ENV=f bash -c …`, `ENV=f sh -ic …`, `ZDOTDIR=d zsh -c …`,
 * `XDG_CONFIG_HOME=d fish -c …`, `NODE_OPTIONS=--env-file=f agx …`. */
const LOADER_VARIABLES = [
	"BASH_ENV",
	"ENV",
	"ZDOTDIR",
	"XDG_CONFIG_HOME",
	"NODE_OPTIONS",
];
/** node options that run a module before the script, inside agx's process. */
const NODE_PRELOAD =
	/^(?:-r|--require|--import|--loader|--experimental-loader)(?:=|$)/;

/**
 * The program a simple command runs, by name and without a version: its own
 * program, or the one a package runner starts (`npx dotenv-cli@7 …`, `pnpm
 * exec dotenv …`, `yarn dotenv …`, `corepack pnpm dlx env-cmd …`). `npm
 * install dotenv` runs `install`, not dotenv.
 *
 * @param {string[]} live
 * @param {number} p the index of the command's own program
 */
function runnerTarget(live, p) {
	let i = p;
	if (basename(live[i] ?? "") === "corepack") {
		i += 1;
	}
	const runner = basename(live[i] ?? "");
	if (["npx", "pnpx", "bunx"].includes(runner)) {
		i = skipOptions(live, i + 1, new Set(["-p", "--package"]));
	} else if (["pnpm", "npm", "yarn", "bun"].includes(runner)) {
		const values = new Set(["--filter", "-F", "-C", "--dir", "--cwd"]);
		i = skipOptions(live, i + 1, values);
		if (["exec", "x", "dlx", "run"].includes(live[i] ?? "")) {
			i = skipOptions(live, i + 1, values);
		}
	}
	return basename(live[i] ?? "").replace(/@.*$/, "");
}

/**
 * True when this simple command loads environment variables the guard can't
 * read: from a file (`source f`, `. f`, dotenv, `--env-file`, a shell's
 * `--rcfile` or BASH_ENV, node's NODE_OPTIONS or `--require`), or computed
 * at run time (`env $(cat f) …`, `export $(cat f)`, `eval "$(…)"`, `xargs
 * env`, a variable whose name is computed: `read "$k"`, `printf -v "$k"`,
 * PowerShell's `Set-Item "Env:$k"`).
 *
 * @param {string[]} live
 * @param {boolean} textOnly the command only prints, searches or records text
 */
function loadsEnvironment(live, textOnly) {
	if (
		live.some((w) =>
			/^--(?:env-file(?:-if-exists)?|rcfile|init-file)(?:=|$)|^--env=/.test(
				w,
			),
		)
	) {
		return true;
	}
	const p = programIndex(live);
	const program = basename(live[p] ?? "");
	const args = live.slice(p + 1);
	if (SOURCE_BUILTINS.has(program) || PS_IMPORT.test(program)) {
		return true;
	}
	if (!textOnly && ENV_FILE_LOADERS.has(runnerTarget(live, p))) {
		return true;
	}
	if (LOADER_VARIABLES.some((v) => envSets(live, v, false).length > 0)) {
		return true;
	}
	if (
		live.some((w) => JS_RUNTIMES.has(basename(w))) &&
		live.some((w) => NODE_PRELOAD.test(w))
	) {
		return true;
	}
	if (program === "xargs" && args.some((w) => basename(w) === "env")) {
		return true;
	}
	// A variable whose name is computed: `read "$k"`, `printf -v "$k" …`.
	if (
		READERS.has(program) &&
		args.some((w) => !w.startsWith("-") && isDynamic(w))
	) {
		return true;
	}
	if (
		(program === "printf" || program === "print") &&
		args.some(
			(w, k) =>
				(/^-[A-Za-z]*v$/.test(w) && isDynamic(args[k + 1] ?? "")) ||
				isDynamic(/^-[A-Za-z]*v(.+)$/.exec(w)?.[1] ?? ""),
		)
	) {
		return true;
	}
	// PowerShell: `Set-Item "Env:$k" $v`, `New-Item -Path Env: -Name $k`.
	if (PS_ITEM_WRITERS.test(program)) {
		const plain = args.map((w) => w.replace(/^-\w+:/, ""));
		const drive = plain.some((w) => /^env:[\\/]?$/i.test(w));
		if (
			plain.some((w) => /^env:.*\$/i.test(w)) ||
			(drive && plain.some(isDynamic))
		) {
			return true;
		}
	}
	// `iex (…)`: the tokenizer splits the expression off at its parenthesis.
	if (PS_EVAL.test(program) && args.length === 0) {
		return true;
	}
	return (
		(program === "env" ||
			program === "eval" ||
			PS_EVAL.test(program) ||
			DECLARERS.has(program)) &&
		args.some((w) => isDynamic(w) && !isAssignment(w))
	);
}

/** Shell startup files: what is written there runs in every later shell,
 * Claude Code's own included. */
const SHELL_STARTUP_FILE =
	/(?:^|[\\/])(?:\.(?:zshenv|zshrc|zprofile|zlogin|bashrc|bash_profile|bash_login|bash_aliases|profile|kshrc|mkshrc|cshrc|tcshrc|login|xprofile|xsessionrc|envrc|pam_environment)|config\.fish|(?:env|config|login)\.nu|(?:Microsoft\.\w+_)?profile\.ps1)$|[\\/]etc[\\/](?:environment|zshenv|zshrc|zprofile|zlogin|bashrc|bash\.bashrc|profile|csh\.cshrc|csh\.login)$|[\\/](?:profile\.d|environment\.d|fish[\\/]conf\.d)[\\/][^\\/]+$/i;

function isShellStartupFile(path) {
	return SHELL_STARTUP_FILE.test(path.trim().replace(/['"]/g, ""));
}

/** `$AGX_API_KEY` or `${AGX_API_KEY…}`, but not `${#AGX_API_KEY}` (its
 * length) or `${AGX_API_KEY:+…}` (text only when set). */
const API_KEY_REF =
	/\$(?:AGX_API_KEY(?![A-Za-z0-9_])|\{AGX_API_KEY(?![A-Za-z0-9_])(?!:?\+))/;
/** PowerShell's `$env:AGX_API_KEY`. */
const PS_API_KEY_REF = /\$(?:env:AGX_API_KEY(?![A-Za-z0-9_])|\{env:AGX_API_KEY\})/i;
/** Commands that only test a value: `[ -n "$AGX_API_KEY" ]` prints nothing. */
const COMPARE_PROGRAMS = new Set(["[", "[[", "test", "case"]);
/** PowerShell cmdlets (and aliases) that print an `env:` drive item. */
const PS_ITEM_READERS =
	/^(?:get-item|gi|get-childitem|gci|dir|ls|get-content|gc|cat|type|get-itemproperty|gp|get-itempropertyvalue|gpv)$/i;

/**
 * True when this simple command prints or passes on an API key agx inherited
 * from the shell: `printenv AGX_API_KEY`, `echo $AGX_API_KEY`, `curl -H
 * "X-API-Key: $AGX_API_KEY"`, PowerShell's `Write-Output $env:AGX_API_KEY`
 * or `Get-Item Env:\AGX_API_KEY`. A test (`[ -n "$AGX_API_KEY" ] && echo
 * set`) is fine. A word with spaces may be a script another program runs
 * (`bash -c '…'`), so its own commands are judged instead.
 *
 * @param {string[]} argv
 * @param {number} [depth]
 */
function exposesApiKey(argv, depth = 0) {
	const p = programIndex(argv);
	const program = basename(argv[p] ?? "");
	const args = argv.slice(p + 1);
	if (program === "printenv" && args.includes("AGX_API_KEY")) {
		return true;
	}
	if (
		PS_ITEM_READERS.test(program) &&
		args.some((w) => /^(?:-\w+:)?env:[\\/]?AGX_API_KEY$/i.test(w))
	) {
		return true;
	}
	if (COMPARE_PROGRAMS.has(program)) {
		return false;
	}
	return argv.some((w, k) => {
		// A bare `$env:AGX_API_KEY` in program position is also how a
		// PowerShell condition (`if ($env:AGX_API_KEY) …`) tokenizes: let it be.
		if (!API_KEY_REF.test(w) && !(k > p && PS_API_KEY_REF.test(w))) {
			return false;
		}
		if (!/\s/.test(w) || depth >= 4) {
			return true;
		}
		return tokenize(w).commands.some((c) => exposesApiKey(c, depth + 1));
	});
}

/**
 * True when this simple command prints the whole environment (`env`,
 * `printenv`, `set`, `export -p`, `declare -x`, …), which shows an inherited
 * AGX_API_KEY along with everything else.
 *
 * @param {string[]} argv
 */
function dumpsEnvironment(argv) {
	const p = programIndex(argv);
	const program = basename(argv[p] ?? "");
	const args = argv.slice(p + 1);
	if (program === "set") {
		return args.length === 0;
	}
	if (program === "env" || program === "printenv") {
		return args.every((w) => w.startsWith("-") && !/^-[uiCS]/.test(w));
	}
	return (
		["export", "declare", "typeset"].includes(program) &&
		args.every((w) => /^-[A-Za-z]+$/.test(w))
	);
}

/**
 * PowerShell's `[Environment]::SetEnvironmentVariable('NAME', …)`, which the
 * tokenizer splits at its parentheses, checked on the command text instead.
 *
 * @param {string} text
 * @param {string} name
 */
function setsEnvironmentVariable(text, name) {
	return new RegExp(
		`SetEnvironmentVariable\\s*\\(\\s*['"]?${name}['"]?\\s*,`,
		"i",
	).test(text);
}

/**
 * True when the command text sets a variable under a name that is computed,
 * in forms the tokenizer splits at their parentheses: PowerShell's
 * `SetEnvironmentVariable($n, …)`, `SetEnvironmentVariable(('AGX_'+'HOME'),
 * …)` and `Set-Item ("Env:AGX_" + "HOME") v`, and zsh's `${(P)name::=v}`.
 * Every pattern here reads a bounded stretch of text, so a long command
 * line can't make it slow.
 *
 * @param {string} text
 */
function setsComputedVariable(text) {
	if (
		/SetEnvironmentVariable\s{0,16}\(\s{0,16}(?!['"]?[A-Za-z_][A-Za-z0-9_]{0,64}['"]?\s{0,16},)/i.test(
			text,
		)
	) {
		return true;
	}
	// zsh: `${(P)name::=v}`, the P among other flags.
	for (const m of text.matchAll(/\$\{\(([^)\s]{0,32})\)[^}\n]{0,256}=/g)) {
		if (m[1].includes("P")) {
			return true;
		}
	}
	// `(env:` or `("env:` opening an expression, after an item cmdlet in the
	// same statement.
	let seen = 0;
	for (const m of text.matchAll(/\(\s{0,16}['"]?env:/gi)) {
		seen += 1;
		if (seen > 16) {
			return true;
		}
		const before = text.slice(Math.max(0, m.index - 256), m.index);
		const statement = before.slice(
			Math.max(
				before.lastIndexOf(";"),
				before.lastIndexOf("|"),
				before.lastIndexOf("\n"),
			) + 1,
		);
		if (statement.split(/[\s&({]+/).some((w) => PS_ITEM_WRITERS.test(w))) {
			return true;
		}
	}
	return false;
}

/**
 * @param {string} text
 * @returns {Verdict[]}
 */
function setEnvironmentVariableVerdicts(text) {
	/** @type {Verdict[]} */
	const out = [];
	if (setsEnvironmentVariable(text, "AGX_API_KEY")) {
		out.push(deny(API_KEY_REASON));
	}
	if (setsEnvironmentVariable(text, "AGX_HOME")) {
		out.push(deny(AGX_HOME_REASON));
	}
	if (setsEnvironmentVariable(text, "AGX_PROFILE")) {
		out.push(ask(PROFILE_UNREAD_REASON));
	}
	if (setsEnvironmentVariable(text, "AGX_API_URL")) {
		out.push(ask(apiBaseReason([null])));
	}
	return out;
}

// ------------------------- the sign-in approval page and listing pages

const DEVICE_PAGE_REASON =
	"elladex-agx: this opens the Ellaworks sign-in approval page (/auth/device) with a tool Claude drives. Only a person approves an `agx login`: give the user the link and code that your own `agx login` printed, and let them open it in their own browser. Claude never opens, fills in or clicks that page.";

const LISTING_PAGE_REASON =
	"elladex-agx: this opens an Elladex listing's manage page (/elladex/listings/…) with a tool Claude drives. That page has the Publish button, and only a human organization admin may click Publish: making a listing public is the admin's confirmation, in their own browser. Approve only if you want Claude to look at the page; it must not click Publish, or edit, de-list or delete the listing. To publish, open the link yourself.";

/** MCP tool inputs that hold a URL to open (browser navigation tools). */
const URL_KEYS = new Set(["url", "uri", "href"]);

/**
 * True for the device sign-in page, `/auth/device` (with an optional locale
 * prefix and any query, such as `?code=…`), and the device endpoints under
 * `/api/auth/device/`, on any host, and for any page whose query carries one
 * of those as a value: a sign-in page sends a signed-in browser straight on
 * to its `redirectTo`. Repeated slashes count as one, since the server
 * redirects `//auth/device` to the page. A value with no scheme
 * (`app.ellaworks.ai/auth/device`) is read as https; one that starts with
 * `/` is a path.
 *
 * @param {string} value
 */
function isDeviceApprovalUrl(value) {
	return reachesPath(value, isDevicePath);
}

/**
 * True for an Elladex listing's manage page, `/elladex/listings/<id>` (with
 * an optional locale prefix, and anything under it), on any host, read the
 * same way as the approval page: directly, with repeated slashes, or as a
 * sign-in page's redirect (`/auth/login?redirectTo=/elladex/listings/l_7`).
 * The list of your listings, `/elladex/listings`, has no Publish button.
 *
 * @param {string} value
 */
function isListingManageUrl(value) {
	return reachesPath(value, isListingManagePath);
}

/**
 * True when `value`, read as a URL or a path, has a path `matches` accepts,
 * or carries one in its query, up to three redirects deep.
 *
 * @param {string} value
 * @param {(path: string) => boolean} matches
 * @param {number} [depth] how many query values deep this is
 */
function reachesPath(value, matches, depth = 0) {
	const v = value.trim();
	/** @type {URL | null} */
	let url = null;
	try {
		url = /^[a-z][a-z0-9+.-]*:/i.test(v)
			? new URL(v)
			: v.startsWith("/")
				? new URL(v, "https://relative.invalid")
				: new URL(`https://${v}`);
	} catch {
		// Not a URL: check the text before any query as a path.
	}
	const raw = v.split(/[?#]/)[0] ?? "";
	const path = url ? url.pathname : raw;
	let decoded = path;
	try {
		decoded = decodeURIComponent(path);
	} catch {
		// Keep the raw path: a malformed escape is checked as written.
	}
	// A value starting with `//` parses as a host; check its text as a path
	// too, failing closed.
	const paths = v.startsWith("/") ? [path, decoded, raw] : [path, decoded];
	if (paths.some(matches)) {
		return true;
	}
	if (!url || depth >= 3) {
		return false;
	}
	for (const [, inner] of url.searchParams) {
		if (inner && reachesPath(inner, matches, depth + 1)) {
			return true;
		}
	}
	return false;
}

/** A path with `\` as `/`, repeated slashes as one, no trailing slash, lower case. */
function cleanPath(path) {
	return path
		.replace(/\\/g, "/")
		.replace(/\/{2,}/g, "/")
		.replace(/\/+$/, "")
		.toLowerCase();
}

/** An optional locale segment before a page's path (`/en`, `/pt-br`). */
const LOCALE_PREFIX = "(?:\\/[a-z]{2}(?:-[a-z0-9]{2,4})?)?";

/** @param {string} path */
function isDevicePath(path) {
	const clean = cleanPath(path);
	return (
		new RegExp(`^${LOCALE_PREFIX}\\/auth\\/device$`).test(clean) ||
		/^\/api\/auth\/device(?:\/|$)/.test(clean)
	);
}

/** @param {string} path */
function isListingManagePath(path) {
	return new RegExp(`^${LOCALE_PREFIX}\\/elladex\\/listings\\/[^/]+`).test(
		cleanPath(path),
	);
}

// ---------------------------------------------------------------- decide

/** `agx … send|request` in text the parser could not split into commands. */
const AGX_SEND_TEXT =
	/(?:^|[\s/'"=(`;{,])(?:agx(?:\.[cm]?[jt]s)?|@(?:nostr-agx|agx)\/cli(?:@[^\s'"]*)?)['"]?\s(?:[^\n;&|]*?\s)?['"]?(send|request)\b(?![-./])/;
/** `agx … identity export` in such text. */
const AGX_EXPORT_TEXT =
	/(?:^|[\s/'"=(`;{,])agx(?:\.[cm]?[jt]s)?['"]?\s[^\n;&|]*?\bidentity\b[\s'"\\]+export\b/;

/**
 * Last line of defence for text that may run agx without the parser seeing a
 * clean agx argv: a string another program executes, or a script body.
 *
 * @param {string} text
 * @param {string} mode
 * @returns {Verdict[]}
 */
function scanText(text, mode) {
	/** @type {Verdict[]} */
	const out = [];
	if (AGX_EXPORT_TEXT.test(text)) {
		out.push(deny(EXPORT_REASON));
	}
	const match = AGX_SEND_TEXT.exec(text);
	if (match) {
		out.push(
			ask(
				mode === CLAUDE_SENDS
					? `elladex-agx: this looks like it runs \`agx ${match[1]}\` in a form the guard can't fully check. It would send an Agent Exchange message as you. Check the recipient npub and the exact text before approving.`
					: `elladex-agx: this looks like it runs \`agx ${match[1]}\` in a form the guard can't fully check. The plugin is in draft mode, so Claude should not send: decline, and run the command yourself if you want it sent.`,
			),
		);
	}
	return out;
}

/**
 * The agx entry or package words of an argv, wherever they sit: after a
 * wrapper the parser doesn't know (`ssh host agx send …`, `find … -exec agx
 * send …`, `script -q /dev/null agx send …`). An entry followed later by
 * `send` or `request` gets the send verdict even if the words between are
 * unexpected.
 *
 * @param {string[]} argv
 * @param {string} mode
 * @returns {(Verdict | null)[]}
 */
function agxAnywhere(argv, mode) {
	/** @type {(Verdict | null)[]} */
	const out = [];
	for (let k = 0; k < argv.length; k += 1) {
		if (
			!isAgxWord(argv[k]) ||
			PACKAGE_FILTER_OPTIONS.has(argv[k - 1] ?? "")
		) {
			continue;
		}
		const rest = argv.slice(k + 1);
		const verdict = decideAgx(rest, mode);
		if (verdict) {
			out.push(verdict);
			continue;
		}
		const verb = rest.find((w) => w === "send" || w === "request");
		if (verb) {
			out.push(decideAgx([verb], mode));
		}
	}
	return out;
}

/**
 * Analyze a shell command line. Exported for tests.
 *
 * @param {string} command
 * @param {string} mode
 * @param {{ agxHome?: string, cwd?: string, deadline?: number }} ctx `deadline`:
 *   when to stop reading and ask instead (default: BUDGET_MS from now)
 * @returns {Verdict | null}
 */
export function decideCommand(command, mode, ctx = {}) {
	/** @type {(Verdict | null)[]} */
	const verdicts = [];
	// Across the whole command line, nested scripts included: HOME and
	// loaded variables matter only to agx, and only within one line (the
	// Bash tool starts each call with a fresh environment).
	let runsAgx = false;
	let homeMoved = false;
	let envLoaded = false;
	let allExport = false;
	/** Guarded variables named as a bare argument: a write under allexport. */
	const bare = new Set();
	/** Guarded variables named in a script the guard can't parse. */
	const named = new Set();
	// Set when part of the command line goes unread: too many pieces, too
	// many agx words in one command, or out of time. It ends in a prompt.
	let unchecked = false;
	const deadline = ctx.deadline ?? Date.now() + BUDGET_MS;
	const outOfTime = () => Date.now() > deadline;
	const queue = [command];
	// Each piece is read once: a word such as `$(command -v agx)` holds
	// itself again when it is read as a command line.
	const seen = new Set(queue);
	const enqueue = (/** @type {string[]} */ ...texts) => {
		for (const text of texts) {
			if (!seen.has(text)) {
				seen.add(text);
				queue.push(text);
			}
		}
	};
	for (let n = 0; queue.length > 0; n += 1) {
		if (n >= MAX_TEXTS || outOfTime()) {
			unchecked = true;
			break;
		}
		const text = /** @type {string} */ (queue.shift());
		const { commands, nested, redirects, heredocs } = tokenize(text);
		enqueue(...nested);
		const mentionsMode = mentionsModeText(text);
		verdicts.push(...setEnvironmentVariableVerdicts(text));
		homeMoved ||=
			setsEnvironmentVariable(text, "HOME") ||
			setsEnvironmentVariable(text, "USERPROFILE");
		envLoaded ||= setsComputedVariable(text);

		for (const target of redirects) {
			if (touchesKeyFiles(target, ctx)) {
				verdicts.push(deny(KEY_FILES_REASON));
			}
			if (mentionsMode && isClaudeSettings(target)) {
				verdicts.push(deny(MODE_REASON));
			}
			if (isGuardFile(target, ctx.cwd)) {
				verdicts.push(deny(GUARD_OFF_REASON));
			}
		}

		// A heredoc is parsed as commands only when a shell reads it, now or
		// later: one fed to a shell, or one in a command line that names a
		// shell startup file (`cat >> ~/.zshenv <<EOF`, `tee -a ~/.bashrc
		// <<EOF`, `cat <<EOF | tee -a ~/.zshenv`). A body written to any other
		// file, or a commit message, is text.
		const namesStartup =
			redirects.some(isShellStartupFile) ||
			commands.some((argv) => argv.some(isShellStartupFile));
		for (const { argv, body } of heredocs) {
			if (feedsShell(argv) || namesStartup) {
				enqueue(body);
			} else if (feedsInterpreter(argv)) {
				if (touchesKeyFiles(body, ctx)) {
					verdicts.push(deny(KEY_FILES_REASON));
				}
				if (ELA_KEY.test(body)) {
					verdicts.push(deny(API_KEY_REASON));
				}
				if (agxWords(body) > MAX_AGX_WORDS) {
					unchecked = true;
				} else {
					verdicts.push(...scanText(body, mode));
				}
				// The script may set a guarded variable in its own language
				// and run agx itself: the guard can't follow it, so it asks.
				if (argv.some((w) => isScriptLanguage(basename(w)))) {
					for (const name of namesIn(body)) {
						named.add(name);
					}
					runsAgx ||= AGX_IN_SCRIPT.test(body);
				} else {
					// PowerShell reads its script as the PowerShell tool would.
					enqueue(body);
				}
			}
		}

		let dumpsEnv = false;
		let filtersForKey = false;
		for (const argv of commands) {
			if (outOfTime()) {
				unchecked = true;
				break;
			}
			const { textOnly, data } = textArguments(argv);
			const live = argv.filter((_, k) => !data.has(k));
			if (live.some((w) => touchesKeyFiles(w, ctx))) {
				verdicts.push(deny(KEY_FILES_REASON));
			}
			if (
				live.some((w) => /send_mode\s*=/i.test(w)) ||
				(mentionsMode && live.some(isClaudeSettings))
			) {
				verdicts.push(deny(MODE_REASON));
			}
			// AGX_API_KEY / AGX_HOME / AGX_API_URL and key literals, in every
			// word that isn't prose or a pattern: an echo argument counts, a grep
			// pattern or a commit message doesn't.
			verdicts.push(...envVerdicts(live));
			homeMoved ||= movesHome(live);
			envLoaded ||= loadsEnvironment(live, textOnly);
			allExport ||= turnsOnAllExport(live);
			// `env | grep -i agx`: the whole environment, searched for the key.
			dumpsEnv ||= dumpsEnvironment(argv);
			filtersForKey ||=
				GREP_TOOLS.has(basename(argv[programIndex(argv)] ?? "")) &&
				[...data].some((k) => /agx|api.?key|ela_/i.test(argv[k] ?? ""));

			const found = findAgx(argv);
			enqueue(...found.nested);
			for (const args of found.agx) {
				verdicts.push(decideAgx(args, mode));
			}
			// An agx word anywhere, or agx kept under another name for a
			// later command: `A=agx; "$A" whoami`, `alias a=agx`.
			runsAgx ||=
				found.agx.length > 0 ||
				(!textOnly &&
					argv.some(
						(w, k) =>
							(isAgxWord(w) || namesAgx(w)) &&
							!PACKAGE_FILTER_OPTIONS.has(argv[k - 1] ?? ""),
					));

			if (textOnly) {
				// What `echo` or `printf` writes into a shell startup file is a
				// command line a later shell runs.
				const p = programIndex(argv);
				if (
					namesStartup &&
					["echo", "printf"].includes(basename(argv[p] ?? ""))
				) {
					// Joined (`echo read NAME`) and one by one (`printf '%s\n'
					// 'read NAME' 'export NAME'`).
					enqueue(
						argv.slice(p + 1).join(" "),
						...argv.slice(p + 1).filter((w) => /\s/.test(w)),
					);
				}
				continue;
			}
			for (const name of bareNames(live)) {
				bare.add(name);
			}
			// A script in another language (`python3 -c`, `node -e`), or an
			// edit of a shell startup file (`sed -i … ~/.zshenv`): the guard
			// can't parse it, so naming a guarded variable there asks. Not
			// when the script is agx itself (`node …/agx.js search HOME`).
			const script =
				found.agx.length === 0 &&
				live.some((w) => isScriptLanguage(basename(w)));
			if (script || live.some(isShellStartupFile)) {
				for (const name of live.flatMap(namesIn)) {
					named.add(name);
				}
			}
			runsAgx ||= script && live.some((w) => AGX_IN_SCRIPT.test(w));
			if (turnsGuardOff(live)) {
				verdicts.push(deny(GUARD_OFF_REASON));
			}
			if (
				MUTATORS.has(basename(live[0] ?? "")) &&
				live.slice(1).some((w) => isGuardFile(w, ctx.cwd))
			) {
				verdicts.push(deny(GUARD_OFF_REASON));
			}
			// A quoted string handed to another program may be a command it
			// runs: `tmux new -d '…'`, `ssh host '…'`, `script -c '…'`.
			for (const w of argv) {
				if (/\s/.test(w) && /agx|send_mode/i.test(w)) {
					enqueue(w);
				}
			}
			// The two checks below cost time for every agx word in the
			// command; past a limit, ask instead of reading them all.
			if (agxWords(argv.join(" ")) > MAX_AGX_WORDS) {
				unchecked = true;
				continue;
			}
			verdicts.push(...agxAnywhere(argv, mode));
			const unfiltered = argv.filter(
				(_, k) => !PACKAGE_FILTER_OPTIONS.has(argv[k - 1] ?? ""),
			);
			// The parser already judged this argv's own agx call; keep the text
			// scan's denies (identity export) but not its "can't fully check" prompt.
			const scanned = scanText(unfiltered.join(" "), mode);
			verdicts.push(
				...(found.agx.length > 0
					? scanned.filter((v) => v?.decision === "deny")
					: scanned),
			);
		}
		if (dumpsEnv && filtersForKey) {
			verdicts.push(deny(API_KEY_READ_REASON));
		}
	}
	// Under allexport, a builtin that fills a variable also exports it.
	if (allExport) {
		if (bare.has("AGX_API_KEY")) {
			verdicts.push(deny(API_KEY_REASON));
		}
		if (bare.has("AGX_HOME")) {
			verdicts.push(deny(AGX_HOME_REASON));
		}
		if (bare.has("AGX_PROFILE")) {
			verdicts.push(ask(PROFILE_UNREAD_REASON));
		}
		if (bare.has("AGX_API_URL")) {
			verdicts.push(ask(apiBaseReason([null])));
		}
		homeMoved ||= bare.has("HOME") || bare.has("USERPROFILE");
	}
	if (runsAgx && homeMoved) {
		verdicts.push(deny(AGX_HOME_REASON));
	}
	if (runsAgx && envLoaded) {
		verdicts.push(ask(LOADED_ENV_REASON));
	}
	// HOME is named in scripts all the time; it matters only when agx runs.
	const asked = [...named].filter(
		(name) => runsAgx || !["HOME", "USERPROFILE"].includes(name),
	);
	if (asked.length > 0) {
		verdicts.push(ask(namedInScriptReason(asked)));
	}
	if (unchecked && UNCHECKED_TEXT.test(command)) {
		verdicts.push(ask(UNCHECKED_REASON));
	}
	return strongest(verdicts);
}

/** How many times `text` says agx, in any case and inside longer words. */
function agxWords(text) {
	return text.match(/agx/gi)?.length ?? 0;
}

/** String inputs of other tools (PowerShell, MCP) that hold a command. */
const COMMAND_KEYS = new Set(["command", "cmd", "script"]);
/** String inputs of other tools that name a file or directory. */
const PATH_KEYS = new Set([
	"path",
	"file_path",
	"filePath",
	"filename",
	"directory",
	"cwd",
]);

/**
 * Every string in a tool input, at any depth, with the name of the object key
 * it sits under (an array passes its key on to its items): `{actions: [{input:
 * {url: "…"}}]}` yields `["url", "…"]`. Bounded, so a huge input can't stall
 * the hook.
 *
 * @param {unknown} value
 * @returns {[string, string][]}
 */
function stringInputs(value) {
	/** @type {[string, string][]} */
	const out = [];
	/** @type {[unknown, string, number][]} */
	const stack = [[value, "", 0]];
	for (let n = 0; stack.length > 0 && n < 10000; n += 1) {
		const [v, key, depth] = /** @type {[unknown, string, number]} */ (
			stack.pop()
		);
		if (typeof v === "string") {
			out.push([key, v]);
		} else if (depth < 10 && Array.isArray(v)) {
			for (const item of v) {
				stack.push([item, key, depth + 1]);
			}
		} else if (depth < 10 && v && typeof v === "object") {
			for (const [k, item] of Object.entries(v)) {
				stack.push([item, k, depth + 1]);
			}
		}
	}
	return out;
}

/** The text a Write, Edit or MultiEdit call puts into a file. */
function writtenText(toolInput) {
	const parts = [toolInput.content, toolInput.new_string];
	if (Array.isArray(toolInput.edits)) {
		for (const edit of toolInput.edits) {
			parts.push(edit?.new_string);
		}
	}
	return parts.filter((p) => typeof p === "string").join("\n");
}

/**
 * The hook entry point: a PreToolUse input object in, a verdict (or null for
 * "no opinion") out.
 *
 * @param {{ tool_name?: string, tool_input?: Record<string, unknown>, cwd?: string }} input
 * @param {Record<string, string | undefined>} env
 * @returns {Verdict | null}
 */
export function decide(input, env) {
	const mode = sendMode(env.CLAUDE_PLUGIN_OPTION_SEND_MODE);
	// One time budget for the whole tool call, however many command lines
	// its input holds.
	const ctx = {
		agxHome: env.AGX_HOME,
		cwd: input.cwd,
		deadline: Date.now() + BUDGET_MS,
	};
	const toolInput = input.tool_input ?? {};
	const str = (v) => (typeof v === "string" ? v : "");
	const home = homedir().replace(/\\/g, "/");
	const inAgxDir = (p) =>
		touchesKeyFiles(p, ctx) || isUnder(p, `${home}/.agx`);

	switch (input.tool_name) {
		case "Bash":
		case "Monitor":
			return decideCommand(str(toolInput.command), mode, ctx);
		case "PowerShell":
			// PowerShell escapes with a backtick; a backslash is a path separator.
			return decideCommand(
				str(toolInput.command).replace(/\\/g, "/"),
				mode,
				ctx,
			);
		case "Read":
		case "Write":
		case "Edit":
		case "MultiEdit":
		case "NotebookEdit": {
			const path =
				str(toolInput.file_path) || str(toolInput.notebook_path);
			if (inAgxDir(path)) {
				return deny(KEY_FILES_REASON);
			}
			if (input.tool_name === "Read") {
				return null;
			}
			if (isGuardFile(path, input.cwd)) {
				return deny(GUARD_OFF_REASON);
			}
			// A shell startup file runs in every later shell: what Claude writes
			// there is a command line, checked like one.
			if (isShellStartupFile(path)) {
				const verdict = decideCommand(writtenText(toolInput), mode, ctx);
				if (verdict) {
					return verdict;
				}
			}
			if (
				isClaudeSettings(path) &&
				(mentionsModeText(editedText(toolInput)) ||
					// A full rewrite could drop this plugin's entries without naming them.
					(input.tool_name === "Write" &&
						mentionsModeText(currentText(path, input.cwd))))
			) {
				return deny(MODE_REASON);
			}
			return null;
		}
		case "Grep":
		case "Glob": {
			const fields = [str(toolInput.path), str(toolInput.glob)];
			if (input.tool_name === "Glob") {
				fields.push(str(toolInput.pattern));
			}
			if (fields.some(inAgxDir)) {
				return deny(KEY_FILES_REASON);
			}
			// A content search rooted at the home directory (or above it) would
			// read the key files too, whatever the pattern says. An explicit path
			// there is denied; a search with no path, which merely starts in a
			// working directory that happens to be home, gets a prompt instead.
			if (input.tool_name === "Grep") {
				const explicit = str(toolInput.path) !== "";
				const root = searchRoot(str(toolInput.path), input.cwd);
				const agxDirs = [`${home}/.agx`, ctx.agxHome].filter(Boolean);
				if (root && agxDirs.some((d) => isUnder(d, root))) {
					return explicit
						? deny(
								`${KEY_FILES_REASON} This search starts at ${root}, which contains the agx directory; search a narrower path.`,
							)
						: ask(
								`elladex-agx: this search has no path, so it starts at the working directory ${root}, which contains agx's private files (~/.agx: the secret key, the allowlist and the login key in credentials.json). Approve only if its results can't include them; otherwise ask Claude to search a narrower path.`,
							);
				}
			}
			return null;
		}
		default: {
			// PowerShell under another name, MCP tools such as a terminal that
			// runs a command in the user's own shell, and browser tools that
			// open a URL, including inside a batch of actions
			// (`browser_batch`'s `actions[].input.url`).
			/** @type {(Verdict | null)[]} */
			const verdicts = [];
			const inputs = stringInputs(toolInput);
			// A file tool writing a shell startup file: its text is a command
			// line a later shell runs, as with Write and Edit.
			const writesStartup = inputs.some(
				([key, value]) => PATH_KEYS.has(key) && isShellStartupFile(value),
			);
			for (const [key, value] of inputs) {
				if (COMMAND_KEYS.has(key)) {
					verdicts.push(decideCommand(value, mode, ctx));
				} else if (PATH_KEYS.has(key)) {
					if (inAgxDir(value)) {
						verdicts.push(deny(KEY_FILES_REASON));
					}
				} else if (URL_KEYS.has(key)) {
					if (isDeviceApprovalUrl(value)) {
						verdicts.push(deny(DEVICE_PAGE_REASON));
					} else if (isListingManageUrl(value)) {
						verdicts.push(ask(LISTING_PAGE_REASON));
					}
				} else if (writesStartup) {
					verdicts.push(decideCommand(value, mode, ctx));
				}
			}
			return strongest(verdicts);
		}
	}
}

/** The absolute directory a Grep call searches from, or "" if unknown. */
function searchRoot(path, cwd) {
	const home = homedir();
	let p = path.replace(/^~(?=$|[\\/])/, home);
	if (!p) {
		p = cwd ?? "";
	} else if (!isAbsolute(p) && cwd) {
		p = resolve(cwd, p);
	}
	if (!p || !isAbsolute(p)) {
		return "";
	}
	return resolve(p)
		.replace(/\\/g, "/")
		.replace(/(.)\/+$/, "$1");
}

function isUnder(path, dir) {
	if (!path) {
		return false;
	}
	const p = path.replace(/\\/g, "/");
	const d = dir.replace(/\\/g, "/");
	return p === d || p.startsWith(d.endsWith("/") ? d : `${d}/`);
}

/** Anything other than exactly "claude-sends" is draft: fail closed. */
export function sendMode(value) {
	return (value ?? "").trim().toLowerCase() === CLAUDE_SENDS
		? CLAUDE_SENDS
		: DRAFT;
}

/**
 * The JSON Claude Code expects on stdout, or "" for no decision. The guard
 * only ever denies or asks; it never grants permission, so anything that
 * isn't a deny becomes a prompt.
 */
export function render(verdict) {
	if (!verdict) {
		return "";
	}
	return JSON.stringify({
		hookSpecificOutput: {
			hookEventName: "PreToolUse",
			permissionDecision: verdict.decision === "deny" ? "deny" : "ask",
			permissionDecisionReason: verdict.reason,
		},
	});
}

/**
 * The only environment variables the guard reads: the send mode Claude Code
 * passes in, and AGX_HOME so the key directory is protected wherever it is.
 * Nothing else from the environment reaches `decide`.
 *
 * @param {Record<string, string | undefined>} env
 * @returns {{ CLAUDE_PLUGIN_OPTION_SEND_MODE?: string, AGX_HOME?: string }}
 */
export function guardEnv(env) {
	return {
		CLAUDE_PLUGIN_OPTION_SEND_MODE: env.CLAUDE_PLUGIN_OPTION_SEND_MODE,
		AGX_HOME: env.AGX_HOME,
	};
}

async function main() {
	let raw = "";
	for await (const chunk of process.stdin) {
		raw += chunk;
	}
	let input;
	try {
		input = JSON.parse(raw);
	} catch {
		process.stderr.write("elladex-agx guard: hook input was not JSON\n");
		process.exit(1);
	}
	let verdict;
	try {
		verdict = decide(input, guardEnv(process.env));
	} catch (error) {
		// A parser bug must not wave an agx command through: ask instead.
		const text = JSON.stringify(input?.tool_input ?? "");
		verdict = /agx/.test(text)
			? ask(
					`elladex-agx: the guard could not check this command (${String(error)}). Approve only if you are sure it is safe.`,
				)
			: null;
	}
	const out = render(verdict);
	if (out) {
		process.stdout.write(`${out}\n`);
	}
}

/** True when this file is the process entry point (not imported by a test).
 * Compared by real path: the plugin cache may reach this file through a
 * symlink, and a guard that silently skipped `main` would decide nothing. */
function isEntryPoint() {
	try {
		return (
			realpathSync(process.argv[1] ?? "") ===
			realpathSync(fileURLToPath(import.meta.url))
		);
	} catch {
		return false;
	}
}

if (isEntryPoint()) {
	await main();
}
