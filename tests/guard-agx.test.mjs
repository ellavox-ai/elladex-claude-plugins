/**
 * Tests for the elladex-agx PreToolUse guard. Run from the repository root:
 *   node --test tests/*.test.mjs
 * (Node 24 rejects a bare directory argument, hence the glob.) They live
 * outside the plugin folder so they don't ship with it.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
	decide,
	decideCommand,
	render,
	sendMode,
} from "../plugins/elladex-agx/scripts/guard-agx.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const PLUGIN = join(HERE, "..", "plugins", "elladex-agx");
const GUARD = join(PLUGIN, "scripts", "guard-agx.mjs");
const SAFE_SERVE =
	"agx serve --no-reply --no-tasks --allowed-only --full-ids --no-color";
const NPUB = "npub1n0m8c4qn3434zy2q7nxj7v029pqyyfjfg0af98yfll6ksnvq3mps2ynyfz";
/** The mode-switch directions, word for word as in the README and agx-peer. */
const MODE_SWITCH =
	"change it in /config (elladex-agx → Who sends messages) or /plugin → Installed → elladex-agx → Configure options";

/** The decision for a Bash command, or "none". */
function bash(command, mode = "draft", env = {}) {
	const verdict = decide(
		{ tool_name: "Bash", tool_input: { command }, cwd: "/work" },
		{ CLAUDE_PLUGIN_OPTION_SEND_MODE: mode, ...env },
	);
	return verdict?.decision ?? "none";
}

function tool(tool_name, tool_input, env = {}) {
	return (
		decide({ tool_name, tool_input, cwd: "/work" }, env)?.decision ?? "none"
	);
}

describe("send mode", () => {
	it("defaults to draft and fails closed on anything unexpected", () => {
		assert.equal(sendMode(undefined), "draft");
		assert.equal(sendMode(""), "draft");
		assert.equal(sendMode("draft"), "draft");
		assert.equal(sendMode("claude_sends"), "draft");
		// biome-ignore lint/suspicious/noTemplateCurlyInString: shell syntax, not a template
		assert.equal(sendMode("${user_config.send_mode}"), "draft");
		assert.equal(sendMode("claude-sends"), "claude-sends");
		assert.equal(sendMode(" Claude-Sends "), "claude-sends");
	});
});

describe("agx send and agx request", () => {
	const send = `agx send --context-id 'abc' -- ${NPUB} 'hello'`;

	it("denies in draft mode, with a reason that tells Claude to hand over", () => {
		assert.equal(bash(send, "draft"), "deny");
		const verdict = decideCommand(send, "draft");
		assert.match(verdict.reason, /draft mode/);
		assert.match(verdict.reason, /their own terminal/);
		assert.match(verdict.reason, /never change that setting yourself/i);
		assert.ok(verdict.reason.includes(MODE_SWITCH), verdict.reason);
	});

	it("denies when the option is unset (hook env without the variable)", () => {
		const verdict = decide(
			{ tool_name: "Bash", tool_input: { command: send } },
			{},
		);
		assert.equal(verdict.decision, "deny");
	});

	it("asks in claude-sends mode", () => {
		assert.equal(bash(send, "claude-sends"), "ask");
		assert.equal(
			bash(`agx request ${NPUB} agx.ping --payload '{}'`, "claude-sends"),
			"ask",
		);
	});

	it("covers agx request in draft mode", () => {
		assert.equal(bash(`agx request ${NPUB} invoice.review`), "deny");
	});

	it("sees global options before the subcommand", () => {
		assert.equal(bash(`agx --profile work send ${NPUB} hi`), "deny");
		assert.equal(bash(`agx -p work --no-color send ${NPUB} hi`), "deny");
		assert.equal(bash(`agx --json send ${NPUB} hi`), "deny");
	});
});

describe("every way to reach agx", () => {
	const cases = [
		"agx send npub1x hi",
		"/usr/local/bin/agx send npub1x hi",
		"./node_modules/.bin/agx send npub1x hi",
		"npx agx send npub1x hi",
		"npx -y @agx/cli send npub1x hi",
		"npx --yes @agx/cli@0.3.0 send npub1x hi",
		"npx --package=@agx/cli agx send npub1x hi",
		"npx -p @agx/cli agx send npub1x hi",
		"pnpm agx send npub1x hi",
		"pnpm -s agx send npub1x hi",
		"pnpm --silent agx send npub1x hi",
		"pnpm exec agx send npub1x hi",
		"pnpm --filter @agx/cli exec agx send npub1x hi",
		"pnpm dlx @agx/cli send npub1x hi",
		"npm exec -- @agx/cli send npub1x hi",
		"npm run agx -- send npub1x hi",
		"yarn agx send npub1x hi",
		"yarn dlx @agx/cli send npub1x hi",
		"bunx @agx/cli send npub1x hi",
		// The CLI is published as @nostr-agx/cli; the old @agx/cli name is still matched.
		"npx -y @nostr-agx/cli send npub1x hi",
		"npx --yes @nostr-agx/cli@0.3.0 send npub1x hi",
		"npx --package=@nostr-agx/cli agx send npub1x hi",
		"npx -p @nostr-agx/cli agx send npub1x hi",
		"pnpm dlx @nostr-agx/cli send npub1x hi",
		"npm exec -- @nostr-agx/cli send npub1x hi",
		"yarn dlx @nostr-agx/cli send npub1x hi",
		"bunx @nostr-agx/cli request npub1x agx.ping",
		"node packages/cli/dist/agx.js send npub1x hi",
		"node --no-warnings /opt/nostr-agx/packages/cli/dist/agx.js send npub1x hi",
		"node scripts/agx.mjs send npub1x hi",
		"tsx packages/cli/src/bin/agx.ts send npub1x hi",
	];
	for (const command of cases) {
		it(command, () => {
			assert.equal(bash(command), "deny");
		});
	}
});

