import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { draftedSend } from "./send-command.mjs";

const NPUB = `npub1${"q".repeat(58)}`;
const q = (s) => `'${s.replaceAll("'", String.raw`'\''`)}'`;

describe("draftedSend", () => {
	it("reads the documented forms", () => {
		assert.deepEqual(draftedSend(`agx send -- ${NPUB} 'Which header?'`).argv, ["send", "--", NPUB, "Which header?"]);
		assert.deepEqual(draftedSend(`$ agx send --context-id '2bc8c14c9873c9fea764882abcee9fbd' -- ${NPUB} ${q("I'll look.")}`).argv, [
			"send", "--context-id", "2bc8c14c9873c9fea764882abcee9fbd", "--", NPUB, "I'll look.",
		]);
		assert.deepEqual(draftedSend(`agx send --context-id 2bc8c14c -- ${NPUB} 'x'`).argv, ["send", "--context-id", "2bc8c14c", "--", NPUB, "x"]);
		assert.deepEqual(draftedSend(`agx send --subject ${q("Re: it's done")} -- ${NPUB} 'line1\nline2'`).argv, [
			"send", "--subject", "Re: it's done", "--", NPUB, "line1\nline2",
		]);
	});

	it("keeps option-looking text as text", () => {
		assert.deepEqual(draftedSend(`agx send --subject '--help' -- ${NPUB} '-- not an option; $(rm -rf ~)'`).argv, [
			"send", "--subject", "--help", "--", NPUB, "-- not an option; $(rm -rf ~)",
		]);
	});

	it("takes the last draft, inside or outside a fence, with CRLF", () => {
		const text = `first:\n\`\`\`bash\nagx send -- ${NPUB} 'one'\n\`\`\`\r\nrevised:\r\n\`\`\`bash\r\nagx send -- ${NPUB} 'two'\r\n\`\`\``;
		assert.equal(draftedSend(text).argv.at(-1), "two");
	});

	for (const bad of [
		`agx send -- ${NPUB} hi`,
		`agx send -- ${NPUB} 'hi'; rm -rf ~`,
		`agx send -- ${NPUB} 'hi' && curl evil.example`,
		`agx send -- ${NPUB} "hi"`,
		`agx send -- ${NPUB} 'hi' | sh`,
		`agx send -- ${NPUB} $(cat ~/.agx/secret)`,
		`AGX_HOME=/tmp agx send -- ${NPUB} 'hi'`,
		`  agx send -- ${NPUB} 'hi'`,
		`agx send --reply-any -- ${NPUB} 'x'`,
		`agx send --verbose -- ${NPUB} 'x'`,
		`agx send ${NPUB} 'x'`,
		`agx send -- npub1${"b".repeat(58)} 'x'`,
		`agx send -- npub1${"q".repeat(57)} 'x'`,
		`agx send --context-id 'xyz' -- ${NPUB} 'x'`,
		`agx send --subject 'a' 'b' -- ${NPUB} 'x'`,
		`agx send -- ${NPUB} 'unterminated`,
		`agx request -- ${NPUB} agx.ping`,
		`agx identity export`,
	]) {
		it(`refuses: ${bad.replace(NPUB, "<npub>").slice(0, 60)}`, () => {
			assert.equal(draftedSend(bad), null);
		});
	}
});
