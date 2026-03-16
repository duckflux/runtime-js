import { test, expect } from "bun:test";
import { parseWorkflow } from "../../src/parser/index";
import { executeWorkflow } from "../../src/engine/engine";

test("integration: step exceeding timeout causes failure", async () => {
  const yaml = `
name: timeout
participants:
  slow:
    type: exec
    command: sh -c "sleep 0.2; echo done"
    timeout: 50ms
flow:
  - slow
`;

  const wf = parseWorkflow(yaml);
  await expect(executeWorkflow(wf, {})).rejects.toBeDefined();
});
