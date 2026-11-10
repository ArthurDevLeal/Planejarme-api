import assert from "node:assert/strict";
import { test } from "node:test";
import { CreateDisciplineSchema, UpdateDisciplineSchema } from "../src/schemas/discipline-schema.ts";

const base = { name: "Cálculo", workloadHours: 60, userId: "u" };

test("disciplina: cor e ícone são opcionais e validados", () => {
  assert.equal(CreateDisciplineSchema.safeParse(base).success, true);
  assert.equal(CreateDisciplineSchema.safeParse({ ...base, color: 3, icon: "math-function" }).success, true);
  assert.equal(UpdateDisciplineSchema.safeParse({ color: null, icon: null }).success, true);
  assert.equal(CreateDisciplineSchema.safeParse({ ...base, color: 6 }).success, false);
  assert.equal(CreateDisciplineSchema.safeParse({ ...base, icon: "<script>" }).success, false);
});