describe("command separators", () => {
	const cases = [
		"echo start; agx send npub1x hi",
		"true && agx send npub1x hi",
		"false || agx send npub1x hi",
		"echo hi | agx send npub1x -",
		"echo start\nagx send npub1x hi",
		"agx identity show & agx send npub1x hi",
		"(agx send npub1x hi)",
		"{ agx send npub1x hi; }",
		"if true; then agx send npub1x hi; fi",
		"for p in a b; do agx send $p hi; done",
		"agx send npub1x hi 2>&1 | tee /tmp/out",
		"agx send npub1x hi >/dev/null 2>&1",
	];
	for (const command of cases) {
		it(JSON.stringify(command), () => {
			assert.equal(bash(command), "deny");
		});
	}
});

describe("evasion attempts the guard catches", () => {
	const cases = [
		["quoted command name", `"agx" send npub1x hi`],
		["split quotes", `a''gx send npub1x hi`],
		["split double quotes", `"ag"x send npub1x hi`],
		["backslash", "\\agx send npub1x hi"],
		["ANSI-C quoting", `$'\\x61gx' send npub1x hi`],
		["quoted subcommand", `agx 'send' npub1x hi`],
		["env prefix", "AGX_PROFILE=work agx send npub1x hi"],
		["env command", "env AGX_PROFILE=work agx send npub1x hi"],
		["env -i", "env -i PATH=/usr/bin agx send npub1x hi"],
		["env -S", `env -S 'agx send npub1x hi'`],
		["command builtin", "command agx send npub1x hi"],
		["exec", "exec agx send npub1x hi"],
		["nohup", "nohup agx send npub1x hi"],
		["sudo", "sudo -u me agx send npub1x hi"],
		["timeout", "timeout 30 agx send npub1x hi"],
		["nice", "nice -n 5 agx send npub1x hi"],
		["xargs", "echo npub1x | xargs -I{} agx send {} hi"],
		["bash -c", `bash -c 'agx send npub1x hi'`],
		["bash -lc", `bash -lc "agx send npub1x hi"`],
		["sh -c nested", `sh -c "bash -c 'agx send npub1x hi'"`],
		["zsh -c", `zsh -c 'agx send npub1x hi'`],
		["eval", `eval "agx send npub1x hi"`],
		["command substitution", "echo $(agx send npub1x hi)"],
		["backticks", "echo `agx send npub1x hi`"],
		["substitution in quotes", `echo "sent: $(agx send npub1x hi)"`],
		["process substitution", "cat <(agx send npub1x hi)"],
		["here-string into a shell", `bash <<< 'agx send npub1x hi'`],
		["computed command name", "$(which agx) send npub1x hi"],
		["computed via command -v", `"$(command -v agx)" send npub1x hi`],
		["variable command name", `"$AGX" send npub1x hi`],
		["npx -c", `npx -c 'agx send npub1x hi'`],
		// biome-ignore lint/suspicious/noTemplateCurlyInString: shell syntax, not a template
		["name built by the shell", "a=ag; ${a}x send npub1x hi"],
		["watch", "watch -n 5 agx send npub1x hi"],
		["line continuation", "agx \\\nsend npub1x hi"],
		[
			"JavaScript that spawns agx",
			`node -e "require('child_process').execSync('agx send npub1x hi')"`,
		],
		[
			"node on a computed agx path",
			`node "$(command -v agx)" send -- n 'hi'`,
		],
		["setsid", "setsid agx send npub1x hi"],
		["find -exec", "find . -name '*.txt' -exec agx send npub1x {} \\;"],
		["script (BSD form)", "script -q /dev/null agx send npub1x hi"],
		["script -c (Linux form)", "script -qc 'agx send npub1x hi' /dev/null"],
		["bash -O … -c", `bash -O extglob -c 'agx send npub1x hi'`],
		["busybox sh -c", `busybox sh -c 'agx send npub1x hi'`],
		["tmux new", `tmux new -d 'agx send npub1x hi'`],
		[
			"tmux new-session -s",
			`tmux new-session -d -s x "agx send npub1x hi"`,
		],
		["screen -dm", "screen -dm agx send npub1x hi"],
		["mise exec", "mise exec -- agx send npub1x hi"],
		["mise exec with a tool", "mise exec node@22 -- agx send npub1x hi"],
		["corepack pnpm dlx", "corepack pnpm dlx @agx/cli send npub1x hi"],
		["ssh host agx send", "ssh host agx send npub1x hi"],
		["ssh with a quoted command", `ssh -p 2222 host 'agx send npub1x hi'`],
		["flock", "flock /tmp/lock agx send npub1x hi"],
		["heredoc into bash", "bash <<'EOF'\nagx send npub1x hi\nEOF"],
		["heredoc into bash -s", "bash -s -- x <<EOF\nagx send npub1x hi\nEOF"],
		["heredoc with <<-", "sh <<-EOF\n\tagx send npub1x hi\n\tEOF"],
		["heredoc into ssh", "ssh host <<'EOF'\nagx send npub1x hi\nEOF"],
		["heredoc into sudo bash", "sudo bash <<EOF\nagx send npub1x hi\nEOF"],
	];
	for (const [name, command] of cases) {
		it(name, () => {
			assert.equal(bash(command), "deny", command);
		});
	}
});

