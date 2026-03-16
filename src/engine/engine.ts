import { dirname, resolve } from "node:path";
import { evaluateCel } from "../cel/index";
import type { Workflow, WorkflowResult } from "../model/index";
import { parseWorkflowFile } from "../parser/parser";
import { validateSchema } from "../parser/schema";
import { validateSemantic } from "../parser/validate";
import { validateInputs } from "../parser/validate_inputs";
import type { WorkflowEngineExecutor } from "../participant/workflow";
import { executeControlStep } from "./control";
import { WorkflowState } from "./state";

export async function executeWorkflow(
  workflow: Workflow,
  inputs: Record<string, unknown> = {},
  basePath = process.cwd(),
): Promise<WorkflowResult> {
  const { result: inputResult, resolved } = validateInputs(workflow.inputs, inputs);
  if (!inputResult.valid) {
    throw new Error(`input validation failed: ${JSON.stringify(inputResult.errors)}`);
  }

  const state = new WorkflowState(resolved);
  const startedAt = performance.now();

  const engineExecutor: WorkflowEngineExecutor = async (subWorkflow, subInputs, subBasePath) => {
    return executeWorkflow(subWorkflow, subInputs, subBasePath);
  };

  for (const step of workflow.flow) {
    await executeControlStep(workflow, state, step, basePath, engineExecutor);
  }

  const output =
    workflow.output !== undefined
      ? state.resolveOutput(workflow.output, evaluateCel)
      : undefined;

  const steps = state.getAllResults();
  const success = !Object.values(steps).some((step) => step.status === "failed");

  return {
    success,
    output,
    steps,
    duration: Math.max(0, performance.now() - startedAt),
  };
}

export async function runWorkflowFromFile(
  filePath: string,
  inputs: Record<string, unknown> = {},
): Promise<WorkflowResult> {
  const workflow = await parseWorkflowFile(filePath);

  const schemaValidation = validateSchema(workflow);
  if (!schemaValidation.valid) {
    throw new Error(`schema validation failed: ${JSON.stringify(schemaValidation.errors)}`);
  }

  const workflowBasePath = dirname(resolve(filePath));
  const semanticValidation = await validateSemantic(workflow, workflowBasePath);
  if (!semanticValidation.valid) {
    throw new Error(`semantic validation failed: ${JSON.stringify(semanticValidation.errors)}`);
  }

  return executeWorkflow(workflow, inputs, workflowBasePath);
}
