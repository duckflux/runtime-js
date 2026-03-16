import { test, expect } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runWorkflowFromFile } from "../../src/engine/engine";

test("integration: sub-workflow invocation", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "duckflux-subwf-"));
  const childPath = join(tempDir, "child.yaml");
  const parentPath = join(tempDir, "parent.yaml");

  const childYaml = `
name: child
participants:
  childStep:
    type: exec
    run: echo child-ok
flow:
  - childStep
output: childStep.output
`;

  const parentYaml = `
name: parent
participants:
  callChild:
    type: workflow
    path: child.yaml
flow:
  - callChild
output: callChild.output
`;

  await writeFile(childPath, childYaml, "utf-8");
  await writeFile(parentPath, parentYaml, "utf-8");

  const result = await runWorkflowFromFile(parentPath, {});

  expect(result.success).toBe(true);
  expect(result.steps.callChild?.status).toBe("completed");
  expect(String(result.output).includes("child-ok")).toBe(true);

  await rm(tempDir, { recursive: true, force: true });
});