describe("secret key and key files", () => {
	it("always denies agx identity export", () => {
		assert.equal(bash("agx identity export", "claude-sends"), "deny");
		assert.equal(bash("agx identity export --hex --yes"), "deny");
		assert.equal(bash("pnpm -s agx identity export"), "deny");
		assert.equal(bash("agx -p work identity export"), "deny");
		assert.equal(bash("agx identity --json export"), "deny");
	});

	it("denies config show --reveal but not config show", () => {
		assert.equal(bash("agx config show --reveal"), "deny");
		assert.equal(bash("agx config show"), "none");
	});

	it("denies Bash that touches ~/.agx", () => {
		for (const command of [
			"cat ~/.agx/profiles/default/identity.json",
			"cat $HOME/.agx/config.json",
			// biome-ignore lint/suspicious/noTemplateCurlyInString: shell syntax, not a template
			'cat "${HOME}/.agx/config.json"',
			`cat ${homedir()}/.agx/profiles/default/identity.json`,
			"ls -la ~/.agx",
			"cd ~ && cat .agx/config.json",
			"cp -r ~/.agx /tmp/backup",
			"grep -r nsec ~/.agx/",
			"tar czf /tmp/k.tgz ~/.agx",
			"echo '{}' > ~/.agx/config.json",
			"cat ~/'.agx'/config.json",
			"cat ~/.ag\\x/config.json",
			"python3 -c \"print(open('/Users/me/.agx/config.json').read())\"",
		]) {
			assert.equal(bash(command, "claude-sends"), "deny", command);
		}
	});

	it("denies Bash that references $AGX_HOME or its value", () => {
		assert.equal(bash("cat $AGX_HOME/config.json"), "deny");
		assert.equal(
			// biome-ignore lint/suspicious/noTemplateCurlyInString: shell syntax, not a template
			bash('cat "${AGX_HOME}/profiles/default/identity.json"'),
			"deny",
		);
		assert.equal(
			bash("cat /srv/agx-home/config.json", "draft", {
				AGX_HOME: "/srv/agx-home",
			}),
			"deny",
		);
	});

	it("denies Read, Grep, Glob, Write and Edit under ~/.agx", () => {
		const id = `${homedir()}/.agx/profiles/default/identity.json`;
		assert.equal(tool("Read", { file_path: id }), "deny");
		assert.equal(
			tool("Grep", { pattern: "nsec", path: `${homedir()}/.agx` }),
			"deny",
		);
		assert.equal(
			tool("Grep", { pattern: "nsec", path: "/", glob: "**/.agx/**" }),
			"deny",
		);
		assert.equal(tool("Glob", { pattern: "~/.agx/**/*.json" }), "deny");
		assert.equal(
			tool("Glob", { pattern: "**/*.json", path: `${homedir()}/.agx` }),
			"deny",
		);
		assert.equal(
			tool("Write", {
				file_path: `${homedir()}/.agx/config.json`,
				content: "{}",
			}),
			"deny",
		);
		assert.equal(
			tool("Edit", {
				file_path: `${homedir()}/.agx/config.json`,
				old_string: "a",
				new_string: "b",
			}),
			"deny",
		);
	});

	it("denies Read under $AGX_HOME, including a relative path", () => {
		const env = { AGX_HOME: "/srv/agx-home" };
		assert.equal(
			tool("Read", { file_path: "/srv/agx-home/config.json" }, env),
			"deny",
		);
		assert.equal(
			decide(
				{
					tool_name: "Grep",
					tool_input: { pattern: "x", path: "agx-home" },
					cwd: "/srv",
				},
				env,
			)?.decision,
			"deny",
		);
	});

	it("denies a Grep whose explicit path is at or above the home directory", () => {
		assert.equal(
			tool("Grep", { pattern: "nsec1", path: homedir() }),
			"deny",
		);
		assert.equal(tool("Grep", { pattern: "nsec1", path: "~" }), "deny");
		assert.equal(tool("Grep", { pattern: "nsec1", path: "/" }), "deny");
		assert.equal(
			decide(
				{
					tool_name: "Grep",
					tool_input: { pattern: "x", path: ".." },
					cwd: "/srv/agx-home/sub",
				},
				{ AGX_HOME: "/srv/agx-home" },
			)?.decision,
			"deny",
		);
		assert.equal(
			tool("Grep", {
				pattern: "nsec1",
				path: `${homedir()}/projects/app`,
			}),
			"none",
		);
	});

	it("leaves ordinary files alone", () => {
		assert.equal(tool("Read", { file_path: "/work/README.md" }), "none");
		assert.equal(
			tool("Read", {
				file_path: "/work/packages/cli/src/bin/agx.ts",
			}),
			"none",
		);
		assert.equal(tool("Grep", { pattern: "agx", path: "/work" }), "none");
		assert.equal(tool("Glob", { pattern: "**/agx*.ts" }), "none");
		assert.equal(bash("cat packages/cli/README.md"), "none");
		assert.equal(bash("ls plugins/elladex-agx"), "none");
	});
});

