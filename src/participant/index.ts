import type { Participant, StepResult, WorkflowParticipant } from "../model/index";
import { executeSubWorkflow } from "./workflow";
import type { WorkflowEngineExecutor } from "./workflow";
import { executeExec } from "./exec";
import executeHttp from "./http";

export type ExecutorFunction = (
  participant: Participant,
  input: unknown,
  env: Record<string, string>,
  basePath?: string,
  engineExecutor?: WorkflowEngineExecutor,
) => Promise<StepResult>;

const notImplemented = (type: string): ExecutorFunction => {
  return async () => {
    throw new Error(`participant type '${type}' is not yet implemented`);
  };
};

const executors: Record<string, ExecutorFunction> = {
  exec: async (participant, input, env) => executeExec(participant as Parameters<typeof executeExec>[0], input, env),
  http: async (participant, input) => executeHttp(participant as Parameters<typeof executeHttp>[0], input as string | undefined),
  workflow: async (participant, input, _env, basePath, engineExecutor) => {
    if (!basePath) {
      throw new Error("workflow participant execution requires basePath");
    }
    if (!engineExecutor) {
      throw new Error("workflow participant execution requires engineExecutor");
    }
    return executeSubWorkflow(participant as WorkflowParticipant, input, basePath, engineExecutor);
  },
  mcp: notImplemented("mcp"),
  emit: notImplemented("emit"),
};

export async function executeParticipant(
  participant: Participant,
  input: unknown,
  env: Record<string, string> = {},
  basePath?: string,
  engineExecutor?: WorkflowEngineExecutor,
): Promise<StepResult> {
  const executor = executors[participant.type];
  if (!executor) {
    throw new Error(`participant type '${participant.type}' is not yet implemented`);
  }

  return executor(participant, input, env, basePath, engineExecutor);
}
