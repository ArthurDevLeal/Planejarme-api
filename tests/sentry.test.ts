import assert from "node:assert/strict";
import { test } from "node:test";
import type { ErrorEvent } from "@sentry/node";
import { beforeSend } from "../src/lib/sentry.ts";

test("beforeSend remove request e user do evento", () => {
  const event = { type: undefined, request: { url: "/webhooks/abacatepay?webhookSecret=x", headers: { authorization: "Bearer x" } }, user: { id: "1", email: "a@b.c" }, message: "boom" } as ErrorEvent;
  const out = beforeSend(event);
  assert.equal(out.request, undefined);
  assert.equal(out.user, undefined);
  assert.equal(out.message, "boom");
});
