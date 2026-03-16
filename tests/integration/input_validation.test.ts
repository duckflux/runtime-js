import { test, expect } from "bun:test";
import { validateInputs } from "../../src/parser/validate_inputs";

test("integration: validateInputs rejects missing required input", () => {
  const defs = {
    name: { type: "string", required: true },
  } as any;
  const res = validateInputs(defs, {});
  expect(res.result.valid).toBe(false);
  expect(res.result.errors.length).toBeGreaterThan(0);
});
