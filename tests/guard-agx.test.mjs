/**
 * Tests for the elladex-agx PreToolUse guard. Run from the repository root:
 *   node --test tests/*.test.mjs
 * (Node 24 rejects a bare directory argument, hence the glob.) They live
 * outside the plugin folder so they don't ship with it.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, symlinkSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
	decide,
	decideCommand,
	guardEnv,
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

	it("reads only the send mode and AGX_HOME from the environment", () => {
		assert.deepEqual(
			guardEnv({
				CLAUDE_PLUGIN_OPTION_SEND_MODE: "claude-sends",
				AGX_HOME: "/x/.agx",
				AGX_API_KEY: "ela_secret",
				GITHUB_TOKEN: "ghp_secret",
				HOME: "/home/u",
			}),
			{ CLAUDE_PLUGIN_OPTION_SEND_MODE: "claude-sends", AGX_HOME: "/x/.agx" },
		);
	});

	it("still honours the send mode and AGX_HOME when run as the hook", () => {
		const run = (command, env) =>
			spawnSync(process.execPath, [GUARD], {
				input: JSON.stringify({ tool_name: "Bash", tool_input: { command } }),
				env: { PATH: process.env.PATH, HOME: homedir(), ...env },
				encoding: "utf8",
			});
		const decisionOf = (result) =>
			JSON.parse(result.stdout).hookSpecificOutput.permissionDecision;
		const send = `agx send -- ${NPUB} 'hi'`;
		assert.equal(decisionOf(run(send, {})), "deny");
		assert.equal(
			decisionOf(run(send, { CLAUDE_PLUGIN_OPTION_SEND_MODE: "claude-sends" })),
			"ask",
		);
		assert.equal(
			decisionOf(run("cat /srv/agx-home/id.json", { AGX_HOME: "/srv/agx-home" })),
			"deny",
		);
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

// ------------------------------------------------------------- agx login

/** A key-shaped literal (`ela_` and 64 letters), built so no key sits in the source. */
const KEY = `ela_${"Ab".repeat(32)}`;
const EVIL = "https://evil.example";

/** The verdict object for a Bash command. */
function verdictOf(command, mode = "draft", env = {}) {
	return decide(
		{ tool_name: "Bash", tool_input: { command }, cwd: "/work" },
		{ CLAUDE_PLUGIN_OPTION_SEND_MODE: mode, ...env },
	);
}

describe("agx login, whoami, logout and org list need no verdict", () => {
	const cases = [
		"agx login",
		"agx login --json --no-wait",
		"agx login --no-browser",
		"agx login --org acme",
		"agx login --json --no-wait --org acme",
		"agx login --force",
		"agx -p work login",
		"agx login -p work --json",
		"agx login --api-base-url https://app.ellaworks.ai",
		"agx login --api-base-url=https://app.ellaworks.ai/",
		"agx login --api-url https://app.ellaworks.ai/",
		"agx login --api-base-url https://APP.ellaworks.ai:443",
		"agx --api-base-url https://app.ellaworks.ai login",
		"AGX_API_URL=https://app.ellaworks.ai agx login",
		"export AGX_API_URL=https://app.ellaworks.ai",
		"npx -y @nostr-agx/cli login",
		"npx -y @nostr-agx/cli@0.4.0 login --json --no-wait",
		"agx whoami",
		"agx whoami --json",
		"agx logout",
		"agx logout --all",
		"agx logout --local",
		"agx org",
		"agx org list",
		"agx --json org list",
		"agx org list --json",
		"agx org --json list",
		"env -u AGX_API_KEY agx login",
		"unset AGX_HOME AGX_API_KEY",
	];
	for (const command of cases) {
		it(command, () => {
			assert.equal(bash(command), "none", command);
			assert.equal(bash(command, "claude-sends"), "none", command);
		});
	}

	it("in PowerShell too", () => {
		assert.equal(
			tool("PowerShell", {
				command: "$env:AGX_API_URL = 'https://app.ellaworks.ai'; agx login",
			}),
			"none",
		);
	});
});

