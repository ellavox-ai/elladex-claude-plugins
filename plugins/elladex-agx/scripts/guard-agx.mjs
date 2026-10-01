#!/usr/bin/env node
/**
 * PreToolUse guard for the elladex-agx plugin.
 *
 * Claude Code runs this before every Bash, Monitor, PowerShell, Read, Grep,
 * Glob, Write, Edit, MultiEdit and NotebookEdit call, and every MCP tool call
 * (hooks/hooks.json): an MCP tool's `command`, `cmd` or `script` input is
 * checked like Bash (the Desktop terminal tool runs commands in the user's own
 * shell), its path inputs like Read, and its `url` input (a browser tool's)
 * against the sign-in approval page. It reads the hook input as JSON on
 * stdin, and from the environment only the plugin's `send_mode` option
 * (CLAUDE_PLUGIN_OPTION_SEND_MODE) and AGX_HOME (see `guardEnv`). It prints a
 * `hookSpecificOutput` decision of deny or ask, or nothing at all when it has
 * no opinion; it never approves a tool call:
 *
 *   deny   `agx identity export`, `agx config show --reveal`, any tool call that
 *          touches ~/.agx or $AGX_HOME (the secret key, the allowlist and the
 *          `agx login` key in credentials.json live there), setting AGX_HOME
 *          at all, an API key on a command line (`agx config set apiKey
 *          <value>`, `AGX_API_KEY=…`, or an `ela_…` key literal), an MCP tool
 *          (a browser) opening the sign-in approval page `/auth/device`, `agx
 *          serve` without the watch's safe flags or with --allow-all,
 *          --reply-any or --advertise, and any attempt to change the send mode
 *          (`send_mode=` in a command, or a Claude settings file written with
 *          send_mode, claude-sends or elladex-agx in it), and anything that
 *          turns this guard off: `claude plugin disable|uninstall` of
 *          elladex-agx (or `--all`), removing the `ellaworks` marketplace,
 *          `disableAllHooks`, and writes to this plugin's installed files or
 *          Claude Code's plugin registry.
 *   send   `agx send` / `agx request`: deny in draft mode (the default; the user
 *          runs the command), ask in claude-sends mode (a permission prompt even
 *          when Bash is allowlisted).
 *   ask    trust and publishing changes: `agx identity new|import|sign|allow
 *          <npub>|deny|register`, `agx register`, `agx config set|use`
 *          (including `config set apiKey --stdin`), the `agx peers` decisions,
 *          `agx serve --allow`, `agx listing create|publish|set-visibility|
 *          delist|delete|set-policy` and `agx domain add|verify|remove`. Also
 *          any agx server other than https://app.ellaworks.ai (`--api-base-url`,
 *          `--api-url` or AGX_API_URL), `agx login --new-org|--org-name|
 *          --org-slug`, every `agx org` subcommand except `list`, a Grep with
 *          no path whose working directory contains ~/.agx, and agx
 *          send/request text in a form it can't parse.
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
 * (`v=send; agx $v …`), text piped into a shell, a script file that runs agx,
 * a glob that spells the key directory indirectly (`~/.a?x`), a shell search
 * of the whole home directory (`grep -r … ~`), an agx server stored in the
 * profile or inherited from the shell's AGX_API_URL, or a browser tool that
 * reaches the approval page by clicking or by script rather than by a `url`
 * input. The tests list these gaps.
 *
 * It tries not to get in the way of ordinary work: the pattern of grep/rg and
 * the message of `git commit -m` / `gh pr create --body` are text, not paths or
 * commands; echo/printf arguments are not commands; and a heredoc written to a
 * file is not parsed at all. Keep permission prompts on; see the plugin README.
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
	"elladex-agx: this puts an Ellaworks API key on a command line, where it lands in the transcript and the process list. Claude never handles API keys: to sign agx in, Claude runs `agx login`, which sends the user to the browser and stores the key without showing it. If this is a real key, treat it as exposed: revoke it in Settings → API keys. To store a key for CI, the user runs `agx config set apiKey --stdin` in their own terminal.";
const API_KEY_STDIN_REASON =
	"elladex-agx: `agx config set apiKey --stdin` stores an Ellaworks API key that someone would have to paste. Claude signs agx in with `agx login` instead, which needs no key from anyone. Approve only if you started this yourself and the key never passed through the chat.";
const AGX_HOME_REASON =
	"elladex-agx: Claude never sets AGX_HOME. That directory holds the agx secret key and the `agx login` key (credentials.json), so pointing agx somewhere Claude chose would put them where Claude could read them. Run agx without it: to sign in, `agx login`. If a login was already made under another directory, the user revokes it with `agx logout` in their own terminal.";
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
 * with a version or tag. */
