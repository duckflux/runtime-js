import { evaluate, parse } from "cel-js";

export function validateCelExpression(expr: string): { valid: boolean; error?: string } {
  const parsed = parse(expr);
  if (parsed.isSuccess) {
    return { valid: true };
  }

  return {
    valid: false,
    error: parsed.errors.join("; "),
  };
}

export function evaluateCel(expr: unknown, context: Record<string, unknown>): unknown {
  if (typeof expr !== "string") {
    return expr;
  }

  const parsed = parse(expr);
  if (!parsed.isSuccess) {
    throw new Error(parsed.errors.join("; "));
  }

  return evaluate(parsed.cst, context);
}

type CelContextLike = {
  toCelContext?: () => Record<string, unknown>;
  getAllResults?: () => Record<string, { output?: unknown; parsedOutput?: unknown; status: string }>;
  inputs?: Record<string, unknown>;
  currentLoopIndex?: () => number;
};

export function buildCelContext(state: CelContextLike): Record<string, unknown> {
  if (typeof state.toCelContext === "function") {
    return state.toCelContext();
  }

  const ctx: Record<string, unknown> = {};

  const results = state.getAllResults ? state.getAllResults() : {};
  for (const [name, result] of Object.entries(results)) {
    ctx[name] = {
      output: result.parsedOutput ?? result.output,
      status: result.status,
    };
  }

  ctx.input = state.inputs ?? {};
  ctx.env = { ...process.env };
  ctx.loop = {
    index: state.currentLoopIndex ? state.currentLoopIndex() : 0,
  };

  return ctx;
}