describe("an agx server other than https://app.ellaworks.ai asks", () => {
	const values = [
		EVIL,
		"http://app.ellaworks.ai",
		"https://app.ellaworks.ai.evil.example",
		"https://app-ellaworks.ai",
		"https://app.ellaworks.ai.",
		"https://app.ellaworks.ai@evil.example",
		"https://user@app.ellaworks.ai",
		"https://user:pw@app.ellaworks.ai",
		"https://app.ellaworks.ai/api",
		"https://app.ellaworks.ai/?next=x",
		"https://app.ellaworks.ai#x",
		"https://app.ellaworks.ai:8443",
		"app.ellaworks.ai",
		"http://localhost:3000",
	];
	for (const url of values) {
		it(`--api-base-url ${url}`, () => {
			for (const command of [
				`agx login --api-base-url '${url}'`,
				`agx login --api-base-url='${url}'`,
				`agx --api-base-url '${url}' login`,
				`agx login --api-url '${url}'`,
				`AGX_API_URL='${url}' agx login`,
			]) {
				assert.equal(bash(command), "ask", command);
				assert.equal(bash(command, "claude-sends"), "ask", command);
			}
		});
	}

	it("asks for a server computed at run time, or none at all", () => {
		for (const command of [
			'agx login --api-base-url "$URL"',
			// biome-ignore lint/suspicious/noTemplateCurlyInString: shell syntax, not a template
			'agx login --api-base-url "${URL}"',
			'agx login --api-base-url "$(cat url.txt)"',
			"agx login --api-base-url",
			'AGX_API_URL="$URL" agx login',
			"AGX_API_URL= agx login",
		]) {
			assert.equal(bash(command), "ask", command);
		}
	});

	it("asks whatever the subcommand", () => {
		for (const command of [
			`agx whoami --api-base-url ${EVIL}`,
			`agx logout --api-url ${EVIL}`,
			`agx org list --api-base-url ${EVIL}`,
			`agx listing list --api-url ${EVIL}`,
			`agx search invoice --api-url=${EVIL}`,
		]) {
			assert.equal(bash(command), "ask", command);
		}
	});

	it("asks for AGX_API_URL set any way: env, export, declare -x", () => {
		for (const command of [
			`AGX_API_URL=${EVIL} agx login`,
			`env AGX_API_URL=${EVIL} agx login`,
			`env -i PATH=/usr/bin AGX_API_URL=${EVIL} agx whoami`,
			`export AGX_API_URL=${EVIL}`,
			`export AGX_API_URL=${EVIL} && agx login`,
			`declare -x AGX_API_URL=${EVIL}`,
			`AGX_API_URL=${EVIL}; agx login`,
		]) {
			assert.equal(bash(command), "ask", command);
		}
	});

	it("asks for AGX_API_URL set in PowerShell", () => {
		for (const command of [
			`$env:AGX_API_URL = '${EVIL}'; agx login`,
			`$env:AGX_API_URL='${EVIL}'`,
			`$Env:agx_api_url = "${EVIL}"`,
			// biome-ignore lint/suspicious/noTemplateCurlyInString: PowerShell syntax, not a template
			"${env:AGX_API_URL} = 'https://evil.example'",
			`Set-Item -Path env:AGX_API_URL -Value ${EVIL}`,
			`[Environment]::SetEnvironmentVariable('AGX_API_URL', '${EVIL}', 'User')`,
			// A value with more after it isn't the default, whatever it starts with.
			"$env:AGX_API_URL = 'https://app.ellaworks.ai' + '@evil.example'; agx login",
			'$env:AGX_API_URL = "https://app.ellaworks.ai" + ".evil.example"',
			"$env:AGX_API_URL = 'https://app.ellaworks.ai'.Replace('app', 'evil')",
			"$env:AGX_API_URL += '@evil.example'",
			`$env:AGX_API_URL ??= '${EVIL}'; agx login`,
			`Set-Item -Path Env:\\AGX_API_URL -Value ${EVIL}`,
			`New-Item -Path Env: -Name AGX_API_URL -Value ${EVIL}`,
			`setx AGX_API_URL ${EVIL}`,
		]) {
			assert.equal(tool("PowerShell", { command }), "ask", command);
		}
	});

	it("asks through every way to reach agx", () => {
		for (const command of [
			`npx -y @nostr-agx/cli login --api-base-url ${EVIL}`,
			`pnpm dlx @nostr-agx/cli login --api-url ${EVIL}`,
			`ssh host agx login --api-base-url ${EVIL}`,
			`ssh host 'agx login --api-base-url ${EVIL}'`,
			`bash -c 'agx login --api-url ${EVIL}'`,
			`"$AGX" login --api-base-url ${EVIL}`,
			`"$AGX" -p work login --api-base-url ${EVIL}`,
			`$(which agx) login --api-base-url ${EVIL}`,
			`node "$(command -v agx)" login --api-base-url ${EVIL}`,
		]) {
			assert.equal(bash(command), "ask", command);
		}
		assert.equal(
			tool("mcp__terminal__run_in_terminal", {
				command: `agx login --api-base-url ${EVIL}`,
			}),
			"ask",
		);
	});

	it("names the real host and the default in the prompt", () => {
		const verdict = verdictOf(
			"agx login --api-base-url https://app.ellaworks.ai@evil.example",
		);
		assert.equal(verdict.decision, "ask");
		assert.match(verdict.reason, /https:\/\/evil\.example/);
		assert.match(verdict.reason, /default Ellaworks server, https:\/\/app\.ellaworks\.ai\./);
	});

	it("keeps a draft-mode send with a server a deny", () => {
		const command = `agx send --api-base-url ${EVIL} -- ${NPUB} 'hi'`;
		assert.equal(bash(command), "deny");
		assert.equal(bash(command, "claude-sends"), "ask");
		assert.equal(bash(`AGX_API_URL=${EVIL} agx send -- ${NPUB} 'hi'`), "deny");
	});

	it("doesn't read a server out of message text after --", () => {
		assert.equal(
			bash(`agx send -- ${NPUB} '--api-url=${EVIL}'`, "claude-sends"),
			"ask",
		);
		const verdict = verdictOf(
			`agx send -- ${NPUB} '--api-url=${EVIL}'`,
			"claude-sends",
		);
		assert.doesNotMatch(verdict.reason, /evil\.example/);
	});
});

describe("organizations: creating one asks, reading needs nothing", () => {
	const cases = [
		"agx org create 'Acme Robotics'",
		"agx org create Acme --slug acme",
		"agx --json org create Acme",
		"agx org delete acme",
		"agx org switch acme",
		"agx login --new-org",
		"agx login --new-org --org-name 'Acme Robotics'",
		"agx login --new-org --org-name 'Acme Robotics' --org-slug acme-robotics",
		"agx login --org-name=Acme",
		"agx login --org-slug acme",
		"agx -p work login --new-org --json --no-wait",
		"agx --org-name Acme login",
		"npx -y @nostr-agx/cli login --new-org",
		`"$AGX" org create Acme`,
	];
	for (const command of cases) {
		it(command, () => {
			assert.equal(bash(command), "ask", command);
			assert.equal(bash(command, "claude-sends"), "ask", command);
		});
	}

	it("says a new organization is being requested", () => {
		assert.match(verdictOf("agx login --new-org").reason, /new Ellaworks organization/);
		assert.match(verdictOf("agx org create Acme").reason, /new Ellaworks organization/);
		assert.match(verdictOf("agx org delete acme").reason, /agx org delete/);
	});
});