function isAgxPackage(w) {
	return /^@(?:nostr-agx|agx)\/cli(@.*)?$/.test(w);
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
		if (name === "eval") {
			nested.push(argv.slice(i + 1).join(" "));
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
		decideAgxSub(args, mode),
	]);
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
 * The source of a pattern that matches setting environment variable `name`:
 * `NAME=v` as a word or inside one (an assignment prefix, `env NAME=v`,
 * `export`, `declare -x`, a quoted script), and PowerShell's `$env:NAME = v`
 * or `${env:NAME} = v`. A reference such as `[ "$NAME" = x ]` is not a
 * write. Case-insensitive, as Windows treats these names.
 *
 * @param {string} name
 */
function envSetSource(name) {
	return `(?:\\$env:${name}|\\$\\{env:${name}\\}|(?<![A-Za-z0-9_$:{])${name})\\s*\\+?=(?!=)`;
}

/** PowerShell cmdlets (and aliases) that write an `env:` drive item. */
const PS_ITEM_WRITERS =
	/^(?:set-item|new-item|set-content|add-content|si|ni|ac)$/i;

/**
 * True when this simple command sets environment variable `name`.
 * @param {string[]} live the command's words that aren't prose or patterns
 * @param {string} name
 */
function setsEnv(live, name) {
	if (new RegExp(envSetSource(name), "i").test(live.join(" "))) {
		return true;
	}
	// PowerShell: `Set-Item -Path env:NAME -Value v`, `ni env:NAME v`.
	const program = live.find((w) => !isAssignment(w)) ?? "";
	return (
		PS_ITEM_WRITERS.test(basename(program)) &&
		live.some((w) => new RegExp(`^(?:-path[:=])?env:${name}$`, "i").test(w))
	);
}

/**
 * The values this simple command gives environment variable `name`. A word
 * that starts with `NAME=` gives the rest of the word; another spelling
 * (`$env:NAME = v`, `NAME=v` inside a quoted script) gives the next run of
 * plain characters; a PowerShell item write gives null (not read).
 *
 * @param {string[]} live
 * @param {string} name
 * @returns {(string | null)[]}
 */
function envValues(live, name) {
	/** @type {(string | null)[]} */
	const values = [];
	const whole = new RegExp(`^${name}\\+?=`, "i");
	/** @type {string[]} */
	const rest = [];
	for (const w of live) {
		const m = whole.exec(w);
		if (m) {
			values.push(w.slice(m[0].length));
		} else {
			rest.push(w);
		}
	}
	const inline = new RegExp(`${envSetSource(name)}\\s*([^\\s;&|'"]*)`, "gi");
	for (const m of rest.join(" ").matchAll(inline)) {
		values.push(m[1]);
	}
	if (values.length === 0 && setsEnv(live, name)) {
		values.push(null);
	}
	return values;
}

/**
 * Verdicts on the agx environment a simple command sets up, and on an API
 * key written into it. `findAgx` skips assignments, so they are checked here,
 * for every command and not just agx: `export AGX_API_URL=…` changes the agx
 * calls that follow it.
 *
 * @param {string[]} live the command's words that aren't prose or patterns
 * @returns {Verdict[]}
 */
function envVerdicts(live) {
	/** @type {Verdict[]} */
	const out = [];
	if (setsEnv(live, "AGX_API_KEY") || live.some((w) => ELA_KEY.test(w))) {
		out.push(deny(API_KEY_REASON));
	}
	if (setsEnv(live, "AGX_HOME")) {
		out.push(deny(AGX_HOME_REASON));
	}
	const urls = envValues(live, "AGX_API_URL").filter(
		(v) => !isDefaultApiBase(v),
	);
	if (urls.length > 0) {
		out.push(ask(apiBaseReason(urls)));
	}
	return out;
}

/**
 * PowerShell's `[Environment]::SetEnvironmentVariable('NAME', …)`, which the
 * tokenizer splits at its parentheses, checked on the command text instead.
 *
 * @param {string} text
 * @returns {Verdict[]}
 */
function setEnvironmentVariableVerdicts(text) {
	/** @type {Verdict[]} */
	const out = [];
	const call = (name) =>
		new RegExp(
			`SetEnvironmentVariable\\s*\\(\\s*['"]?${name}['"]?\\s*,`,
			"i",
		).test(text);
	if (call("AGX_API_KEY")) {
		out.push(deny(API_KEY_REASON));
	}
	if (call("AGX_HOME")) {
		out.push(deny(AGX_HOME_REASON));
	}
	if (call("AGX_API_URL")) {
		out.push(ask(apiBaseReason([null])));
	}
	return out;
}

// ------------------------------------------ the sign-in approval page

