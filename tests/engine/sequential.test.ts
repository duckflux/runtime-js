import { test, expect } from "bun:test";
import { WorkflowState, executeSequential } from "../../src/engine/index";

test("executeSequential runs three exec participants in order", async () => {
  const workflow = {
    participants: {
      a: { type: "exec", command: "echo a" },
      b: { type: "exec", command: "echo b" },
      c: { type: "exec", command: "echo c" },
    },
    flow: ["a", "b", "c"],
  };

  const state = new WorkflowState({});
  await executeSequential(workflow, state, process.cwd());

  const ra = state.getResult("a");
  const rb = state.getResult("b");
  const rc = state.getResult("c");

  expect(ra).toBeDefined();
  expect(rb).toBeDefined();
  expect(rc).toBeDefined();

  if (ra?.status !== "completed") console.log("a result:", ra);
  if (rb?.status !== "completed") console.log("b result:", rb);
  if (rc?.status !== "completed") console.log("c result:", rc);
  expect(ra?.status).toBe("completed");
  expect(rb?.status).toBe("completed");
  expect(rc?.status).toBe("completed");

  expect(ra?.output.includes("a")).toBe(true);
  expect(rb?.output.includes("b")).toBe(true);
  expect(rc?.output.includes("c")).toBe(true);
});