describe("API keys stay out of command lines", () => {
	it("denies agx config set apiKey with a value, in every form", () => {
		for (const command of [
			`agx config set apiKey ${KEY}`,
			"agx config set apiKey ela_x",
			"agx config set apiKey=ela_x",
			"agx config set -- apiKey ela_x",
			"agx config set APIKEY ela_x",
			"agx config set apikey ela_x",
			"agx config set api-key ela_x",
			"agx config set api_key ela_x",
			'agx config set apiKey "$KEY"',
			'agx config set apiKey "$(pbpaste)"',
			"agx config set apiKey ela_x --json",
			"agx config set apiKey --stdin ela_x",
			"agx -p work config set apiKey ela_x",
			"npx -y @nostr-agx/cli config set apiKey ela_x",
			"bash -c 'agx config set apiKey ela_x'",
			"ssh host agx config set apiKey ela_x",
		]) {
			assert.equal(bash(command), "deny", command);
			assert.equal(bash(command, "claude-sends"), "deny", command);
		}
	});

	it("asks for agx config set apiKey --stdin", () => {
		for (const command of [
			"agx config set apiKey --stdin",
			"agx config set --stdin apiKey",
			"pbpaste | agx config set apiKey --stdin",
			"agx config set apiKey < key.txt",
		]) {
			assert.equal(bash(command), "ask", command);
			assert.equal(bash(command, "claude-sends"), "ask", command);
		}
		assert.match(
			verdictOf("agx config set apiKey --stdin").reason,
			/agx login/,
		);
	});

	it("still asks for the other config keys", () => {
		for (const command of [
			"agx config set apiBaseUrl https://app.ellaworks.ai",
			`agx config set apiBaseUrl ${EVIL}`,
			"agx config set orgSlug acme",
			"agx config use work",
		]) {
			assert.equal(bash(command), "ask", command);
		}
	});

	it("denies AGX_API_KEY= in any form", () => {
		for (const command of [
			"AGX_API_KEY=ela_x agx whoami",
			"AGX_API_KEY=ela_x",
			"AGX_API_KEY= agx login",
			"env AGX_API_KEY=ela_x agx listing list",
			"env -i AGX_API_KEY=ela_x agx whoami",
			"sudo AGX_API_KEY=ela_x agx whoami",
			"export AGX_API_KEY=ela_x",
			'export AGX_API_KEY="$(pbpaste)"',
			"declare -x AGX_API_KEY=ela_x",
			"AGX_API_KEY+=x",
			"bash -c 'AGX_API_KEY=ela_x agx whoami'",
			"ssh host 'export AGX_API_KEY=ela_x'",
			"echo AGX_API_KEY=ela_x >> .env",
		]) {
			assert.equal(bash(command), "deny", command);
			assert.equal(bash(command, "claude-sends"), "deny", command);
		}
	});

	it("denies AGX_API_KEY set in PowerShell", () => {
		for (const command of [
			"$env:AGX_API_KEY = 'ela_x'",
			"$env:AGX_API_KEY='ela_x'; agx whoami",
			"$ENV:agx_api_key = 'ela_x'",
			// biome-ignore lint/suspicious/noTemplateCurlyInString: PowerShell syntax, not a template
			"${env:AGX_API_KEY} = 'ela_x'",
			"Set-Item -Path env:AGX_API_KEY -Value ela_x",
			"New-Item env:AGX_API_KEY ela_x",
			"[Environment]::SetEnvironmentVariable('AGX_API_KEY', 'ela_x', 'User')",
			"$env:AGX_API_KEY ??= (Get-Clipboard)",
			"$env:AGX_API_KEY = Get-Clipboard",
			"Set-Item Env:\\AGX_API_KEY ela_x",
			"New-Item -Path Env: -Name AGX_API_KEY -Value x",
			"New-Item -Path Env:\\ -Name:AGX_API_KEY -Value x",
			"Rename-Item Env:\\TMPKEY AGX_API_KEY",
			"setx AGX_API_KEY ela_x",
		]) {
			assert.equal(tool("PowerShell", { command }), "deny", command);
		}
	});

	it("denies an ela_ key literal in echo, curl or a script", () => {
		for (const command of [
			`echo ${KEY}`,
			`printf '%s' '${KEY}' | agx config set apiKey --stdin`,
			`curl -H "X-API-Key: ${KEY}" https://app.ellaworks.ai/api/rpc/account/principal/get`,
			`curl -H 'Authorization: Bearer ${KEY}' https://app.ellaworks.ai/api/organizations`,
			`node -e "fetch(u, {headers: {'x-api-key': '${KEY}'}})"`,
			`python3 - <<'EOF'\nkey = "${KEY}"\nEOF`,
		]) {
			assert.equal(bash(command), "deny", command.slice(0, 40));
		}
		assert.equal(
			tool("mcp__terminal__run_in_terminal", { command: `echo ${KEY}` }),
			"deny",
		);
	});

	it("leaves short ela_ words alone", () => {
		for (const command of [
			"echo ela_",
			"echo 'keys look like ela_…'",
			"echo ela_AbCd",
			`echo xela_${"Ab".repeat(32)}`,
		]) {
			assert.equal(bash(command), "none", command);
		}
	});

	it("leaves comparisons and unsets alone", () => {
		for (const command of [
			'[ -z "$AGX_API_KEY" ] && echo unset',
			'test "$AGX_API_KEY" = ""',
			"env -u AGX_API_KEY agx whoami",
			"unset AGX_API_KEY",
		]) {
			assert.equal(bash(command), "none", command);
		}
	});
});

describe("credentials.json and AGX_HOME", () => {
	const credentials = `${homedir()}/.agx/credentials.json`;

	it("denies every read of credentials.json", () => {
		for (const command of [
			"cat ~/.agx/credentials.json",
			"jq . ~/.agx/credentials.json",
			`cat ${credentials}`,
			"cat $HOME/.agx/credentials.json",
			"cat $AGX_HOME/credentials.json",
			// biome-ignore lint/suspicious/noTemplateCurlyInString: shell syntax, not a template
			'cat "${AGX_HOME}/credentials.json"',
			"cat ~/.agx/profiles/default/pending-login.json",
			"grep -r ela_ ~/.agx",
			"cp ~/.agx/credentials.json /tmp/c.json",
		]) {
			assert.equal(bash(command, "claude-sends"), "deny", command);
		}
		assert.equal(
			bash("cat /srv/agx-home/credentials.json", "draft", {
				AGX_HOME: "/srv/agx-home",
			}),
			"deny",
		);
		assert.equal(tool("Read", { file_path: credentials }), "deny");
		assert.equal(
			tool(
				"Read",
				{ file_path: "/srv/agx-home/credentials.json" },
				{ AGX_HOME: "/srv/agx-home" },
			),
			"deny",
		);
		assert.equal(
			tool("Grep", { pattern: "ela_", path: credentials }),
			"deny",
		);
		assert.equal(
			tool("Grep", { pattern: "ela_", path: "/", glob: "**/.agx/credentials.json" }),
			"deny",
		);
		assert.equal(tool("Glob", { pattern: "~/.agx/credentials.json" }), "deny");
		assert.equal(
			tool("Glob", { pattern: "*.json", path: `${homedir()}/.agx` }),
			"deny",
		);
		assert.equal(tool("mcp__fs__read_file", { path: credentials }), "deny");
		assert.equal(
			tool("PowerShell", {
				command: "Get-Content $env:AGX_HOME\\credentials.json",
			}),
			"deny",
		);
	});

	it("points to agx whoami and agx login when it denies", () => {
		const verdict = verdictOf("cat ~/.agx/credentials.json");
		assert.match(verdict.reason, /credentials\.json/);
		assert.match(verdict.reason, /agx whoami/);
		assert.match(verdict.reason, /agx login/);
		assert.match(verdict.reason, /revoke/);
	});

	it("denies AGX_HOME= in any form", () => {
		for (const command of [
			"AGX_HOME=/tmp/x agx login",
			// The hole this closes: a login written where Claude can read it.
			"AGX_HOME=/tmp/x agx login --json --no-wait && cat /tmp/x/credentials.json",
			"env AGX_HOME=/tmp/x agx login",
			"env -i PATH=/usr/bin AGX_HOME=/tmp/x agx whoami",
			"export AGX_HOME=/tmp/x",
			"export AGX_HOME=$(mktemp -d)",
			"declare -x AGX_HOME=/tmp/x",
			"AGX_HOME=/tmp/x npx -y @nostr-agx/cli login",
			"bash -c 'AGX_HOME=/tmp/x agx login'",
			"ssh host 'AGX_HOME=/tmp/x agx login'",
			"AGX_HOME=/tmp/x node --test",
		]) {
			assert.equal(bash(command), "deny", command);
			assert.equal(bash(command, "claude-sends"), "deny", command);
		}
		for (const command of [
			"$env:AGX_HOME = 'C:\\tmp\\x'; agx login",
			"$env:AGX_HOME='C:\\tmp\\x'",
			"Set-Item env:AGX_HOME C:\\tmp\\x",
			"[Environment]::SetEnvironmentVariable(\"AGX_HOME\", \"C:\\tmp\\x\")",
			"Set-Item -Path Env:\\AGX_HOME -Value C:\\tmp\\x",
			"Set-Item Env:\\AGX_HOME C:\\tmp\\x",
			"si -Path:Env:\\AGX_HOME C:\\tmp\\x",
			"New-Item -Path Env: -Name AGX_HOME -Value C:\\tmp\\x",
			"setx AGX_HOME C:\\tmp\\x",
			"setx /M AGX_HOME C:\\tmp\\x",
		]) {
			assert.equal(tool("PowerShell", { command }), "deny", command);
		}
		// The same commands through an MCP terminal, backslashes intact.
		assert.equal(
			tool("mcp__terminal__run_in_terminal", {
				command: "Set-Item -Path Env:\\AGX_HOME -Value C:\\tmp\\x",
			}),
			"deny",
		);
	});
});

