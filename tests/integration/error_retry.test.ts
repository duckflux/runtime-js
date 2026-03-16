import { test, expect } from "bun:test";
import { unlink } from "node:fs/promises";
import { parseWorkflow } from "../../src/parser/index";
import { executeWorkflow } from "../../src/engine/engine";

const RETRY_MARK = "/tmp/duckflux-retry-marker";

test("integration: error handling retry", async () => {
  await unlink(RETRY_MARK).catch(() => undefined);

  const yaml = `
name: retry-on-error
participants:
  flaky:
    type: exec
    command: sh -c 'if [ -f ${RETRY_MARK} ]; then echo ok; else touch ${RETRY_MARK}; exit 1; fi'
    onError: retry
    retry:
      max: 1
      backoff: 10ms
flow:
  - flaky
`;

  const workflow = parseWorkflow(yaml);
  const result = await executeWorkflow(workflow, {});

  expect(result.success).toBe(true);
  expect(result.steps.flaky?.status).toBe("completed");
  expect(result.steps.flaky?.output.includes("ok")).toBe(true);

  await unlink(RETRY_MARK).catch(() => undefined);
});
