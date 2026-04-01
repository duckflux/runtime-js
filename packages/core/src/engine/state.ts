import { env } from "node:process";
import type { StepResult } from "../model/index";
import type { TraceCollector } from "../tracer/index";

export type { StepResult };

export class WorkflowState {
  readonly inputs: Record<string, unknown>;
  private results: Map<string, StepResult>;
  private loopStack: Array<{ index: number; as?: string; last?: boolean }>;

  // v0.3 fields
  workflowInputs: Record<string, unknown>;
  workflowMeta: { id?: string; name?: string; version?: string | number };
  executionMeta: {
    id: string;
    number?: number;
    startedAt: string;
    status: string;
    context?: Record<string, unknown>;
    cwd: string;
  };
  currentInput: unknown;
  currentOutput: unknown;
  chainValue: unknown;
  eventPayload: unknown;
  /** @internal Tracks ancestor workflow paths for circular sub-workflow detection */
  ancestorPaths: Set<string>;
  /** @internal Optional trace collector; set by engine when --trace-dir is active */
  tracer?: TraceCollector;

  constructor(inputs: Record<string, unknown> = {}) {
    this.inputs = { ...inputs };
    this.workflowInputs = { ...inputs };
    this.workflowMeta = {};
    this.executionMeta = {
      id: crypto.randomUUID(),
      startedAt: new Date().toISOString(),
      status: "running",
      cwd: process.cwd(),
    };
    this.currentInput = undefined;
    this.currentOutput = undefined;
    this.chainValue = undefined;
    this.eventPayload = undefined;
    this.ancestorPaths = new Set();
    this.results = new Map();
    this.loopStack = [];
  }

  setResult(stepName: string, result: StepResult): void {
    this.results.set(stepName, result);
  }

  getResult(stepName: string): StepResult | undefined {
    return this.results.get(stepName);
  }

  getAllResults(): Record<string, StepResult> {
    const out: Record<string, StepResult> = {};
    for (const [k, v] of this.results.entries()) out[k] = v;
    return out;
  }

  pushLoop(as?: string): void {
    this.loopStack.push({ index: 0, as });
  }

  incrementLoop(): void {
    const top = this.loopStack[this.loopStack.length - 1];
    if (top) top.index += 1;
  }

  popLoop(): void {
    this.loopStack.pop();
  }

  currentLoopIndex(): number {
    const top = this.loopStack[this.loopStack.length - 1];
    return top ? top.index : 0;
  }

  setLoopLast(last: boolean): void {
    const top = this.loopStack[this.loopStack.length - 1];
    if (top) top.last = last;
  }

  isInsideLoop(): boolean {
    return this.loopStack.length > 0;
  }

  currentLoopContext(): { index: number; iteration: number; first: boolean; last: boolean; as?: string } {
    const top = this.loopStack[this.loopStack.length - 1];
    if (!top) return { index: 0, iteration: 1, first: true, last: false };
    return {
      index: top.index,
      iteration: top.index + 1,
      first: top.index === 0,
      last: top.last ?? false,
      as: top.as,
    };
  }

  toCelContext(): Record<string, unknown> {
    const ctx: Record<string, unknown> = {};

    // Step results (v0.3: <step>.output, <step>.status, etc.)
    for (const [name, res] of this.results.entries()) {
      ctx[name] = {
        output: res.parsedOutput ?? res.output,
        status: res.status,
        startedAt: res.startedAt,
        finishedAt: res.finishedAt,
        duration: res.duration,
        retries: res.retries ?? 0,
        error: res.error,
        cwd: res.cwd,
      };
    }

    // v0.3 namespaces
    ctx["workflow"] = {
      id: this.workflowMeta.id,
      name: this.workflowMeta.name,
      version: this.workflowMeta.version,
      inputs: this.workflowInputs,
      output: null, // resolved at end
    };

    ctx["execution"] = { ...this.executionMeta };

    // Participant-scoped input/output
    ctx["input"] = this.currentInput ?? {};
    ctx["output"] = this.currentOutput ?? {};

    // Environment
    ctx["env"] = { ...env };

    // Loop context
    const loopCtx = this.currentLoopContext();
    const loopObj = {
      index: loopCtx.index,
      iteration: loopCtx.iteration,
      first: loopCtx.first,
      last: loopCtx.last,
    };

    // If loop has custom `as`, expose under that name; also keep `loop` for compat
    if (loopCtx.as) {
      ctx[`_${loopCtx.as}`] = loopObj;
    }
    ctx["_loop"] = loopObj;
    ctx["loop"] = loopObj;

    // Event payload
    ctx["event"] = this.eventPayload ?? {};

    // Now — epoch seconds to match timestamp() and Go runner behavior (Spec §12.9)
    ctx["now"] = Math.floor(Date.now() / 1000);

    return ctx;
  }

  resolveOutput(
    outputDef: string | Record<string, string> | { schema: Record<string, unknown>; map: Record<string, string> },
    celEvaluator: (expr: string, ctx: Record<string, unknown>) => unknown,
  ): unknown {
    const ctx = this.toCelContext();

    // schema+map variant
    if (typeof outputDef === "object" && "map" in outputDef && "schema" in outputDef) {
      const result: Record<string, unknown> = {};
      for (const [k, expr] of Object.entries(outputDef.map)) {
        result[k] = celEvaluator(expr, ctx);
      }
      return result;
    }

    if (typeof outputDef === "string") {
      return celEvaluator(outputDef, ctx);
    }

    const result: Record<string, unknown> = {};
    for (const k of Object.keys(outputDef)) {
      const expr = (outputDef as Record<string, string>)[k];
      result[k] = celEvaluator(expr, ctx);
    }
    return result;
  }
}

export default WorkflowState;