describe("agx serve", () => {
	it("allows the watch's exact command (no decision)", () => {
		assert.equal(bash(SAFE_SERVE), "none");
		assert.equal(bash(`${SAFE_SERVE} 2>&1`), "none");
		assert.equal(
			bash(
				"node packages/cli/dist/agx.js serve --no-reply --no-tasks --allowed-only --full-ids --no-color 2>&1",
			),
			"none",
		);
	});

	it("checks Monitor commands like Bash", () => {
		const monitor = (command) =>
			decide({ tool_name: "Monitor", tool_input: { command } }, {})
				?.decision ?? "none";
		assert.equal(monitor(`${SAFE_SERVE} 2>&1`), "none");
		assert.equal(monitor("agx serve --no-reply 2>&1"), "deny");
		assert.equal(monitor(`agx send ${NPUB} hi`), "deny");
	});

	for (const flag of [
		"--no-reply",
		"--no-tasks",
		"--allowed-only",
		"--full-ids",
	]) {
		it(`denies serve without ${flag}`, () => {
			assert.equal(bash(SAFE_SERVE.replace(` ${flag}`, "")), "deny");
		});
	}

	for (const flag of ["--allow-all", "--reply-any", "--advertise"]) {
		it(`denies serve with ${flag}, in either mode`, () => {
			assert.equal(bash(`${SAFE_SERVE} ${flag}`, "claude-sends"), "deny");
		});
	}

	it("does not count flags after --", () => {
		assert.equal(
			bash(
				"agx serve -- --no-reply --no-tasks --allowed-only --full-ids",
			),
			"deny",
		);
	});

	it("denies a bare serve through wrappers", () => {
		assert.equal(bash("pnpm -s agx serve"), "deny");
		assert.equal(bash("nohup agx serve --no-reply &"), "deny");
	});
});

describe("trust changes ask", () => {
	const cases = [
		"agx identity new",
		"agx identity new --force",
		"agx identity import --stdin",
		"agx identity sign abc123",
		`agx identity allow ${NPUB}`,
		`agx identity deny ${NPUB}`,
		"agx identity register --slug me",
		"agx register --slug me",
		"agx config set relays wss://relay.elladex.ai",
		"agx config use work",
		"agx peers accept --team t --peer p",
		"agx peers allowlist --team t --npub n",
	];
	for (const command of cases) {
		it(command, () => {
			assert.equal(bash(command), "ask");
			assert.equal(bash(command, "claude-sends"), "ask");
		});
	}

	it("reading the allowlist or identity needs no decision", () => {
		assert.equal(bash("agx identity allow --list"), "none");
		assert.equal(bash("agx identity allow"), "none");
		assert.equal(bash("agx identity show"), "none");
		assert.equal(bash("agx peers list --team t"), "none");
	});
});

describe("no opinion on everything else", () => {
	const cases = [
		"agx --version",
		"agx doctor",
		"agx card npub1x",
		"agx relay",
		"ls -la",
		"git status",
		"npm install -g @agx/cli@^0.3.0",
		"npm install -g @nostr-agx/cli@^0.3.0",
		'grep -n "agx send" README.md',
		"echo agx send is documented",
		"pnpm agx:build",
		"cat plugins/elladex-agx/skills/agx-peer/SKILL.md",
	];
	for (const command of cases) {
		it(command, () => {
			assert.equal(bash(command), "none");
		});
	}

	it("ignores other tools", () => {
		assert.equal(tool("WebFetch", { url: "https://example.com" }), "none");
	});
});

describe("mixed commands take the strongest verdict", () => {
	it("deny beats ask", () => {
		assert.equal(
			bash(`agx identity allow ${NPUB} && agx send ${NPUB} hi`),
			"deny",
		);
	});
	it("ask beats none", () => {
		assert.equal(
			bash(`agx identity show && agx identity allow ${NPUB}`),
			"ask",
		);
	});
});

