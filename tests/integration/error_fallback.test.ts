import { test, expect } from "bun:test";
import { parseWorkflow } from "../../src/parser/index";
import { executeWorkflow } from "../../src/engine/engine";

test("integration: error handling fallback", async () => {
  const yaml = `
name: fallback-on-error
participants:
  main:
    type: exec
    command: sh -c "echo fail >&2; exit 1"
    onError: fixer
  fixer:
    type: exec
    command: echo fixed
flow:
  - main
`;

  const workflow = parseWorkflow(yaml);
  const result = await executeWorkflow(workflow, {});

  expect(result.success).toBe(true);
  expect(result.steps.fixer?.status).toBe("completed");
  expect(result.steps.main?.status).toBe("completed");
  expect(result.steps.main?.output.includes("fixed")).toBe(true);
});
