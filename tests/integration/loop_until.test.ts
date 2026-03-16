import { test, expect } from "bun:test";
import { parseWorkflow } from "../../src/parser/index";
import { executeWorkflow } from "../../src/engine/engine";

test("integration: loop with until (single iteration)", async () => {
  const yaml = `
name: loop-until
participants:
  echo:
    type: exec
    command: echo iter
flow:
  - loop:
      until: true
      steps:
        - echo
`;

  const wf = parseWorkflow(yaml);
  const res = await executeWorkflow(wf, {});
  expect(res.success).toBe(true);
  expect(res.steps.echo).toBeDefined();
});
