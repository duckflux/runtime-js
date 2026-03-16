import { test, expect } from "bun:test";
import { parseWorkflow } from "../../src/parser/index";
import { executeWorkflow } from "../../src/engine/engine";

test("integration: loop with max iterations", async () => {
  const yaml = `
name: loop-max
participants:
  echo:
    type: exec
    command: echo iter
flow:
  - loop:
      max: 3
      steps:
        - echo
`;

  const wf = parseWorkflow(yaml);
  const res = await executeWorkflow(wf, {});

  expect(res.success).toBe(true);
  // There should be a result for 'echo' (last iteration overrides same step name)
  expect(res.steps.echo).toBeDefined();
  expect((res.steps.echo as any).status).toBe("completed");
});