const DEVICE_PAGE_REASON =
	"elladex-agx: this opens the Ellaworks sign-in approval page (/auth/device) with a tool Claude drives. Only a person approves an `agx login`: give the user the link and code that your own `agx login` printed, and let them open it in their own browser. Claude never opens, fills in or clicks that page.";

/** MCP tool inputs that hold a URL to open (browser navigation tools). */
const URL_KEYS = new Set(["url", "uri", "href"]);

/**
 * True for the device sign-in page, `/auth/device` (with an optional locale
 * prefix and any query, such as `?code=…`), and the device endpoints under
 * `/api/auth/device/`, on any host. A value with no scheme
 * (`app.ellaworks.ai/auth/device`) is read as https.
 *
 * @param {string} value
 */
function isDeviceApprovalUrl(value) {
	const v = value.trim();
	let path;
	try {
		path = new URL(/^[a-z][a-z0-9+.-]*:/i.test(v) ? v : `https://${v}`)
			.pathname;
	} catch {
		path = v.split(/[?#]/)[0] ?? "";
	}
	let decoded = path;
	try {
		decoded = decodeURIComponent(path);
	} catch {
		// Keep the raw path: a malformed escape is checked as written.
	}
	return [path, decoded].some((p) => {
		const clean = p.replace(/\/+$/, "").toLowerCase();
		return (
			/^(?:\/[a-z]{2}(?:-[a-z0-9]{2,4})?)?\/auth\/device$/.test(clean) ||
			/^\/api\/auth\/device(?:\/|$)/.test(clean)
		);
	});
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
 * @param {{ agxHome?: string, cwd?: string }} ctx
 * @returns {Verdict | null}
 */
export function decideCommand(command, mode, ctx = {}) {
	/** @type {(Verdict | null)[]} */
	const verdicts = [];
	const queue = [command];
	for (let n = 0; queue.length > 0 && n < 200; n += 1) {
		const text = /** @type {string} */ (queue.shift());
		const { commands, nested, redirects, heredocs } = tokenize(text);
		queue.push(...nested);
		const mentionsMode = mentionsModeText(text);
		verdicts.push(...setEnvironmentVariableVerdicts(text));

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

		// A heredoc is parsed as commands only when a shell reads it; a body
		// written to a file or a commit message is text.
		for (const { argv, body } of heredocs) {
			if (feedsShell(argv)) {
				queue.push(body);
			} else if (feedsInterpreter(argv)) {
				if (touchesKeyFiles(body, ctx)) {
					verdicts.push(deny(KEY_FILES_REASON));
				}
				if (ELA_KEY.test(body)) {
					verdicts.push(deny(API_KEY_REASON));
				}
				verdicts.push(...scanText(body, mode));
			}
		}

		for (const argv of commands) {
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

			const found = findAgx(argv);
			queue.push(...found.nested);
			for (const args of found.agx) {
				verdicts.push(decideAgx(args, mode));
			}

			if (textOnly) {
				continue;
			}
			if (turnsGuardOff(live)) {
				verdicts.push(deny(GUARD_OFF_REASON));
			}
			if (
				MUTATORS.has(basename(live[0] ?? "")) &&
				live.slice(1).some((w) => isGuardFile(w, ctx.cwd))
			) {
				verdicts.push(deny(GUARD_OFF_REASON));
			}
			verdicts.push(...agxAnywhere(argv, mode));
			// A quoted string handed to another program may be a command it
			// runs: `tmux new -d '…'`, `ssh host '…'`, `script -c '…'`.
			for (const w of argv) {
				if (/\s/.test(w) && /agx|send_mode/i.test(w)) {
					queue.push(w);
				}
			}
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
	}
	return strongest(verdicts);
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
 * The hook entry point: a PreToolUse input object in, a verdict (or null for
 * "no opinion") out.
 *
 * @param {{ tool_name?: string, tool_input?: Record<string, unknown>, cwd?: string }} input
 * @param {Record<string, string | undefined>} env
 * @returns {Verdict | null}
 */
export function decide(input, env) {
	const mode = sendMode(env.CLAUDE_PLUGIN_OPTION_SEND_MODE);
	const ctx = { agxHome: env.AGX_HOME, cwd: input.cwd };
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
			// open a URL.
			/** @type {(Verdict | null)[]} */
			const verdicts = [];
			for (const [key, value] of Object.entries(toolInput)) {
				if (typeof value !== "string") {
					continue;
				}
				if (COMMAND_KEYS.has(key)) {
					verdicts.push(decideCommand(value, mode, ctx));
				} else if (PATH_KEYS.has(key) && inAgxDir(value)) {
					verdicts.push(deny(KEY_FILES_REASON));
				} else if (URL_KEYS.has(key) && isDeviceApprovalUrl(value)) {
					verdicts.push(deny(DEVICE_PAGE_REASON));
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
