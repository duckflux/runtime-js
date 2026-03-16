import { test, expect } from "bun:test";
import { validateSchema } from "../../src/parser/schema";

test("valid workflow passes schema", () => {
  const wf = { participants: { p: { type: "agent" } }, flow: ["p"] };
  const res = validateSchema(wf);
  expect(res.valid).toBe(true);
  expect(res.errors.length).toBe(0);
});

test("missing participants fails", () => {
  const wf = { flow: [] };
  const res = validateSchema(wf);
  expect(res.valid).toBe(false);
  expect(res.errors.length).toBeGreaterThan(0);
});
