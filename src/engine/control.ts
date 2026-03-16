import { evaluateCel } from "../cel/index";
import type { Workflow } from "../model/index";
import type { WorkflowEngineExecutor } from "../participant/workflow";
import { executeSequential, executeStep } from "./sequential";
import { WorkflowState } from "./state";

export async function executeControlStep(
  workflow: Workflow,
  state: WorkflowState,
  step: any,
  basePath = process.cwd(),
  engineExecutor?: WorkflowEngineExecutor,
): Promise<void> {
  if (typeof step === "string") {
    await executeStep(workflow, state, step, basePath, engineExecutor);
    return;
  }

  if (step && typeof step === "object" && step.loop) {
    state.pushLoop();
    try {
      const maxIterations = step.loop.max ?? Number.POSITIVE_INFINITY;
      let iterations = 0;

      while (iterations < maxIterations) {
        await executeSequential(
          {
            ...workflow,
            flow: step.loop.steps,
          },
          state,
          basePath,
          engineExecutor,
        );

        if (step.loop.until) {
          const untilValue = Boolean(evaluateCel(step.loop.until, state.toCelContext()));
          if (untilValue) {
            break;
          }
        }

        iterations += 1;
        state.incrementLoop();
      }
    } finally {
      state.popLoop();
    }
    return;
  }

  if (step && typeof step === "object" && step.parallel) {
    await Promise.all(
      step.parallel.map(async (parallelStep: any) => {
        await executeControlStep(workflow, state, parallelStep, basePath, engineExecutor);
      }),
    );
    return;
  }

  if (step && typeof step === "object" && step.if) {
    const condition = Boolean(evaluateCel(step.if.condition, state.toCelContext()));
    const selectedFlow = condition ? step.if.then : (step.if.else ?? []);

    await executeSequential(
      {
        ...workflow,
        flow: selectedFlow,
      },
      state,
      basePath,
      engineExecutor,
    );
    return;
  }

  await executeStep(workflow, state, step, basePath, engineExecutor);
}
