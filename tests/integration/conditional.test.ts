import { test, expect } from "bun:test";
import { parseWorkflow } from "../../src/parser/index";
import { executeWorkflow } from "../../src/engine/engine";

test("integration: conditional branching executes correct branch", async () => {
  const yaml = `
name: cond
participants:
  a:
    type: exec
    command: echo a
  b:
    type: exec
    command: echo b
flow:
  - if:
      condition: true
      then:
        - a
      else:
        - b
`;

  const wf = parseWorkflow(yaml);
  const res = await executeWorkflow(wf, {});
  expect(res.success).toBe(true);
  expect(res.steps.a).toBeDefined();
  expect(res.steps.b).toBeUndefined();
});