describe("AGX_HOME, AGX_API_KEY and AGX_API_URL set without NAME=", () => {
	// Every shell way to give a variable a value, or to export one set
	// elsewhere. `unset` and `env -u` stay allowed (see the no-verdict tests).
	const forms = (NAME, value) => [
		`read ${NAME} <<< ${value}; export ${NAME}; agx login --json --no-wait`,
		`read -r ${NAME} < value.txt`,
		`IFS= read -r ${NAME} < value.txt`,
		`printf -v ${NAME} '%s' ${value}; export ${NAME}; agx login`,
		`printf -v${NAME} '%s' ${value}`,
		`print -v ${NAME} ${value}`,
		`mapfile -t ${NAME} < value.txt`,
		`readarray ${NAME} < value.txt`,
		`getopts ab ${NAME}`,
		`export ${NAME}`,
		`declare -x ${NAME}`,
		`typeset -gx ${NAME}`,
		`local ${NAME}`,
		`readonly ${NAME}`,
		`builtin export ${NAME}`,
		`command read ${NAME} < value.txt`,
		`declare -n r=${NAME}; r=${value}; agx login`,
		`typeset -n r=${NAME}`,
		`for ${NAME} in ${value}; do agx login; done`,
		`select ${NAME} in ${value}; do break; done`,
		`set -gx ${NAME} ${value}`,
		`setenv ${NAME} ${value}`,
		`launchctl setenv ${NAME} ${value}`,
		`: \${${NAME}:=${value}}; agx login`,
		`: \${${NAME}=${value}}`,
		`: \${${NAME}::=${value}}`,
		`${NAME}[0]=${value} agx login`,
		`eval 'read ${NAME} <<< ${value}'`,
		`bash -c 'read ${NAME} <<< ${value}; agx login'`,
		`ssh host 'printf -v ${NAME} %s ${value}; agx login'`,
	];

	it("denies AGX_HOME set any of these ways", () => {
		for (const command of forms("AGX_HOME", "/tmp/x")) {
			assert.equal(bash(command), "deny", command);
			assert.equal(bash(command, "claude-sends"), "deny", command);
		}
		assert.match(verdictOf("read AGX_HOME <<< /tmp/x").reason, /AGX_HOME/);
	});

	it("denies AGX_API_KEY set any of these ways", () => {
		for (const command of forms("AGX_API_KEY", "x")) {
			assert.equal(bash(command), "deny", command);
		}
		assert.equal(bash(": ${AGX_API_KEY:=$(pbpaste)}; export AGX_API_KEY"), "deny");
	});

	it("asks for AGX_API_URL set any of these ways", () => {
		for (const command of forms("AGX_API_URL", EVIL)) {
			assert.equal(bash(command), "ask", command);
		}
		// A value it can't read is not the default.
		assert.equal(bash(": ${AGX_API_URL:=https://app.ellaworks.ai}"), "none");
		assert.equal(
			bash("AGX_API_URL=https://app.ellaworks.ai; export AGX_API_URL; agx login"),
			"ask",
		);
	});

	it("leaves other variables, tests and unsets alone", () => {
		for (const command of [
			"read -r line < file.txt; agx whoami",
			"printf -v now '%s' x; agx whoami",
			"for f in *.json; do jq . \"$f\"; done && agx whoami",
			"export PATH=\"$HOME/bin:$PATH\" && agx whoami",
			"declare -a arr=(1 2)",
			"set -e; agx whoami",
			"set -e AGX_HOME",
			"unset AGX_HOME AGX_API_KEY AGX_API_URL",
			"launchctl unsetenv AGX_HOME",
		]) {
			assert.equal(bash(command), "none", command);
		}
	});
});

