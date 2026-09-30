// Finds the `agx send` command a Claude drafted, in the one form the
// elladex-agx plugin documents, and turns it into argv for spawn (no shell):
//
//   agx send [--context-id '<hex>'] [--subject '<text>'] -- <npub> '<text>'
//
// Single-quoted text may contain '\'' (an escaped single quote). Anything else,
// including other options, unquoted text or shell syntax, isn't matched, so a
// script never runs something the person wouldn't have typed.

const QUOTED = String.raw`'(?:[^']|'\\'')*'`;
const CONTEXT = String.raw`--context-id (?:'[0-9a-f]{8,64}'|[0-9a-f]{8,64})`;
const SUBJECT = String.raw`--subject ${QUOTED}`;
const SEND = new RegExp(
	String.raw`^(?:\$ )?agx send((?: (?:${CONTEXT}|${SUBJECT}))*) -- (npub1[02-9ac-hj-np-z]{58}) (${QUOTED})[ \t]*$`,
	"gm",
);
const OPTION = new RegExp(String.raw`--context-id '?([0-9a-f]{8,64})'?|--subject (${QUOTED})`, "g");

/** '...' with '\'' escapes, back to plain text. */
function unquote(quoted) {
	return quoted.slice(1, -1).replaceAll(String.raw`'\''`, "'");
}

/**
 * The last documented `agx send` command in `text`, or null.
 * @param {string} text a Claude reply
 * @returns {{ line: string, argv: string[] } | null}
 */
export function draftedSend(text) {
	const m = [...text.replaceAll("\r\n", "\n").matchAll(SEND)].at(-1);
	if (!m) {
		return null;
	}
	const [line, options, to, body] = m;
	const argv = ["send"];
	for (const o of options.matchAll(OPTION)) {
		argv.push(...(o[1] ? ["--context-id", o[1]] : ["--subject", unquote(o[2])]));
	}
	argv.push("--", to, unquote(body));
	return { line: line.replace(/^\$ /, "").trim(), argv };
}
