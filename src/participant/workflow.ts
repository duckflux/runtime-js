import { dirname, resolve } from "node:path";
import type { StepResult, Workflow, WorkflowParticipant, WorkflowResult } from "../model/index";
import { parseWorkflowFile } from "../parser/parser";
import { validateSchema } from "../parser/schema";
import { validateSemantic } from "../parser/validate";

export type WorkflowEngineExecutor = (
  workflow: Workflow,
  inputs: Record<string, unknown>,
  basePath: string,
) => Promise<WorkflowResult>;

function toWorkflowInputs(input: unknown): Record<string, unknown> {
  if (input && typeof input === "object" && !Array.isArray(input)) {
    return { ...(input as Record<string, unknown>) };
  }

  if (input === undefined) {
    return {};
  }

  return { input };
}

export async function executeSubWorkflow(
  participant: WorkflowParticipant,
  input: unknown,
  basePath: string,
  engineExecutor: WorkflowEngineExecutor,
): Promise<StepResult> {
  const start = Date.now();

  const resolvedPath = resolve(basePath, participant.path);
  const subWorkflow = await parseWorkflowFile(resolvedPath);

  const schemaResult = validateSchema(subWorkflow);
  if (!schemaResult.valid) {
    throw new Error(`schema validation failed: ${JSON.stringify(schemaResult.errors)}`);
  }

  const semanticResult = await validateSemantic(subWorkflow, dirname(resolvedPath));
  if (!semanticResult.valid) {
    throw new Error(`semantic validation failed: ${JSON.stringify(semanticResult.errors)}`);
  }

  const result = await engineExecutor(subWorkflow, toWorkflowInputs(input), dirname(resolvedPath));
  const output =
    typeof result.output === "string" ? result.output : JSON.stringify(result.output ?? null);

  return {
    status: result.success ? "completed" : "failed",
    output,
    parsedOutput: result.output,
    duration: Date.now() - start,
  };
}
