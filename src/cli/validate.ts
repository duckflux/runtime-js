#!/usr/bin/env bun
import { readFile } from "node:fs/promises";
import { dirname } from "node:path";
import { parseInputFlags } from "./run";
import { parseWorkflowFile } from "../parser/index";
import { validateSchema } from "../parser/schema";
import { validateSemantic } from "../parser/validate";
import { validateInputs } from "../parser/validate_inputs";

type CLIValues = Record<string, any> | undefined;

export default async function validateCommand(filePath?: string, cliValues?: CLIValues): Promise<number> {
  if (!filePath) {
    console.error("Usage: duckflux validate <workflow.yaml> [--input k=v] [--input-file file.json]");
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

  // Try stdin if piped and no inputs provided
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
    const workflow = await parseWorkflowFile(filePath);

    const schemaRes = validateSchema(workflow);
    if (!schemaRes.valid) {
      console.error("Schema validation failed:");
      for (const e of schemaRes.errors) {
        console.error(`- ${e.path}: ${e.message}`);
      }
      return 1;
    }

    const basePath = dirname(filePath);
    const semanticRes = await validateSemantic(workflow, basePath);
    if (!semanticRes.valid) {
      console.error("Semantic validation failed:");
      for (const e of semanticRes.errors) {
        console.error(`- ${e.path}: ${e.message}`);
      }
      return 1;
    }

    // Validate inputs against declared schema
    const { result: inputsResult, resolved } = validateInputs(workflow.inputs as any, inputs);
    if (!inputsResult.valid) {
      console.error("Input validation failed:");
      for (const e of inputsResult.errors) {
        console.error(`- ${e.path}: ${e.message}`);
      }
      return 1;
    }

    console.log("valid");
    return 0;
  } catch (err: any) {
    console.error("Error during validate:", err && err.message ? err.message : err);
    return 1;
  }
}

export { validateCommand };
