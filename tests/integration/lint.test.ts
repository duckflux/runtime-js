import { test, expect } from "bun:test";
import { lintCommand } from "../../src/cli/lint";

test("integration: lint command detects invalid workflow", async () => {
  const exitCode = await lintCommand("tests/bad-workflow.yaml");
  expect(exitCode).toBe(1);
});
