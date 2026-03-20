import { test, expect, describe } from "bun:test";
import { parseWorkflow } from "../../src/parser/index";
import { executeWorkflow } from "../../src/engine/engine";

describe("set construct", () => {
  test("writes values to execution.context", async () => {
    const yaml = `
flow:
  - set:
      greeting: "'hello'"
      count: "40 + 2"

  - as: check
    type: exec
    run: echo "ok"
    timeout: 5s

output: execution.context.greeting
`;
    const wf = parseWorkflow(yaml);
    const res = await executeWorkflow(wf, {});

    expect(res.success).toBe(true);
    expect(res.output).toBe("hello");
  });

  test("overwrites existing keys", async () => {
    const yaml = `
flow:
  - set:
      val: "'first'"
  - set:
      val: "'second'"

  - as: noop
    type: exec
    run: echo "ok"
    timeout: 5s

output: execution.context.val
`;
    const wf = parseWorkflow(yaml);
    const res = await executeWorkflow(wf, {});

    expect(res.success).toBe(true);
    expect(res.output).toBe("second");
  });

  test("chain passes through unchanged", async () => {
    const yaml = `
flow:
  - as: step1
    type: exec
    run: echo "chained-value"
    timeout: 5s

  - set:
      marker: "'tagged'"

  - as: step2
    type: exec
    run: cat
    timeout: 5s

output: step2.output
`;
    const wf = parseWorkflow(yaml);
    const res = await executeWorkflow(wf, {});

    expect(res.success).toBe(true);
    expect(String(res.output)).toContain("chained-value");
  });

  test("works with workflow inputs", async () => {
    const yaml = `
inputs:
  name:
    type: string

flow:
  - set:
      greeting: "'Hello, ' + workflow.inputs.name"

  - as: noop
    type: exec
    run: echo "ok"
    timeout: 5s

output: execution.context.greeting
`;
    const wf = parseWorkflow(yaml);
    const res = await executeWorkflow(wf, { name: "World" });

    expect(res.success).toBe(true);
    expect(res.output).toBe("Hello, World");
  });

  test("works inside if branches", async () => {
    const yaml = `
inputs:
  flag:
    type: string
    default: "yes"

flow:
  - if:
      condition: workflow.inputs.flag == "yes"
      then:
        - set:
            result: "'approved'"
      else:
        - set:
            result: "'rejected'"

  - as: noop
    type: exec
    run: echo "ok"
    timeout: 5s

output: execution.context.result
`;
    const wf = parseWorkflow(yaml);
    const res = await executeWorkflow(wf, { flag: "yes" });

    expect(res.success).toBe(true);
    expect(res.output).toBe("approved");
  });

  test("multiple keys in single set", async () => {
    const yaml = `
flow:
  - set:
      a: "'alpha'"
      b: "'beta'"
      c: "'gamma'"

  - as: noop
    type: exec
    run: echo "ok"
    timeout: 5s

output:
  a: execution.context.a
  b: execution.context.b
  c: execution.context.c
`;
    const wf = parseWorkflow(yaml);
    const res = await executeWorkflow(wf, {});

    expect(res.success).toBe(true);
    const out = res.output as Record<string, unknown>;
    expect(out.a).toBe("alpha");
    expect(out.b).toBe("beta");
    expect(out.c).toBe("gamma");
  });
});