describe("HOME moved for an agx command", () => {
	// agx keeps its files in $HOME/.agx when AGX_HOME is unset (Node's
	// homedir() reads HOME; USERPROFILE on Windows).
	it("denies HOME set in a command line that runs agx", () => {
		for (const command of [
			"HOME=/tmp/x agx login --json --no-wait",
			"HOME=/tmp/x agx whoami",
			"env HOME=/tmp/x agx login",
			"export HOME=/tmp/x; agx login",
			"export HOME=/tmp/x && agx login --json --no-wait",
			"HOME=/tmp/x; agx login",
			"HOME=/tmp/x npx -y @nostr-agx/cli login",
			'HOME=/tmp/x node "$(command -v agx)" login',
			'HOME=/tmp/x "$AGX" login',
			"HOME=/tmp/x bash -c 'agx login'",
			"bash -c 'HOME=/tmp/x agx whoami'",
			"ssh host 'HOME=/tmp/x agx login'",
			"read HOME <<< /tmp/x; agx login",
			"for HOME in /tmp/x; do agx login; done",
			"typeset -n r=HOME; r=/tmp/x; agx login",
			"cd /tmp/x && HOME=$PWD agx login",
		]) {
			assert.equal(bash(command), "deny", command);
			assert.equal(bash(command, "claude-sends"), "deny", command);
		}
		for (const command of [
			"$env:USERPROFILE = 'C:\\tmp\\x'; agx login",
			"$env:HOME = '/tmp/x'; agx login",
			"Set-Item Env:\\USERPROFILE C:\\tmp\\x; agx login",
			"[Environment]::SetEnvironmentVariable('USERPROFILE', 'C:\\x'); agx login",
		]) {
			assert.equal(tool("PowerShell", { command }), "deny", command);
		}
		const verdict = verdictOf("HOME=/tmp/x agx login");
		assert.match(verdict.reason, /HOME/);
		assert.match(verdict.reason, /agx login/);
		assert.match(verdict.reason, /revoke/);
	});

	it("leaves HOME alone when agx doesn't run, and reading it", () => {
		for (const command of [
			"HOME=/tmp/x npm test",
			"HOME=/tmp/fake node --test tests/*.test.mjs",
			"HOME=/tmp/h pnpm --filter @nostr-agx/cli test",
			"export HOME=/tmp/x",
			"echo $HOME && agx whoami",
			"cd ~ && agx whoami",
			'[ "$HOME" = /Users/x ] && agx whoami',
			'git commit -m "HOME=/tmp/x agx login is denied"',
		]) {
			assert.equal(bash(command), "none", command);
		}
	});
});

describe("a shell startup file is a command line", () => {
	// What is written there runs in every later shell, Claude Code's included.
	it("reads a heredoc written to a startup file as shell", () => {
		for (const [command, decision] of [
			["cat >> ~/.zshenv <<'EOF'\nexport AGX_HOME=/tmp/x\nEOF", "deny"],
			["cat >> ~/.bashrc <<EOF\nexport AGX_API_KEY=x\nEOF", "deny"],
			["tee -a ~/.profile <<'EOF'\nread AGX_HOME < /tmp/h\nEOF", "deny"],
			[`cat > ~/.config/fish/conf.d/agx.fish <<EOF\nset -gx AGX_API_URL ${EVIL}\nEOF`, "ask"],
			["cat >> .envrc <<EOF\nexport AGX_HOME=/tmp/x\nEOF", "deny"],
			["cat >> ~/.zshrc <<'EOF'\nexport PATH=\"$HOME/.local/bin:$PATH\"\nEOF", "none"],
			["cat >> ~/.zshrc <<'EOF'\nalias ll='ls -la'\nEOF", "none"],
			// Any other file is still text.
			["cat > notes.md <<EOF\nexport AGX_HOME=/tmp/x\nEOF", "none"],
		]) {
			assert.equal(bash(command), decision, command);
		}
	});

	it("checks what Write and Edit put into a startup file", () => {
		const zshenv = `${homedir()}/.zshenv`;
		assert.equal(
			tool("Write", { file_path: zshenv, content: "export AGX_HOME=/tmp/x\n" }),
			"deny",
		);
		assert.equal(
			tool("Edit", {
				file_path: `${homedir()}/.bashrc`,
				old_string: "# end",
				new_string: `export AGX_API_URL=${EVIL}\n# end`,
			}),
			"ask",
		);
		assert.equal(
			tool("MultiEdit", {
				file_path: `${homedir()}/.zprofile`,
				edits: [{ old_string: "a", new_string: "export AGX_API_KEY=x" }],
			}),
			"deny",
		);
		assert.equal(
			tool("Write", {
				file_path: zshenv,
				content: 'export PATH="$HOME/bin:$PATH"\n',
			}),
			"none",
		);
		assert.equal(
			tool("Write", {
				file_path: "/work/docs/setup.md",
				content: "export AGX_HOME=/tmp/x\n",
			}),
			"none",
		);
	});
});

describe("agx run after loading variables the guard can't read asks", () => {
	// Ask, not deny, by design: what is loaded is usually a project's own
	// .env, and the user can look at it before approving.
	it("asks", () => {
		for (const command of [
			"cat > /tmp/e <<EOF\nAGX_HOME=/tmp/x\nEOF\nenv $(cat /tmp/e) agx login --json --no-wait",
			"source /tmp/e; agx login",
			"set -a; . /tmp/e; set +a; agx login",
			"export $(cat /tmp/e) && agx login",
			'eval "$(cat /tmp/e)"; agx login',
			"dotenv -e /tmp/e -- agx login",
			'node --env-file=/tmp/e "$(command -v agx)" login',
			"bash -c 'source /tmp/e && agx whoami'",
		]) {
			assert.equal(bash(command), "ask", command);
			assert.equal(bash(command, "claude-sends"), "ask", command);
		}
		assert.match(
			verdictOf("source /tmp/e; agx login").reason,
			/can't read/,
		);
	});

	it("leaves loading alone when agx doesn't run", () => {
		for (const command of [
			"source .venv/bin/activate && pytest",
			"export $(grep -v '^#' .env | xargs) && npm start",
			"node --env-file=.env server.js",
		]) {
			assert.equal(bash(command), "none", command);
		}
	});
});

describe("an inherited AGX_API_KEY is never printed", () => {
	it("denies printing or passing it on", () => {
		for (const command of [
			"printenv AGX_API_KEY",
			"echo $AGX_API_KEY",
			'echo "${AGX_API_KEY}"',
			'echo "key: $AGX_API_KEY"',
			'printf \'%s\' "$AGX_API_KEY" | pbcopy',
			"echo ${AGX_API_KEY:0:12}",
			'curl -H "X-API-Key: $AGX_API_KEY" https://app.ellaworks.ai/api/rpc/account/principal/get',
			"bash -c 'echo $AGX_API_KEY'",
			'echo "$(printenv AGX_API_KEY)"',
			"declare -p AGX_API_KEY",
			"env | grep AGX",
			"env | grep -i api_key",
			"printenv | grep -i agx",
			"set | grep AGX_API",
			"export -p | rg -i agx",
		]) {
			assert.equal(bash(command), "deny", command);
			assert.equal(bash(command, "claude-sends"), "deny", command);
		}
		for (const command of [
			"Write-Output $env:AGX_API_KEY",
			'echo "key=$env:AGX_API_KEY"',
			"Get-Item Env:\\AGX_API_KEY",
			"gci env:AGX_API_KEY",
		]) {
			assert.equal(tool("PowerShell", { command }), "deny", command);
		}
		const verdict = verdictOf("echo $AGX_API_KEY");
		assert.match(verdict.reason, /\[ -n "\$AGX_API_KEY" \] && echo set/);
		assert.match(verdict.reason, /revoke/);
	});

	it("leaves a test that prints nothing but 'set' alone", () => {
		for (const command of [
			'[ -n "$AGX_API_KEY" ] && echo set',
			'if [ -n "$AGX_API_KEY" ]; then echo set; fi',
			'test -n "$AGX_API_KEY" && echo set',
			"[[ -n $AGX_API_KEY ]] && echo set",
			"echo ${AGX_API_KEY:+set}",
			"echo ${#AGX_API_KEY}",
			"bash -c '[ -n \"$AGX_API_KEY\" ] && echo set'",
			"env | grep PATH",
			"printenv HOME",
		]) {
			assert.equal(bash(command), "none", command);
		}
		for (const command of [
			"if ($env:AGX_API_KEY) { 'set' }",
			"Test-Path Env:AGX_API_KEY",
			"Remove-Item Env:\\AGX_API_KEY",
		]) {
			assert.equal(tool("PowerShell", { command }), "none", command);
		}
	});
});

