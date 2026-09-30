// Verifies shipment webhooks from our carrier partner before we trust them.
import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * @param {Record<string, string>} headers request headers (any case)
 * @param {string} body the request body
 * @param {string} secret our webhook secret from the carrier's dashboard
 * @param {number} [now] unix seconds, for tests
 * @returns {boolean}
 */
export function verifyCarrierWebhook(headers, body, secret, now = Math.floor(Date.now() / 1000)) {
	const h = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
	// TODO(maya): confirm the header name and what exactly is signed with the carrier.
	const given = h["x-signature"] ?? "";
	const expected = createHmac("sha256", secret).update(JSON.stringify(JSON.parse(body))).digest("hex");
	return safeEqual(given, expected);
}

function safeEqual(a, b) {
	const x = Buffer.from(a);
	const y = Buffer.from(b);
	return x.length === y.length && timingSafeEqual(x, y);
}
