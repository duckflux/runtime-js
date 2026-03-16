import { test, expect } from "bun:test";
import { WorkflowState } from "../../src/engine/index";

test("WorkflowState push/increment/pop loop and context", () => {
  const state = new WorkflowState({ foo: "bar" });
  expect(state.currentLoopIndex()).toBe(0);
  state.pushLoop();
  expect(state.currentLoopIndex()).toBe(0);
  state.incrementLoop();
  expect(state.currentLoopIndex()).toBe(1);
  state.incrementLoop();
  expect(state.currentLoopIndex()).toBe(2);
  state.popLoop();
  expect(state.currentLoopIndex()).toBe(0);

  // set a result and verify toCelContext
  state.setResult("step1", {
    status: "completed",
    output: "hello",
    parsedOutput: { ok: true },
    duration: 10,
  });

  const ctx = state.toCelContext();
  expect((ctx as any).input).toBeDefined();
  expect((ctx as any).input.foo).toBe("bar");
  expect((ctx as any).step1).toBeDefined();
  expect((ctx as any).step1.output).toEqual({ ok: true });
  expect((ctx as any).loop.index).toBe(0);
});