describe("API key and AGX_HOME deny reasons send Claude to agx login", () => {
	for (const command of [
		"agx config set apiKey ela_x",
		"AGX_API_KEY=ela_x agx whoami",
		`echo ${KEY}`,
		"AGX_HOME=/tmp/x agx login",
	]) {
		it(command.slice(0, 40), () => {
			const verdict = verdictOf(command);
			assert.equal(verdict.decision, "deny");
			assert.match(verdict.reason, /agx login/);
			assert.match(verdict.reason, /revoke/);
		});
	}
});

describe("listing and domain writes still ask, --wait included", () => {
	const cases = [
		"agx register --visibility private --slug me",
		"agx listing publish --visibility unlisted",
		"agx listing publish --visibility public --wait",
		"agx domain add example.com",
		"agx domain verify d1 --wait",
		"agx domain verify d1 --wait --timeout 10m",
		`"$AGX" listing publish --wait`,
		`"$AGX" domain verify d1 --wait`,
	];
	for (const command of cases) {
		it(command, () => {
			assert.equal(bash(command), "ask");
			assert.equal(bash(command, "claude-sends"), "ask");
		});
	}
});

describe("mentions of login commands in data need no verdict", () => {
	const cases = [
		'grep -rn "agx config set apiKey" .',
		"rg AGX_API_KEY docs",
		'rg -n "AGX_API_KEY=" docs',
		"grep -rn 'AGX_HOME=' plugins",
		'grep -n "agx login --new-org" README.md',
		'git commit -m "docs: never run agx config set apiKey <key>"',
		'git commit -m "fix(guard): deny AGX_HOME=/tmp/x and AGX_API_KEY=x"',
		`gh pr create --title "guard" --body "agx login --api-base-url ${EVIL} asks"`,
		"cat > notes.md <<EOF\nagx config set apiKey ela_x\nAGX_HOME=/tmp/x agx login\nEOF",
	];
	for (const command of cases) {
		it(command.slice(0, 60), () => {
			assert.equal(bash(command), "none", command);
		});
	}

	// By design: a key-shaped literal is refused where a program would use it
	// (an echo or curl argument, a script fed to an interpreter), not in text
	// the guard reads as data. Keys reach Claude only if someone pastes one.
	it("a real ela_ key literal in a commit message, PR body, pattern or written heredoc", () => {
		for (const command of [
			`git commit -m "chore: revoke ${KEY}"`,
			`git commit -m "$(cat <<'EOF'\nrevoke ${KEY}\nEOF\n)"`,
			`gh pr create --title "rotate" --body "revoked ${KEY}"`,
			`cat > notes.md <<'EOF'\nold key ${KEY}\nEOF`,
			`rg -n "${KEY}" logs`,
			`grep -rn ${KEY} logs`,
		]) {
			assert.equal(bash(command), "none", command.slice(0, 40));
		}
		// The same literal where it would be used is still refused.
		assert.equal(bash(`bash <<'EOF'\necho ${KEY}\nEOF`), "deny");
		assert.equal(bash(`echo ${KEY} > notes.md`), "deny");
	});
});

