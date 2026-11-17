import assert from "node:assert/strict";
import { test } from "node:test";
import { track } from "../src/lib/analytics.ts";

test("track não faz nada e não lança sem POSTHOG_KEY", async () => {
  const saved = process.env.POSTHOG_KEY;
  delete process.env.POSTHOG_KEY;
  try {
    await assert.doesNotReject(track("user-1", "user_signed_up", { method: "email" }));
  } finally {
    if (saved !== undefined) process.env.POSTHOG_KEY = saved;
  }
});
