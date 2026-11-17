import assert from "node:assert/strict";
import { test } from "node:test";
import { PLANS, effectivePlan } from "../src/config/plans.ts";

const now = new Date("2026-11-17T12:00:00Z");
const future = new Date("2026-11-20T12:00:00Z");
const past = new Date("2026-11-10T12:00:00Z");

test("effectivePlan: pago, teste ativo, teste vencido e sem teste", () => {
  assert.equal(effectivePlan({ plan: "PRO", trialEndsAt: null }, now), "PRO");
  assert.equal(effectivePlan({ plan: "FREE", trialEndsAt: future }, now), "PRO");
  assert.equal(effectivePlan({ plan: "FREE", trialEndsAt: past }, now), "FREE");
  assert.equal(effectivePlan({ plan: "FREE", trialEndsAt: null }, now), "FREE");
});

test("gratuito tem 2 simulados por mês", () => {
  assert.equal(PLANS.FREE.quizzesPerMonth, 2);
});