describe("the sign-in approval page is the user's", () => {
	it("denies a browser tool opening /auth/device", () => {
		for (const [name, url] of [
			[
				"mcp__Claude_Browser__navigate",
				"https://app.ellaworks.ai/auth/device?code=WDJB-MJHT",
			],
			["mcp__claude-in-chrome__navigate", "app.ellaworks.ai/auth/device"],
			["mcp__Claude_Browser__preview_start", "http://localhost:3000/auth/device/"],
			["mcp__Control_Chrome__open_url", "https://app.ellaworks.ai/en/auth/device"],
			["mcp__playwright__browser_navigate", "https://APP.ellaworks.ai/Auth/Device"],
			["mcp__x__fetch", "https://app.ellaworks.ai/api/auth/device/token"],
			["mcp__x__open", "https://app.ellaworks.ai/auth%2Fdevice"],
		]) {
			assert.equal(tool(name, { url }), "deny", `${name} ${url}`);
		}
		assert.equal(
			tool("mcp__x__open", { href: "https://app.ellaworks.ai/auth/device" }),
			"deny",
		);
		assert.match(
			decide(
				{
					tool_name: "mcp__Claude_Browser__navigate",
					tool_input: { url: "https://app.ellaworks.ai/auth/device" },
				},
				{},
			).reason,
			/agx login/,
		);
	});

	it("denies repeated slashes, which the server redirects to the page", () => {
		for (const url of [
			"https://app.ellaworks.ai//auth/device?code=WDJB-MJHT",
			"https://app.ellaworks.ai/auth//device",
			"https://app.ellaworks.ai///auth///device/",
			"https://app.ellaworks.ai/auth\\device",
			"https://app.ellaworks.ai/en//auth/device",
		]) {
			assert.equal(tool("mcp__Claude_Browser__navigate", { url }), "deny", url);
		}
	});

	it("denies a page that redirects a signed-in browser to it", () => {
		for (const url of [
			"https://app.ellaworks.ai/auth/login?redirectTo=%2Fauth%2Fdevice%3Fcode%3DWDJB-MJHT",
			"https://app.ellaworks.ai/auth/login?next=/auth/device",
			"https://app.ellaworks.ai/auth/login?redirectTo=https%3A%2F%2Fapp.ellaworks.ai%2Fauth%2Fdevice",
			"https://app.ellaworks.ai/auth/signup?callbackURL=%2Fen%2Fauth%2Fdevice",
			"https://app.ellaworks.ai/auth/login?redirectTo=%2F%2Fauth%2Fdevice",
			// A redirect inside a redirect.
			"https://app.ellaworks.ai/auth/login?redirectTo=%2Fauth%2Flogin%3FredirectTo%3D%252Fauth%252Fdevice",
		]) {
			assert.equal(tool("mcp__Claude_Browser__navigate", { url }), "deny", url);
		}
	});

	it("denies the page inside a batch of browser actions", () => {
		for (const name of [
			"mcp__Claude_Browser__browser_batch",
			"mcp__claude-in-chrome__browser_batch",
		]) {
			assert.equal(
				tool(name, {
					actions: [
						{ name: "computer", input: { action: "screenshot" } },
						{
							name: "navigate",
							input: {
								url: "https://app.ellaworks.ai/auth/device?code=WDJB-MJHT",
							},
						},
					],
				}),
				"deny",
				name,
			);
		}
		// Nested commands and paths are checked too.
		assert.equal(
			tool("mcp__x__run", { steps: [{ command: "AGX_HOME=/tmp/x agx login" }] }),
			"deny",
		);
		assert.equal(
			tool("mcp__x__read", {
				files: [{ path: `${homedir()}/.agx/credentials.json` }],
			}),
			"deny",
		);
	});

	it("leaves other pages alone", () => {
		for (const url of [
			"https://app.ellaworks.ai/elladex",
			"https://app.ellaworks.ai/elladex/listings",
			"https://app.ellaworks.ai/auth/device-help",
			"https://app.ellaworks.ai/auth/login?redirectTo=%2Felladex",
			"https://github.com/ellavox-ai/elacity-mega/tree/main/apps/web/app/auth/device",
			"https://datatracker.ietf.org/doc/html/rfc8628",
			"https://www.google.com/search?q=rfc+8628+device+flow",
		]) {
			assert.equal(tool("mcp__Claude_Browser__navigate", { url }), "none", url);
		}
		assert.equal(
			tool("mcp__Claude_Browser__browser_batch", {
				actions: [
					{ name: "navigate", input: { url: "https://example.com" } },
					{ name: "computer", input: { action: "screenshot" } },
				],
			}),
			"none",
		);
	});
});

