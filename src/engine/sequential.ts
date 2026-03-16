import { evaluateCel } from "../cel/index";
import type {
  ErrorStrategy,
  Participant,
  StepResult,
  Workflow,
  WorkflowResult,
} from "../model/index";
import { executeParticipant } from "../participant/index";
import type { WorkflowEngineExecutor } from "../participant/workflow";
import { executeWithRetry, resolveErrorStrategy } from "./errors";
import { WorkflowState } from "./state";
import { resolveTimeout, withTimeout } from "./timeout";

function isControlFlowStep(step: unknown): boolean {
  if (typeof step !== "object" || step == null || Array.isArray(step)) {
    return false;
  }

  const keys = Object.keys(step as Record<string, unknown>);
  return keys.length === 1 && ["loop", "parallel", "if"].includes(keys[0]);
}

function resolveParticipantInput(
  participantInput: string | Record<string, string> | undefined,
  state: WorkflowState,
): unknown {
  if (participantInput === undefined) {
    return undefined;
  }

  if (typeof participantInput === "string") {
    return evaluateCel(participantInput, state.toCelContext());
  }

  const resolved: Record<string, unknown> = {};
  for (const [key, expr] of Object.entries(participantInput)) {
    resolved[key] = evaluateCel(expr, state.toCelContext());
  }
  return resolved;
}

type FlowOverride = {
  timeout?: string;
  onError?: ErrorStrategy;
  when?: string;
  input?: string | Record<string, string>;
  retry?: {
    max: number;
    backoff: string;
    factor?: number;
  };
};

export async function executeStep(
  workflow: Workflow,
  state: WorkflowState,
  step: unknown,
  basePath = process.cwd(),
  engineExecutor?: WorkflowEngineExecutor,
  fallbackStack: string[] = [],
): Promise<void> {
  if (isControlFlowStep(step)) {
    throw new Error("control-flow construct passed to executeStep");
  }

  let stepName: string;
  let override: FlowOverride | undefined;

  if (typeof step === "string") {
    stepName = step;
  } else if (typeof step === "object" && step != null && !Array.isArray(step)) {
    const keys = Object.keys(step);
    if (keys.length !== 1) {
      throw new Error("invalid flow step override");
    }
    stepName = keys[0];
    override = (step as Record<string, FlowOverride>)[stepName];
  } else {
    throw new Error("invalid flow step");
  }

  const participant = workflow.participants[stepName] as Participant | undefined;
  if (!participant) {
    throw new Error(`participant '${stepName}' not found`);
  }

  const mergedParticipant: Participant = {
    ...participant,
    ...(override ?? {}),
  };

  const whenExpression = override?.when ?? participant.when;
  if (whenExpression) {
    const shouldRun = Boolean(evaluateCel(whenExpression, state.toCelContext()));
    if (!shouldRun) {
      state.setResult(stepName, {
        status: "skipped",
        output: "",
        duration: 0,
      });
      return;
    }
  }

  const inputMapping = override?.input ?? participant.input;
  const resolvedInput = resolveParticipantInput(inputMapping, state);
  const strategy = resolveErrorStrategy(override ?? null, participant, workflow.defaults ?? null);
  const timeoutMs = resolveTimeout(override ?? null, participant, workflow.defaults ?? null);
  const retryConfig = strategy === "retry" ? mergedParticipant.retry : undefined;

  const executeOnce = async (): Promise<StepResult> => {
    const invoke = async (): Promise<StepResult> => {
      const result = await executeParticipant(
        mergedParticipant,
        resolvedInput,
        {},
        basePath,
        engineExecutor,
      );

      if (result.status === "failed") {
        throw new Error(result.error || `participant '${stepName}' failed`);
      }

      return result;
    };

    if (timeoutMs === undefined) {
      return invoke();
    }

    return withTimeout(invoke, timeoutMs);
  };

  try {
    const result =
      strategy === "retry"
        ? (await executeWithRetry(executeOnce, retryConfig, stepName)).result
        : await executeOnce();

    state.setResult(stepName, result);
  } catch (error) {
    const message = String((error as Error)?.message ?? error);

    if (strategy === "skip") {
      state.setResult(stepName, {
        status: "skipped",
        output: "",
        error: message,
        duration: 0,
      });
      return;
    }

    if (strategy !== "fail" && strategy !== "retry") {
      const fallbackName = strategy;
      if (fallbackStack.includes(fallbackName)) {
        throw new Error(`fallback cycle detected on participant '${fallbackName}'`);
      }

      await executeStep(
        workflow,
        state,
        fallbackName,
        basePath,
        engineExecutor,
        [...fallbackStack, stepName],
      );

      const fallbackResult = state.getResult(fallbackName);
      if (!fallbackResult) {
        throw new Error(`fallback participant '${fallbackName}' produced no result`);
      }

      state.setResult(stepName, fallbackResult);
      return;
    }

    state.setResult(stepName, {
      status: "failed",
      output: "",
      error: message,
      duration: 0,
    });

    throw error;
  }
}

export async function executeSequential(
  workflow: Workflow,
  state: WorkflowState,
  basePath = process.cwd(),
  engineExecutor?: WorkflowEngineExecutor,
): Promise<void> {
  for (const step of workflow.flow) {
    await executeStep(workflow, state, step, basePath, engineExecutor);
  }
}
