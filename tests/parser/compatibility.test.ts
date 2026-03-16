import { test, expect } from "bun:test";
import { parseWorkflow } from "../../src/parser/parser";

test("exec participant maps 'command' to 'run'", () => {
  const yaml = `participants:\n  p1:\n    type: exec\n    command: echo hello\nflow:\n  - p1`;
  const wf = parseWorkflow(yaml as unknown as string);
  const p = wf.participants?.["p1"] as any;
  expect(p.run).toBe("echo hello");
  expect(p.command).toBeUndefined();
});

test("exec participant maps 'cmd' to 'run'", () => {
  const yaml = `participants:\n  p2:\n    type: exec\n    cmd: echo world\nflow:\n  - p2`;
  const wf = parseWorkflow(yaml as unknown as string);
  const p = wf.participants?.["p2"] as any;
  expect(p.run).toBe("echo world");
  expect(p.cmd).toBeUndefined();
});
