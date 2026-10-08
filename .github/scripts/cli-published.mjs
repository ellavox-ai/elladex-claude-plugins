#!/usr/bin/env node
/**
 * Release-order check: every `@nostr-agx/cli@<range>` that this repository
 * tells people to install must already resolve on npm. A branch that needs a
 * CLI version that isn't published yet fails here, so it can't reach `main`
 * (which is what the marketplace serves) before that release.
 *
 * Run from the repository root:
 *   node .github/scripts/cli-published.mjs
 * It needs `npm` and the network. The scan itself (`installRanges`) needs
 * neither, and tests/cli-published.test.mjs runs it offline.
 *
 * Dependency-free ESM for Node >= 20.
 */
import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync, realpathSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const PACKAGE = "@nostr-agx/cli";

/** What users read and run: the READMEs, the docs, the skills, the examples.
 * Not the guard's tests, whose commands are inputs to the guard. */
const SCANNED = ["README.md", "CHANGELOG.md", "docs", "examples", "plugins"];
const TEXT_FILE = /\.(?:md|sh|mjs|js|json|ya?ml|txt)$/;
/** `@nostr-agx/cli@^0.4.0`, `@nostr-agx/cli@0.3.0`, `@nostr-agx/cli@~0.4.1`. */
const SPEC = /@nostr-agx\/cli@([~^]?\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)/g;

/** Every file under `path`, which may itself be a file. */
function filesUnder(path) {
	let entries;
	try {
		entries = readdirSync(path, { withFileTypes: true });
	} catch {
		return [path];
	}
	return entries
		.filter((entry) => entry.name !== "node_modules" && entry.name !== ".git")
		.flatMap((entry) => filesUnder(join(path, entry.name)));
}

/**
 * The version ranges of `@nostr-agx/cli` named under `root`, each with the
 * files that name it.
 *
 * @param {string} [root]
 * @returns {Map<string, string[]>}
 */
export function installRanges(root = ROOT) {
	/** @type {Map<string, string[]>} */
	const ranges = new Map();
	const files = SCANNED.flatMap((name) => filesUnder(join(root, name)));
	for (const file of files.filter((f) => TEXT_FILE.test(f))) {
		let text;
		try {
			text = readFileSync(file, "utf8");
		} catch {
			continue;
		}
		for (const [, range] of text.matchAll(SPEC)) {
			const named = ranges.get(range) ?? [];
			const shown = relative(root, file);
			if (!named.includes(shown)) {
				named.push(shown);
			}
			ranges.set(range, named);
		}
	}
	return ranges;
}

/** True when npm has a version of the package that satisfies `range`. */
function isPublished(range) {
	const result = spawnSync(
		"npm",
		["view", `${PACKAGE}@${range}`, "version", "--json"],
		{ encoding: "utf8" },
	);
	if (result.error) {
		throw result.error;
	}
	// npm exits 1 with E404 when nothing matches; no output means the same.
	return result.status === 0 && result.stdout.trim() !== "";
}

function main() {
	const ranges = installRanges();
	if (ranges.size === 0) {
		console.error(`No ${PACKAGE}@<range> found: the check has nothing to do.`);
		process.exit(1);
	}
	let missing = 0;
	for (const [range, files] of ranges) {
		const published = isPublished(range);
		console.log(
			`${published ? "ok     " : "MISSING"} ${PACKAGE}@${range} (${files.join(", ")})`,
		);
		missing += published ? 0 : 1;
	}
	if (missing > 0) {
		console.error(
			`\n${missing} range(s) above don't resolve on npm yet. Publish that ${PACKAGE} release before this branch merges to main.`,
		);
		process.exit(1);
	}
}

/** True when this file is the process entry point (not imported by a test). */
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
	main();
}
