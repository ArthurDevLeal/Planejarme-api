import "dotenv/config";
import assert from "node:assert/strict";
import { test } from "node:test";
import { CreateSemesterSchema, CopyDisciplinesSchema } from "../src/schemas/semester-schema.ts";
import { ChangePasswordSchema } from "../src/schemas/user-schema.ts";

test("schemas: datas obrigatórias e fim antes do início", () => {
  assert.equal(
    CreateSemesterSchema.safeParse({ name: "2026.2", userId: "u1" }).success,
    false,
  );
  assert.equal(
    CreateSemesterSchema.safeParse({ name: "2026.2", userId: "u1", startDate: "2026-08-01", endDate: "2026-12-20" }).success,
    true,
  );
  const inverted = CreateSemesterSchema.safeParse({
    name: "2026.2", userId: "u1", startDate: "2026-12-20", endDate: "2026-08-01",
  });
  assert.equal(inverted.success, false);
  assert.equal(
    inverted.success ? null : inverted.error.issues[0]?.message,
    "A data de término não pode ser anterior à data de início.",
  );
});

test("schema de cópia: copySchedules opcional assume false", () => {
  const parsed = CopyDisciplinesSchema.parse({ targetSemesterId: "s2" });
  assert.equal(parsed.copySchedules, false);
  assert.equal(CopyDisciplinesSchema.safeParse({ targetSemesterId: "" }).success, false);
});

test("schema de senha exige tamanho mínimo", () => {
  assert.equal(ChangePasswordSchema.safeParse({ currentPassword: "123", newPassword: "123456" }).success, false);
  assert.equal(ChangePasswordSchema.safeParse({ currentPassword: "123456", newPassword: "abcdef" }).success, true);
});