describe("unusual wrappers still get the send verdict", () => {
	const cases = [
		"setsid agx send npub1x hi",
		"ssh host agx send npub1x hi",
		`tmux new -d 'agx send npub1x hi'`,
		"find . -exec agx request npub1x agx.ping \\;",
		"corepack pnpm dlx @agx/cli send npub1x hi",
		"corepack pnpm dlx @nostr-agx/cli send npub1x hi",
	];
	for (const command of cases) {
		it(`asks in claude-sends mode: ${command}`, () => {
			assert.equal(bash(command, "claude-sends"), "ask");
		});
	}

	it("asks at least, for agx send text inside another interpreter's script", () => {
		const command =
			"python3 - <<'EOF'\nimport os\nos.system(\"agx send npub1x hi\")\nEOF";
		assert.ok(["ask", "deny"].includes(bash(command)), bash(command));
		assert.ok(
			["ask", "deny"].includes(
				bash("perl -e 'system(qq{agx send npub1x hi})'"),
			),
		);
	});

	it("denies identity export whatever wrapper hides it", () => {
		assert.equal(bash("ssh host agx identity export"), "deny");
		assert.equal(bash(`tmux new -d 'agx identity export --yes'`), "deny");
		assert.equal(
			bash("python3 - <<'EOF'\nos.system('agx identity export')\nEOF"),
			"deny",
		);
	});
});

describe("other tools that run commands", () => {
	it("checks the Desktop terminal tool like Bash", () => {
		assert.equal(
			tool("mcp__terminal__run_in_terminal", {
				command: `agx send ${NPUB} hi`,
			}),
			"deny",
		);
		assert.equal(
			tool(
				"mcp__terminal__run_in_terminal",
				{ command: `agx send ${NPUB} hi` },
				{ CLAUDE_PLUGIN_OPTION_SEND_MODE: "claude-sends" },
			),
			"ask",
		);
		assert.equal(
			tool("mcp__terminal__run_in_terminal", { command: "git status" }),
			"none",
		);
	});

	it("checks PowerShell", () => {
		assert.equal(
			tool("PowerShell", { command: "agx send npub1x hi" }),
			"deny",
		);
		assert.equal(
			tool("PowerShell", {
				command: "Get-Content $env:AGX_HOME\\config.json",
			}),
			"deny",
		);
	});

	it("checks cmd and script inputs, and path inputs, of any MCP tool", () => {
		assert.equal(
			tool("mcp__x__exec", { cmd: "agx identity export" }),
			"deny",
		);
		assert.equal(
			tool("mcp__x__run", { script: "agx send npub1x hi" }),
			"deny",
		);
		assert.equal(
			tool("mcp__fs__read_file", {
				path: `${homedir()}/.agx/profiles/default/identity.json`,
			}),
			"deny",
		);
		assert.equal(
			tool("mcp__fs__read_file", { path: "/work/a.md" }),
			"none",
		);
		assert.equal(
			tool("mcp__slack__send", { text: "run agx send yourself" }),
			"none",
		);
	});
});

describe("listing, domain and watch --allow changes ask", () => {
	const cases = [
		`${SAFE_SERVE} --allow ${NPUB} 2>&1`,
		"agx listing create --slug me --pubkey npub1x",
		"agx listing publish",
		"agx listing set-visibility public",
		"agx listing delist",
		"agx listing delete --yes",
		"agx listing set-policy --auto-allow",
		"agx domain add example.com",
		"agx domain verify d1",
		"agx domain remove d1 --yes",
	];
	for (const command of cases) {
		it(command, () => {
			assert.equal(bash(command), "ask");
			assert.equal(bash(command, "claude-sends"), "ask");
		});
	}

	it("reading listings and domains needs no decision", () => {
		assert.equal(bash("agx listing list"), "none");
		assert.equal(bash("agx listing get"), "none");
		assert.equal(bash("agx domain list"), "none");
		assert.equal(bash("agx search invoice"), "none");
	});
});

