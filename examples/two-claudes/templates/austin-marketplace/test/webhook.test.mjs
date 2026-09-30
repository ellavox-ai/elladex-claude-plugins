import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { verifyCarrierWebhook } from "../src/webhooks/verify.mjs";

// A real delivery captured from the carrier's sandbox (headers and raw body as received).
const delivery = JSON.parse(readFileSync(new URL("../fixtures/delivery.json", import.meta.url), "utf8"));
const SECRET = "whsec_demo_only";
const NOW = delivery.receivedAt;

test("accepts a genuine carrier delivery", () => {
	assert.equal(verifyCarrierWebhook(delivery.headers, delivery.body, SECRET, NOW), true);
});

test("rejects a tampered body", () => {
	const tampered = delivery.body.replace('"in_transit"', '"delivered"');
	assert.equal(verifyCarrierWebhook(delivery.headers, tampered, SECRET, NOW), false);
});

test("rejects a replayed delivery from an hour ago", () => {
	assert.equal(verifyCarrierWebhook(delivery.headers, delivery.body, SECRET, NOW + 3600), false);
});
