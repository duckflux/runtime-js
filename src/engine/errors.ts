import type { ErrorStrategy, RetryConfig } from "../model/index";

export class WorkflowError extends Error {
  stepName: string;
  strategy: ErrorStrategy;
  retriesAttempted: number;

  constructor(message: string, stepName: string, strategy: ErrorStrategy, retriesAttempted = 0) {
    super(message);
    this.name = "WorkflowError";
    this.stepName = stepName;
    this.strategy = strategy;
    this.retriesAttempted = retriesAttempted;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function parseDuration(duration: string): number {
  const match = duration.match(/^\s*(\d+(?:\.\d+)?)\s*(ms|s|m|h)\s*$/i);
  if (!match) {
    throw new Error(`unsupported duration format: ${duration}`);
  }

  const value = Number(match[1]);
  const unit = match[2].toLowerCase();

  switch (unit) {
    case "ms":
      return Math.round(value);
    case "s":
      return Math.round(value * 1000);
    case "m":
      return Math.round(value * 60 * 1000);
    case "h":
      return Math.round(value * 60 * 60 * 1000);
    default:
      throw new Error(`unsupported duration unit: ${unit}`);
  }
}

export function resolveErrorStrategy(
  stepOverride?: { onError?: ErrorStrategy } | null,
  participant?: { onError?: ErrorStrategy } | null,
  defaults?: { onError?: ErrorStrategy } | null,
): ErrorStrategy {
  if (stepOverride?.onError) {
    return stepOverride.onError;
  }
  if (participant?.onError) {
    return participant.onError;
  }
  if (defaults?.onError) {
    return defaults.onError;
  }
  return "fail";
}

export async function executeWithRetry<T>(
  fn: () => Promise<T>,
  retryConfig: RetryConfig | undefined,
  stepName = "<unknown>",
): Promise<{ result: T; attempts: number }> {
  const maxRetries = retryConfig?.max ?? 0;
  const baseBackoffMs = retryConfig?.backoff ? parseDuration(retryConfig.backoff) : 0;
  const factor = retryConfig?.factor ?? 1;

  let attempt = 0;
  while (true) {
    try {
      const result = await fn();
      return { result, attempts: attempt };
    } catch (error) {
      if (attempt >= maxRetries) {
        throw new WorkflowError(String((error as Error)?.message ?? error), stepName, "retry", attempt);
      }

      const delay = Math.round(baseBackoffMs * Math.pow(factor, attempt));
      if (delay > 0) {
        await sleep(delay);
      }

      attempt += 1;
    }
  }
}
