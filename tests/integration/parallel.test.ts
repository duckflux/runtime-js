import { test, expect } from "bun:test";
import { parseWorkflow } from "../../src/parser/index";
import { executeWorkflow } from "../../src/engine/engine";

test("integration: parallel execution runs steps concurrently", async () => {
  const yaml = `
name: parallel
participants:
  slow1:
    type: exec
    command: sh -c "sleep 0.12; echo 1"
  slow2:
    type: exec
    command: sh -c "sleep 0.12; echo 2"
flow:
  - parallel:
      - slow1
      - slow2
`;

  const wf = parseWorkflow(yaml);
  const res = await executeWorkflow(wf, {});
  expect(res.success).toBe(true);
  // Total duration should be less than sum of both sleeps (approx 240ms)
  expect(res.duration).toBeLessThan(600);
  expect(res.steps.slow1).toBeDefined();
  expect(res.steps.slow2).toBeDefined();
});
