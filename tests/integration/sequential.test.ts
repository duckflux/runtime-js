import { test, expect } from "bun:test";
import { parseWorkflow } from "../../src/parser/index";
import { executeWorkflow } from "../../src/engine/engine";

test("integration: sequential workflow via executeWorkflow", async () => {
  const yaml = `
name: seq-integration
participants:
  a:
    type: exec
    command: echo a
  b:
    type: exec
    command: echo b
  c:
    type: exec
    command: echo c
flow:
  - a
  - b
  - c
output: a.output
`;

  const wf = parseWorkflow(yaml);
  const res = await executeWorkflow(wf, {});

  expect(res.success).toBe(true);
  expect(res.steps.a).toBeDefined();
  expect(res.steps.b).toBeDefined();
  expect(res.steps.c).toBeDefined();
  expect((res.steps.a as any).status).toBe("completed");
  expect((res.steps.b as any).status).toBe("completed");
  expect((res.steps.c as any).status).toBe("completed");
  expect(String(res.output).includes("a") || String(res.output).includes("a\n")).toBe(true);
});
