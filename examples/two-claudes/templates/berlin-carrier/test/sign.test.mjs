import assert from "node:assert/strict";
import { test } from "node:test";
import { sign } from "../src/webhooks/sign.mjs";

test("signature covers timestamp and raw body", () => {
	const a = sign('{"id":1}', 1700000000, "whsec_demo_only");
	const b = sign('{"id": 1}', 1700000000, "whsec_demo_only");
	assert.notEqual(a["X-Carrier-Signature"], b["X-Carrier-Signature"]);
	assert.match(a["X-Carrier-Signature"], /^v1=[0-9a-f]{64}$/);
});
