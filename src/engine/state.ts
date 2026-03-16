import { env } from "node:process";

export interface StepResult {
  status: "completed" | "failed" | "skipped";
  output: string;
  parsedOutput?: unknown;
  error?: string;
  duration: number;
}

export class WorkflowState {
  readonly inputs: Record<string, unknown>;
  private results: Map<string, StepResult>;
  private loopStack: Array<{ index: number }>;

  constructor(inputs: Record<string, unknown> = {}) {
    this.inputs = { ...inputs };
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

  pushLoop(): void {
    this.loopStack.push({ index: 0 });
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

  toCelContext(): Record<string, unknown> {
    const ctx: Record<string, unknown> = {};
    // Map participant results
    for (const [name, res] of this.results.entries()) {
      ctx[name] = {
        output: res.parsedOutput ?? res.output,
        status: res.status,
      };
    }
    // Inputs
    ctx["input"] = this.inputs;
    // Env
    ctx["env"] = { ...env };
    // loop
    ctx["loop"] = { index: this.currentLoopIndex() };
    return ctx;
  }

  resolveOutput(
    outputDef: string | Record<string, string>,
    celEvaluator: (expr: string, ctx: Record<string, unknown>) => unknown
  ): unknown {
    const ctx = this.toCelContext();
    if (typeof outputDef === "string") {
      // Try to evaluate as CEL; if evaluation fails, return the literal
      try {
        return celEvaluator(outputDef, ctx);
      } catch {
        return outputDef;
      }
    }
    const result: Record<string, unknown> = {};
    for (const k of Object.keys(outputDef)) {
      const expr = outputDef[k];
      try {
        result[k] = celEvaluator(expr, ctx);
      } catch {
        result[k] = expr;
      }
    }
    return result;
  }
}

export default WorkflowState;
