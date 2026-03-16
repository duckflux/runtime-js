import { test, expect } from "bun:test";
import { parseWorkflow } from "../../src/parser/index";
import { executeWorkflow } from "../../src/engine/engine";

test("integration: guard when skips step when false", async () => {
  const yaml = `
name: when-guard
participants:
  maybe:
    type: exec
    command: echo yes
    when: "false"
  after:
    type: exec
    command: echo ok
flow:
  - maybe
  - after
`;

  const wf = parseWorkflow(yaml);
  const res = await executeWorkflow(wf, {});
  expect(res.success).toBe(true);
  expect(res.steps.maybe).toBeDefined();
  expect((res.steps.maybe as any).status).toBe("skipped");
  expect(res.steps.after).toBeDefined();
});
