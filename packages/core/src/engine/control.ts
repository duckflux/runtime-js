import { evaluateCel } from "../cel/index";
import type { EventHub } from "../eventhub/types";
import type { Workflow } from "../model/index";
import type { WorkflowEngineExecutor } from "../participant/workflow";
import { executeSequential, executeStep } from "./sequential";
import type { WorkflowState } from "./state";

const RESERVED_SET_KEYS = new Set(["workflow", "execution", "input", "output", "env", "loop", "event"]);

export async function executeControlStep(
  workflow: Workflow,
  state: WorkflowState,
  step: unknown,
  basePath = process.cwd(),
  engineExecutor?: WorkflowEngineExecutor,
  chain?: unknown,
  hub?: EventHub,
  signal?: AbortSignal,
): Promise<unknown> {
  if (signal?.aborted) {
    throw new Error("execution aborted");
  }

  if (typeof step === "string") {
    return executeStep(workflow, state, step, basePath, engineExecutor, [], chain, hub, signal);
  }

  if (!step || typeof step !== "object" || Array.isArray(step)) {
    return executeStep(workflow, state, step, basePath, engineExecutor, [], chain, hub, signal);
  }

  const obj = step as Record<string, unknown>;

  // Wait step
  if ("wait" in obj && Object.keys(obj).length === 1) {
    const loopIndex = state.isInsideLoop() ? state.currentLoopIndex() : undefined;
    const traceSeq = state.tracer?.startStep("wait", "wait", undefined, loopIndex);
    try {
      const { executeWait } = await import("./wait");
      const result = await executeWait(state, (obj as { wait: Record<string, unknown> }).wait, chain, hub, signal);
      if (traceSeq !== undefined) state.tracer?.endStep(traceSeq, "success", result);
      return result;
    } catch (err) {
      if (traceSeq !== undefined) state.tracer?.endStep(traceSeq, "failure", undefined, String((err as Error)?.message ?? err));
      throw err;
    }
  }

  // Set step — write values to execution.context
  if ("set" in obj && Object.keys(obj).length === 1) {
    const setDef = (obj as { set: Record<string, string> }).set;
    const ctx = state.toCelContext();
    const loopIndex = state.isInsideLoop() ? state.currentLoopIndex() : undefined;
    const traceSeq = state.tracer?.startStep("set", "set", setDef, loopIndex);

    if (!state.executionMeta.context) {
      state.executionMeta.context = {};
    }

    for (const [key, expr] of Object.entries(setDef)) {
      if (RESERVED_SET_KEYS.has(key)) {
        if (traceSeq !== undefined) state.tracer?.endStep(traceSeq, "failure", undefined, `set key '${key}' uses a reserved name`);
        throw new Error(`set key '${key}' uses a reserved name`);
      }
      state.executionMeta.context[key] = evaluateCel(expr, ctx);
    }

    if (traceSeq !== undefined) state.tracer?.endStep(traceSeq, "success", state.executionMeta.context);
    // set does not produce output; chain passes through unchanged
    return chain;
  }

  // Loop step
  if ("loop" in obj && Object.keys(obj).length === 1) {
    const loopDef = (obj as { loop: { as?: string; until?: string; max?: number | string; steps: unknown[] } }).loop;
    const loopAs = loopDef.as;

    // Resolve max (can be CEL string)
    let maxIterations: number;
    if (typeof loopDef.max === "string") {
      const resolved = evaluateCel(loopDef.max, state.toCelContext());
      maxIterations = Number(resolved);
      if (!Number.isFinite(maxIterations)) {
        throw new Error(`loop.max CEL expression resolved to non-number: ${resolved}`);
      }
    } else {
      maxIterations = loopDef.max ?? Number.POSITIVE_INFINITY;
    }

    const hasMax = loopDef.max !== undefined;
    const outerLoopIndex = state.isInsideLoop() ? state.currentLoopIndex() : undefined;
    const loopTraceSeq = state.tracer?.startStep(loopAs ?? "loop", "loop", undefined, outerLoopIndex);

    state.pushLoop(loopAs);
    let loopChain = chain;
    try {
      let iterations = 0;

      while (iterations < maxIterations) {
        if (signal?.aborted) {
          throw new Error("execution aborted");
        }

        // Set loop.last before executing steps
        const isLast = hasMax && iterations + 1 === maxIterations;
        state.setLoopLast(isLast);

        loopChain = await executeSequential(
          workflow,
          state,
          loopDef.steps,
          basePath,
          engineExecutor,
          loopChain,
          hub,
          signal,
        );

        if (loopDef.until) {
          const untilValue = evaluateCel(loopDef.until, state.toCelContext());
          if (untilValue !== true && typeof untilValue !== "boolean") {
            throw new Error(`loop.until must evaluate to boolean, got ${typeof untilValue}`);
          }
          if (untilValue === true) {
            break;
          }
        }

        iterations += 1;
        state.incrementLoop();
      }
      if (loopTraceSeq !== undefined) state.tracer?.endStep(loopTraceSeq, "success", loopChain);
    } catch (err) {
      if (loopTraceSeq !== undefined) state.tracer?.endStep(loopTraceSeq, "failure", undefined, String((err as Error)?.message ?? err));
      throw err;
    } finally {
      state.popLoop();
    }
    return loopChain;
  }

  // Parallel step
  if ("parallel" in obj && Object.keys(obj).length === 1) {
    const parallelSteps = (obj as { parallel: unknown[] }).parallel;
    const controller = new AbortController();
    const loopIndex = state.isInsideLoop() ? state.currentLoopIndex() : undefined;
    const parallelTraceSeq = state.tracer?.startStep("parallel", "parallel", undefined, loopIndex);
    // Combine parent signal with local controller
    const branchSignal = signal
      ? AbortSignal.any([signal, controller.signal])
      : controller.signal;

    try {
      const results = await Promise.all(
        parallelSteps.map(async (parallelStep) => {
          try {
            // Each branch starts with the same incoming chain
            return await executeControlStep(workflow, state, parallelStep, basePath, engineExecutor, chain, hub, branchSignal);
          } catch (error) {
            controller.abort();
            throw error;
          }
        }),
      );

      if (parallelTraceSeq !== undefined) state.tracer?.endStep(parallelTraceSeq, "success", results);
      // Chain after parallel is ordered array of branch outputs
      return results;
    } catch (err) {
      if (parallelTraceSeq !== undefined) state.tracer?.endStep(parallelTraceSeq, "failure", undefined, String((err as Error)?.message ?? err));
      throw err;
    }
  }

  // If step
  if ("if" in obj && Object.keys(obj).length === 1) {
    const ifDef = (obj as { if: { condition: string; then: unknown[]; else?: unknown[] } }).if;
    const condition = evaluateCel(ifDef.condition, state.toCelContext());
    const loopIndex = state.isInsideLoop() ? state.currentLoopIndex() : undefined;
    const ifTraceSeq = state.tracer?.startStep("if", "if", { condition: ifDef.condition }, loopIndex);

    if (typeof condition !== "boolean") {
      if (ifTraceSeq !== undefined) state.tracer?.endStep(ifTraceSeq, "failure", undefined, `if.condition must evaluate to boolean, got ${typeof condition}`);
      throw new Error(`if.condition must evaluate to boolean, got ${typeof condition}`);
    }

    try {
      let result: unknown;
      if (condition) {
        result = await executeSequential(workflow, state, ifDef.then, basePath, engineExecutor, chain, hub, signal);
      } else if (ifDef.else) {
        result = await executeSequential(workflow, state, ifDef.else, basePath, engineExecutor, chain, hub, signal);
      } else {
        result = chain;
      }
      if (ifTraceSeq !== undefined) state.tracer?.endStep(ifTraceSeq, "success", result);
      return result;
    } catch (err) {
      if (ifTraceSeq !== undefined) state.tracer?.endStep(ifTraceSeq, "failure", undefined, String((err as Error)?.message ?? err));
      throw err;
    }
  }

  // Inline participant (has `type` field) or participant override
  return executeStep(workflow, state, step, basePath, engineExecutor, [], chain, hub, signal);
}
