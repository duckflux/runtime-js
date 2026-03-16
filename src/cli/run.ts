#!/usr/bin/env bun
import { parse } from "path";
import { readFile } from "node:fs/promises";
import { runWorkflowFromFile } from "../engine/engine";

type CLIValues = Record<string, any> | undefined;

function parseInputFlags(arr: string[] | undefined): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (!arr) return out;
  for (const item of arr) {
    const idx = item.indexOf("=");
    if (idx === -1) {
      out[item] = true;
    } else {
      const k = item.slice(0, idx);
      const v = item.slice(idx + 1);
      // try parse JSON values, fallback to string
      try {
        out[k] = JSON.parse(v);
      } catch {
        out[k] = v;
      }
    }
  }
  return out;
}

export default async function runCommand(filePath?: string, cliValues?: CLIValues): Promise<number> {
  if (!filePath) {
    console.error("Usage: duckflux run <workflow.yaml> [--input k=v] [--input-file file.json]");
    return 1;
  }

  let inputs: Record<string, unknown> = {};

  if (cliValues) {
    if (cliValues.input) {
      const parsed = Array.isArray(cliValues.input) ? cliValues.input : [cliValues.input];
      inputs = { ...inputs, ...parseInputFlags(parsed) };
    }
    if (cliValues["input-file"]) {
      try {
        const content = await readFile(String(cliValues["input-file"]), "utf-8");
        const parsed = JSON.parse(content);
        if (typeof parsed === "object" && parsed !== null) inputs = { ...inputs, ...parsed };
      } catch (err) {
        console.error("Failed to read input file:", err);
        return 1;
      }
    }
  }

  // If no inputs and stdin is piped, try to read JSON from stdin
  try {
    if (process.stdin && !process.stdin.isTTY && Object.keys(inputs).length === 0) {
      let stdin = "";
      for await (const chunk of process.stdin) {
        stdin += chunk;
      }
      stdin = stdin.trim();
      if (stdin.length > 0) {
        try {
          const parsed = JSON.parse(stdin);
          if (typeof parsed === "object" && parsed !== null) inputs = { ...inputs, ...parsed };
        } catch {
          // ignore non-json stdin
        }
      }
    }
  } catch {
    // ignore
  }

  try {
    const res = await runWorkflowFromFile(filePath, inputs);
    // print output
    try {
      console.log(JSON.stringify(res, null, 2));
    } catch {
      console.log(String(res));
    }
    return res.success ? 0 : 2;
  } catch (err: any) {
    console.error("Error:", err && err.message ? err.message : err);
    if (err && err.stack) console.error(err.stack);
    return 1;
  }
}

export { parseInputFlags };
