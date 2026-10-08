/**
 * Tests for the release-order check's scan (no network): it must find the
 * `@nostr-agx/cli@<range>` the docs tell people to install, or the CI job
 * that asks npm about those ranges would pass with nothing to check. Run from
 * the repository root:
 *   node --test tests/*.test.mjs
 */
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { installRanges } from "../.github/scripts/cli-published.mjs";

describe("the @nostr-agx/cli ranges the docs name", () => {
	it("finds the install command in this repository's READMEs and skills", () => {
		const ranges = installRanges();
		assert.ok(ranges.size > 0, "no range found");
		const named = [...ranges.values()].flat();
		for (const file of [
			"README.md",
			join("plugins", "elladex-agx", "README.md"),
			join("plugins", "elladex-agx", "skills", "setup", "SKILL.md"),
			join("plugins", "elladex-agx", "skills", "login", "SKILL.md"),
			join("docs", "partner-kit.md"),
		]) {
			assert.ok(named.includes(file), `${file} names no range`);
		}
	});

	it("reads ranges and exact versions, once each, and skips the tests", () => {
		const root = mkdtempSync(join(tmpdir(), "cli-published-"));
		try {
			mkdirSync(join(root, "docs"));
			mkdirSync(join(root, "tests"));
			writeFileSync(
				join(root, "README.md"),
				"npm install -g @nostr-agx/cli@^0.4.0\nnpx @nostr-agx/cli@^0.4.0 login\n",
			);
			writeFileSync(
				join(root, "docs", "kit.md"),
				"npx -y @nostr-agx/cli@0.3.0 whoami\nnpx @nostr-agx/cli login\n@nostr-agx/cli@<range>\n",
			);
			writeFileSync(
				join(root, "tests", "x.test.mjs"),
				"npx @nostr-agx/cli@9.9.9 login\n",
			);
			const ranges = installRanges(root);
			assert.deepEqual([...ranges.keys()].sort(), ["0.3.0", "^0.4.0"]);
			assert.deepEqual(ranges.get("^0.4.0"), ["README.md"]);
			assert.deepEqual(ranges.get("0.3.0"), [join("docs", "kit.md")]);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
});
