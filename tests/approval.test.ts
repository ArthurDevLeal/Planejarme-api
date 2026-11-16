import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { computeStatus, describeRule, resolveRule } from "../src/domain/approval.ts";

// Os mesmos casos rodam no web (planejarme-web/tests/approval-cases.test.mjs) contra a cópia de lib/approval.ts.
const cases = JSON.parse(readFileSync(new URL("./approval-cases.json", import.meta.url), "utf8"));
const defaults = { passingScore: 7, maxAbsencePct: 25 };

for (const c of cases) {
  test(`approval: ${c.name}`, () => {
    const { rule, ...rest } = c.input;
    const status = computeStatus({ ...rest, rule: resolveRule(rule, defaults) });
    for (const [key, expected] of Object.entries(c.expect)) {
      const actual = key === "neededOnNext" ? (status.neededOnNext?.needed ?? null) : (status as never)[key];
      if (typeof expected === "number" && typeof actual === "number") {
        assert.ok(Math.abs(actual - expected) < 1e-9, `${key}: ${actual} !== ${expected}`);
      } else {
        assert.deepEqual(actual, expected, key);
      }
    }
  });
}

test("describeRule escreve a regra padrão em uma frase", () => {
  assert.equal(
    describeRule(resolveRule({ finalMinAverage: 4, finalPassingScore: 5 }, defaults), 60),
    "Aprova com média simples 7 e até 25% de faltas (15 aulas). Entre 4 e 7, faz a final, e passa se (média + final) / 2 ≥ 5.",
  );
  assert.match(describeRule(resolveRule({ hasFinalExam: false }, defaults), 60), /Não tem prova final\.$/);
});

test("resolveRule herda do usuário só o que a disciplina deixou nulo", () => {
  const rule = resolveRule({ passingScore: 6, maxAbsencePct: null }, defaults);
  assert.equal(rule.passingScore, 6);
  assert.equal(rule.maxAbsencePct, 25);
  assert.deepEqual(rule.inherited, { passingScore: false, maxAbsencePct: true });
  assert.equal(rule.finalPassingScore, 6);
});