describe("a listing's manage page asks: only a human admin clicks Publish", () => {
	const PAGE = "https://app.ellaworks.ai/elladex/listings/l_7?org=acme";

	it("asks before a browser tool opens /elladex/listings/<id>", () => {
		for (const [name, url] of [
			["mcp__Claude_Browser__navigate", PAGE],
			["mcp__claude-in-chrome__navigate", "app.ellaworks.ai/elladex/listings/l_7"],
			[
				"mcp__Control_Chrome__open_url",
				"https://app.ellaworks.ai/elladex/listings/l_7#domain-handle",
			],
			["mcp__playwright__browser_navigate", "https://APP.ellaworks.ai/Elladex/Listings/L_7"],
			["mcp__x__open", "https://app.ellaworks.ai/en/elladex/listings/l_7/"],
			["mcp__x__open", "https://stage.ellaworks.ai/elladex/listings/l_7"],
			["mcp__Claude_Browser__preview_start", "http://localhost:3000/elladex/listings/l_7"],
			["mcp__x__open", "/elladex/listings/l_7"],
		]) {
			assert.equal(tool(name, { url }), "ask", `${name} ${url}`);
		}
		// The send mode doesn't change it.
		assert.equal(
			tool(
				"mcp__Claude_Browser__navigate",
				{ url: PAGE },
				{ CLAUDE_PLUGIN_OPTION_SEND_MODE: "claude-sends" },
			),
			"ask",
		);
	});

	it("says only a human organization admin may click Publish", () => {
		const verdict = decide(
			{ tool_name: "mcp__Claude_Browser__navigate", tool_input: { url: PAGE } },
			{},
		);
		assert.equal(verdict.decision, "ask");
		assert.match(verdict.reason, /only a human organization admin may click Publish/);
		assert.match(verdict.reason, /\/elladex\/listings\//);
	});

	it("asks for repeated slashes and a sign-in page that redirects there", () => {
		for (const url of [
			"https://app.ellaworks.ai//elladex//listings/l_7",
			"https://app.ellaworks.ai/elladex\\listings\\l_7",
			"https://app.ellaworks.ai/elladex%2Flistings%2Fl_7",
			"https://app.ellaworks.ai/auth/login?redirectTo=/elladex/listings/l_7",
			"https://app.ellaworks.ai/auth/login?redirectTo=%2Felladex%2Flistings%2Fl_7",
			"https://app.ellaworks.ai/auth/login?redirectTo=https%3A%2F%2Fapp.ellaworks.ai%2Felladex%2Flistings%2Fl_7",
		]) {
			assert.equal(tool("mcp__Claude_Browser__navigate", { url }), "ask", url);
		}
	});

	it("asks inside a batch of browser actions", () => {
		for (const name of [
			"mcp__Claude_Browser__browser_batch",
			"mcp__claude-in-chrome__browser_batch",
		]) {
			assert.equal(
				tool(name, {
					actions: [
						{ name: "computer", input: { action: "screenshot" } },
						{ name: "navigate", input: { url: PAGE } },
					],
				}),
				"ask",
				name,
			);
		}
	});

	it("still denies when the same batch also opens the approval page", () => {
		assert.equal(
			tool("mcp__Claude_Browser__browser_batch", {
				actions: [
					{ name: "navigate", input: { url: PAGE } },
					{
						name: "navigate",
						input: { url: "https://app.ellaworks.ai/auth/device" },
					},
				],
			}),
			"deny",
		);
	});

	it("leaves the list of listings, public agent pages and source code alone", () => {
		for (const url of [
			"https://app.ellaworks.ai/elladex/listings",
			"https://app.ellaworks.ai/elladex/listings/",
			"https://app.ellaworks.ai/elladex/listings?org=acme",
			"https://app.ellaworks.ai/elladex/submit",
			`https://app.ellaworks.ai/elladex/agents/${NPUB}`,
			"https://app.ellaworks.ai/auth/login?redirectTo=%2Felladex%2Flistings",
			"https://github.com/ellavox-ai/elacity-mega/tree/main/apps/web/app/(elladex)/elladex/listings/[listingId]",
		]) {
			assert.equal(tool("mcp__Claude_Browser__navigate", { url }), "none", url);
		}
	});

	it("doesn't stop Bash or a file tool that only mentions the page", () => {
		assert.equal(bash(`echo ${PAGE}`), "none");
		assert.equal(bash(`grep -rn "/elladex/listings/" docs`), "none");
		assert.equal(tool("Read", { file_path: "/work/elladex/listings/l_7.md" }), "none");
	});

	it("prints an ask from the hook process", () => {
		const result = spawnSync(process.execPath, [GUARD], {
			input: JSON.stringify({
				hook_event_name: "PreToolUse",
				tool_name: "mcp__Claude_Browser__navigate",
				tool_input: { url: PAGE },
			}),
			env: { PATH: process.env.PATH, HOME: homedir() },
			encoding: "utf8",
		});
		assert.equal(result.status, 0);
		const out = JSON.parse(result.stdout).hookSpecificOutput;
		assert.equal(out.permissionDecision, "ask");
		assert.match(out.permissionDecisionReason, /click Publish/);
	});
});

describe("the login skill", () => {
	const skill = readFileSync(
		join(PLUGIN, "skills", "login", "SKILL.md"),
		"utf8",
	);
	const frontmatter = skill.split(/^---$/m)[1] ?? "";

	it("is model-invocable, named login, with the argument hint", () => {
		assert.match(frontmatter, /^name: login$/m);
		assert.match(frontmatter, /^description: .*log in/im);
		assert.match(
			frontmatter,
			/^argument-hint: "\[--org <slug> \| --new-org <name>\]"$/m,
		);
		assert.doesNotMatch(frontmatter, /disable-model-invocation/);
	});

	it("runs only the commands the guard lets through without a prompt", () => {
		for (const command of [
			"agx --version",
			"agx whoami --json",
			"agx login --json --no-wait",
			"agx login --json --no-wait --org acme",
			"agx whoami",
			// The skill's way to tell whether AGX_API_KEY is set.
			'[ -n "$AGX_API_KEY" ] && echo set',
		]) {
			assert.equal(bash(command), "none", command);
		}
	});

	it("keeps Claude off the key and the confirmation links", () => {
		assert.match(skill, /Never print or inspect `AGX_API_KEY`/);
		assert.match(skill, /Never open that link, or click Publish/);
		const listAgent = readFileSync(
			join(HERE, "..", "plugins", "elladex", "skills", "list-agent", "SKILL.md"),
			"utf8",
		);
		assert.match(listAgent, /Never open that link, or click Publish/);
	});
});

describe("hook process: agx login", () => {
	function run(command) {
		return spawnSync(process.execPath, [GUARD], {
			input: JSON.stringify({
				hook_event_name: "PreToolUse",
				tool_name: "Bash",
				tool_input: { command },
			}),
			env: { ...process.env, CLAUDE_PLUGIN_OPTION_SEND_MODE: "" },
			encoding: "utf8",
		});
	}

	it("prints nothing for agx login", () => {
		const result = run("agx login --json --no-wait");
		assert.equal(result.status, 0);
		assert.equal(result.stdout, "");
	});

	it("prints an ask for agx org create", () => {
		const result = run("agx org create 'Acme Robotics'");
		assert.equal(result.status, 0);
		assert.equal(
			JSON.parse(result.stdout).hookSpecificOutput.permissionDecision,
			"ask",
		);
	});

	it("prints a deny for agx config set apiKey <value>", () => {
		const result = run("agx config set apiKey ela_x");
		assert.equal(result.status, 0);
		const out = JSON.parse(result.stdout).hookSpecificOutput;
		assert.equal(out.permissionDecision, "deny");
		assert.match(out.permissionDecisionReason, /agx login/);
	});
});

describe("known gaps in the login rules (documented, not caught)", () => {
	// See the README's Safety section. If one starts failing, the guard got
	// stronger; move it to the caught list.
	it("a glob for the key directory", () => {
		assert.equal(bash("cat ~/.a?x/credentials.json"), "none");
	});

	it("an agx server stored in the profile or inherited from the shell", () => {
		// The hook sees the command, not the profile, and its environment may
		// differ from the shell's: agx login itself has no verdict.
		assert.equal(bash("agx login", "draft", { AGX_API_URL: EVIL }), "none");
	});

	it("a browser tool that reaches the approval page by script", () => {
		assert.equal(
			tool("mcp__claude-in-chrome__javascript_tool", {
				text: "location.href = 'https://app.ellaworks.ai/auth/device'",
			}),
			"none",
		);
	});

	it("a click on Publish once a listing's manage page is open", () => {
		// The guard asks before a browser tool opens the page; it can't tell
		// which button a click on an open page lands on.
		assert.equal(
			tool("mcp__Claude_Browser__computer", {
				action: "left_click",
				coordinate: [640, 360],
			}),
			"none",
		);
		assert.equal(
			tool("mcp__claude-in-chrome__javascript_tool", {
				text: "location.href = '/elladex/listings/l_7'",
			}),
			"none",
		);
	});

	it("a URL typed into the browser's address bar", () => {
		assert.equal(
			tool("mcp__Claude_Browser__computer", {
				action: "type",
				text: "https://app.ellaworks.ai/auth/device\n",
			}),
			"none",
		);
	});

	it("a variable set in one call of a terminal that keeps its shell", () => {
		// The Bash tool starts each call fresh; an MCP terminal may not, so
		// HOME set in one call and agx run in the next aren't connected.
		assert.equal(
			tool("mcp__terminal__run_in_terminal", { command: "export HOME=/tmp/x" }),
			"none",
		);
	});

	it("a read of a moved login, once the move itself got through", () => {
		assert.equal(bash("cat /tmp/x/credentials.json"), "none");
		assert.equal(bash("grep -r ela_ /tmp/x"), "none");
	});

	it("variables loaded by a program it doesn't know", () => {
		assert.equal(bash("doppler run -- agx login"), "none");
	});

	it("the whole environment printed with no filter", () => {
		// Deliberate: `env` and `printenv` are everyday commands, and refusing
		// every dump would block ordinary debugging. Filtered for the key, they
		// are denied (see "an inherited AGX_API_KEY is never printed").
		for (const command of [
			"env",
			"printenv",
			"env | sort",
			"export -p",
			"env > /tmp/env.txt",
		]) {
			assert.equal(bash(command), "none", command);
		}
		assert.equal(tool("PowerShell", { command: "$env:AGX_API_KEY" }), "none");
		assert.equal(
			bash("python3 -c 'import os; print(os.environ[\"AGX_API_KEY\"])'"),
			"none",
		);
	});
});
