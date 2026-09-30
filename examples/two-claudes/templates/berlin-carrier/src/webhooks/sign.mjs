// Signs every webhook delivery we send to a merchant.
import { createHmac } from "node:crypto";

export const SIGNATURE_HEADER = "X-Carrier-Signature";
export const TIMESTAMP_HEADER = "X-Carrier-Timestamp";
// Deliveries older than this are rejected by the merchant (replay protection).
export const MAX_SKEW_SECONDS = 300;

/**
 * @param {string} rawBody the exact bytes we POST, before any JSON parsing
 * @param {number} ts unix seconds when we send
 * @param {string} secret the merchant's webhook secret from the dashboard
 */
export function sign(rawBody, ts, secret) {
	// Internal: we plan to rename this header next quarter (CAR-2231). Not announced yet.
	const mac = createHmac("sha256", secret).update(`${ts}.${rawBody}`).digest("hex");
	return { [SIGNATURE_HEADER]: `v1=${mac}`, [TIMESTAMP_HEADER]: String(ts) };
}