describe("send mode changes are the user's", () => {
	it("denies send_mode= in a command, in either mode", () => {
		for (const command of [
			"claude plugin install elladex-agx@ellaworks --config send_mode=claude-sends",
			"CLAUDE_PLUGIN_OPTION_SEND_MODE=claude-sends claude -p 'send it'",
			`bash -c 'claude plugin install elladex-agx@ellaworks --config send_mode=claude-sends'`,
		]) {
			assert.equal(bash(command, "claude-sends"), "deny", command);
			assert.equal(bash(command), "deny", command);
		}
		const verdict = decideCommand(
			"claude plugin install elladex-agx@ellaworks --config send_mode=claude-sends",
			"draft",
		);
		assert.ok(verdict.reason.includes(MODE_SWITCH), verdict.reason);
		assert.equal(
			tool("mcp__terminal__run_in_terminal", {
				command:
					"claude plugin install elladex-agx@ellaworks --config send_mode=claude-sends",
			}),
			"deny",
		);
	});

	it("denies shell writes of the mode into a Claude settings file", () => {
		assert.equal(
			bash(
				`echo '{"pluginConfigs":{"elladex-agx@ellaworks":{"options":{"send_mode":"claude-sends"}}}}' > ~/.claude/settings.json`,
			),
			"deny",
		);
		assert.equal(
			bash("sed -i '' 's/draft/claude-sends/' ~/.claude/settings.json"),
			"deny",
		);
		assert.equal(
			bash(
				'cat > .claude/settings.local.json <<EOF\n{"enabledPlugins": {"elladex-agx@ellaworks": false}}\nEOF',
			),
			"deny",
		);
	});

	it("denies Write and Edit of the mode in settings files", () => {
		const settings = `${homedir()}/.claude/settings.json`;
		assert.equal(
			tool("Write", {
				file_path: settings,
				content:
					'{"pluginConfigs":{"elladex-agx@ellaworks":{"options":{"send_mode":"claude-sends"}}}}',
			}),
			"deny",
		);
		assert.equal(
			tool("Edit", {
				file_path: "/work/.claude/settings.local.json",
				old_string: '"send_mode": "draft"',
				new_string: '"send_mode": "x"',
			}),
			"deny",
		);
		assert.equal(
			tool("Edit", {
				file_path: settings,
				old_string: '"draft"',
				new_string: '"claude-sends"',
			}),
			"deny",
		);
		assert.equal(
			tool("MultiEdit", {
				file_path: settings,
				edits: [{ old_string: "a", new_string: '"elladex-agx@ellaworks": false' }],
			}),
			"deny",
		);
		assert.equal(
			tool("Write", {
				file_path:
					"/Library/Application Support/ClaudeCode/managed-settings.json",
				content: '{"disableAllHooks": true}',
			}),
			"deny",
		);
	});

	it("leaves other settings edits and mere mentions alone", () => {
		assert.equal(
			tool("Edit", {
				file_path: "/work/.claude/settings.json",
				old_string: '"allow": []',
				new_string: '"allow": ["Bash(git status)"]',
			}),
			"none",
		);
		assert.equal(
			tool("Read", { file_path: `${homedir()}/.claude/settings.json` }),
			"none",
		);
		assert.equal(
			tool("Edit", {
				file_path: "/work/plugins/elladex-agx/README.md",
				old_string: "send_mode",
				new_string: "send_mode (Who sends messages)",
			}),
			"none",
		);
		assert.equal(bash('grep -rn "send_mode=" plugins'), "none");
	});
});

describe("false positives the guard avoids", () => {
	it("prompts, not denies, a Grep with no path in the home directory", () => {
		const verdict = decide(
			{
				tool_name: "Grep",
				tool_input: { pattern: "TODO" },
				cwd: homedir(),
			},
			{},
		);
		assert.equal(verdict?.decision, "ask");
	});

	it("reads heredoc bodies as text unless a shell runs them", () => {
		const commit = [
			`git commit -m "$(cat <<'EOF'`,
			"fix(agx): agx serve now needs --no-tasks",
			"",
			"Don't let Claude run agx send; see ~/.agx notes.",
			"EOF",
			`)"`,
		].join("\n");
		assert.equal(bash(commit), "none");
		assert.equal(
			bash("cat > notes.md <<EOF\nagx serve\nagx send npub1x hi\nEOF"),
			"none",
		);
		assert.equal(
			bash("cat <<'EOF' > notes.md\nkeys live in ~/.agx\nEOF\necho done"),
			"none",
		);
		assert.equal(
			bash("bash -c 'cat' <<EOF\nagx send npub1x hi\nEOF"),
			"none",
		);
		// Still sees the command after the heredoc.
		assert.equal(
			bash("cat > notes.md <<EOF\nhello\nEOF\nagx send npub1x hi"),
			"deny",
		);
	});

	it("does not treat an arithmetic shift as a heredoc", () => {
		assert.equal(bash("echo $((1<<2)); ls"), "none");
		assert.equal(bash("echo $((1<<2)); agx send npub1x hi"), "deny");
	});

	it("allows searching for the text of agx commands", () => {
		assert.equal(
			bash('grep -n "identity export" packages/cli/src/bin/agx.ts'),
			"none",
		);
		assert.equal(
			bash(
				'grep -n "identity export" packages/cli/src/bin/agx.ts packages/cli/README.md',
			),
			"none",
		);
		assert.equal(bash("rg -n 'agx send' plugins"), "none");
		assert.equal(bash("git grep -n 'agx identity export'"), "none");
	});

	it("allows searching for .agx as a pattern, not as a path", () => {
		assert.equal(bash('grep -rn "~/.agx" docs/'), "none");
		assert.equal(bash("rg '\\.agx' plugins"), "none");
		assert.equal(bash("rg -n -e '~/.agx' -e '$AGX_HOME' plugins"), "none");
		assert.equal(bash("grep -rn -A 2 '.agx/' docs"), "none");
		// A path argument into the key directory is still denied.
		assert.equal(bash("grep -rn nsec ~/.agx"), "deny");
		assert.equal(bash("rg -f ~/.agx/patterns src"), "deny");
		assert.equal(bash("grep -e nsec -- ~/.agx/config.json"), "deny");
	});

	it("allows commit messages and PR bodies that mention agx", () => {
		assert.equal(bash('git commit -m "docs: explain ~/.agx"'), "none");
		assert.equal(bash('git commit -m "fix: agx send needs --"'), "none");
		assert.equal(
			bash(
				`gh pr create --title "agx" --body "Run agx send npub1x hi yourself"`,
			),
			"none",
		);
	});

	it("allows workspace commands that name the @agx/cli package", () => {
		assert.equal(
			bash(
				"pnpm --filter @agx/cli exec vitest run src/commands/send.ts",
			),
			"none",
		);
		assert.equal(bash("pnpm --filter @agx/cli test -- send"), "none");
		assert.equal(bash("pnpm -F @agx/cli build"), "none");
		assert.equal(bash("pnpm --filter @nostr-agx/cli test -- send"), "none");
		assert.equal(bash("pnpm -F @nostr-agx/cli build"), "none");
		assert.equal(
			bash("node packages/cli/dist/agx.js serve --help"),
			"deny",
		);
	});
});

