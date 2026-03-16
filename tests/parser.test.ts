import { test, expect } from "bun:test";
import { parseWorkflow } from "../src/parser/index";

test("parseWorkflow parses basic workflow", () => {
  const w = parseWorkflow("name: test\nparticipants: {}\nflow: []");
  expect((w as any).name).toBe("test");
});
