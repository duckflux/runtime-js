#!/usr/bin/env bun
import { dirname } from "node:path";
import { parseWorkflowFile } from "../parser/index";
import { validateSchema } from "../parser/schema";
import { validateSemantic } from "../parser/validate";

export default async function lintCommand(filePath?: string): Promise<number> {
  if (!filePath) {
    console.error("Usage: duckflux lint <workflow.yaml>");
    return 1;
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

    console.log("valid");
    return 0;
  } catch (err: any) {
    console.error("Error during lint:", err && err.message ? err.message : err);
    return 1;
  }
}

export { lintCommand };