describe("known gaps (documented, not caught)", () => {
	// A backstop, not a sandbox: these reach agx through code the guard can't
	// see. They are listed in the README. If one starts failing, the guard got
	// stronger; move it to the caught list.
	const gaps = [
		["subcommand held in a variable", "v=send; agx $v npub1x hi"],
		["script piped into a shell", "echo 'agx send npub1x hi' | bash"],
		["a script file", "bash ./send-it.sh"],
		[
			"a heredoc piped into a shell",
			"cat <<'EOF' | bash\nagx send npub1x hi\nEOF",
		],
		["a glob for the key directory", "cat ~/.a?x/config.json"],
		["a shell search of the whole home directory", "grep -r nsec1 ~"],
	];
	for (const [name, command] of gaps) {
		it(name, () => {
			assert.equal(bash(command), "none", command);
		});
	}
});

describe("hook process", () => {
	function run(input, env = {}, script = GUARD) {
		return spawnSync(process.execPath, [script], {
			input: JSON.stringify(input),
			env: { ...process.env, CLAUDE_PLUGIN_OPTION_SEND_MODE: "", ...env },
			encoding: "utf8",
		});
	}

	it("prints PreToolUse JSON for a deny", () => {
		const result = run({
			hook_event_name: "PreToolUse",
			tool_name: "Bash",
			tool_input: { command: `agx send ${NPUB} hi` },
		});
		assert.equal(result.status, 0);
		const out = JSON.parse(result.stdout);
		assert.equal(out.hookSpecificOutput.hookEventName, "PreToolUse");
		assert.equal(out.hookSpecificOutput.permissionDecision, "deny");
		assert.ok(out.hookSpecificOutput.permissionDecisionReason.length > 0);
	});

	it("reads the send mode from CLAUDE_PLUGIN_OPTION_SEND_MODE", () => {
		const result = run(
			{
				tool_name: "Bash",
				tool_input: { command: `agx send ${NPUB} hi` },
			},
			{ CLAUDE_PLUGIN_OPTION_SEND_MODE: "claude-sends" },
		);
		assert.equal(
			JSON.parse(result.stdout).hookSpecificOutput.permissionDecision,
			"ask",
		);
	});

	it("prints nothing when it has no opinion", () => {
		const result = run({
			tool_name: "Bash",
			tool_input: { command: "ls" },
		});
		assert.equal(result.status, 0);
		assert.equal(result.stdout, "");
	});

	it("still runs when reached through a symlink", () => {
		const dir = mkdtempSync(join(tmpdir(), "guard-agx-"));
		try {
			const link = join(dir, "guard-agx.mjs");
			symlinkSync(GUARD, link);
			const result = run(
				{
					tool_name: "Bash",
					tool_input: { command: "agx identity export" },
				},
				{},
				link,
			);
			assert.equal(
				JSON.parse(result.stdout).hookSpecificOutput.permissionDecision,
				"deny",
			);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	it("exits non-zero without blocking on input that isn't JSON", () => {
		const result = spawnSync(process.execPath, [GUARD], {
			input: "not json",
			encoding: "utf8",
		});
		assert.equal(result.status, 1);
		assert.equal(result.stdout, "");
	});

	it("render() emits nothing for no decision", () => {
		assert.equal(render(null), "");
	});

	it("render() never grants permission", () => {
		const decisionOf = (decision) =>
			JSON.parse(render({ decision, reason: "r" })).hookSpecificOutput
				.permissionDecision;
		assert.equal(decisionOf("deny"), "deny");
		assert.equal(decisionOf("ask"), "ask");
		// Anything else, including "allow", becomes a prompt.
		assert.equal(decisionOf("allow"), "ask");
		assert.equal(decisionOf("bogus"), "ask");
	});
});

describe("turning the guard off is the user's", () => {
	const ROOT = PLUGIN;
	const CACHE = `${homedir()}/.claude/plugins/cache/ellaworks/elladex-agx/0.2.1`;

	for (const command of [
		"claude plugin disable elladex-agx@ellaworks",
		"claude plugin disable elladex-agx",
		"claude plugin disable --all",
		"claude plugin uninstall elladex-agx@ellaworks",
		"claude plugins uninstall -a",
		"claude plugin marketplace remove ellaworks",
		"npx @anthropic-ai/claude-code plugin uninstall elladex-agx@ellaworks",
		`bash -c 'claude plugin disable elladex-agx@ellaworks'`,
	]) {
		it(`denies ${command}`, () => {
			assert.equal(bash(command), "deny");
			assert.equal(bash(command, "claude-sends"), "deny");
		});
	}

	it("leaves other plugin commands alone", () => {
		for (const command of [
			"claude plugin list",
			"claude plugin disable other-plugin@market",
			"claude plugin marketplace remove some-other-marketplace",
			"claude plugin update elladex-agx@ellaworks",
			"echo claude plugin disable elladex-agx",
			'grep -n "plugin disable" README.md',
		]) {
			assert.equal(bash(command), "none", command);
		}
	});

	it("denies settings edits that switch the plugin or all hooks off", () => {
		const settings = `${homedir()}/.claude/settings.json`;
		for (const [old_string, new_string] of [
			['"elladex-agx@ellaworks": true', '"elladex-agx@ellaworks": false'],
			['"model": "x"', '"model": "x", "disableAllHooks": true'],
		]) {
			assert.equal(
				tool("Edit", { file_path: settings, old_string, new_string }),
				"deny",
				new_string,
			);
		}
		assert.equal(
			tool("Write", {
				file_path: settings,
				content:
					'{"pluginConfigs":{"elladex\\u002dagx@ellaworks":{"options":{"send\\u005fmode":"claude\\u002dsends"}}}}',
			}),
			"deny",
			"JSON unicode escapes are read as JSON would",
		);
	});

	it("denies a full rewrite of a settings file that holds this plugin's entries", () => {
		const dir = mkdtempSync(join(tmpdir(), "guard-settings-"));
		try {
			const file = join(dir, ".claude", "settings.json");
			spawnSync("mkdir", ["-p", join(dir, ".claude")]);
			spawnSync("sh", ["-c", `printf '%s' '{"enabledPlugins":{"elladex-agx@ellaworks":true}}' > "${file}"`]);
			assert.equal(
				tool("Write", { file_path: file, content: '{"enabledPlugins":{}}' }),
				"deny",
			);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	it("leaves other plugins' options in settings files alone", () => {
		assert.equal(
			tool("Edit", {
				file_path: "/work/.claude/settings.json",
				old_string: '"pluginConfigs": {}',
				new_string: '"pluginConfigs": {"other@market": {"options": {"x": 1}}}',
			}),
			"none",
		);
		assert.equal(
			tool("Write", {
				file_path: "/nonexistent-dir/.claude/settings.local.json",
				content: '{"pluginConfigs":{"other@market":{"options":{"x":1}}}}',
			}),
			"none",
		);
	});

	it("denies edits to the guard's own files and the plugin registry", () => {
		for (const file_path of [
			join(ROOT, "scripts", "guard-agx.mjs"),
			join(ROOT, "hooks", "hooks.json"),
			`${CACHE}/scripts/guard-agx.mjs`,
			`${homedir()}/.claude/plugins/installed_plugins.json`,
			`${homedir()}/.claude/plugins/known_marketplaces.json`,
		]) {
			assert.equal(
				tool("Edit", { file_path, old_string: "deny", new_string: "allow" }),
				"deny",
				file_path,
			);
			assert.equal(tool("Read", { file_path }), "none", file_path);
		}
		for (const command of [
			`rm -rf ${CACHE}`,
			"rm -rf ~/.claude/plugins/cache/ellaworks/elladex-agx",
			`sed -i '' 's/deny/allow/' ${join(ROOT, "scripts", "guard-agx.mjs")}`,
			"echo '{}' > ~/.claude/plugins/known_marketplaces.json",
			`cp /tmp/empty.json ${join(ROOT, "hooks", "hooks.json")}`,
		]) {
			assert.equal(bash(command), "deny", command);
		}
		for (const command of [
			`cat ${join(ROOT, "scripts", "guard-agx.mjs")}`,
			"ls ~/.claude/plugins",
			"rm -rf ~/.claude/plugins/cache/other-market/other-plugin",
		]) {
			assert.equal(bash(command), "none", command);
		}
	});
});

describe("a clean send prompt in claude-sends mode", () => {
	it("gives one reason, not the parser-fallback warning", () => {
		for (const command of [
			"agx send -- npub1x 'hi'",
			"npx @nostr-agx/cli send npub1x hi",
		]) {
			const verdict = decideCommand(command, "claude-sends");
			assert.equal(verdict.decision, "ask", command);
			assert.doesNotMatch(verdict.reason, /can't fully check|couldn't fully check|can not fully check/i, command);
		}
	});
});
