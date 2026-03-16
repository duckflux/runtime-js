import { parseDuration } from "./errors";

export class TimeoutError extends Error {
  timeoutMs: number;
  constructor(message: string, timeoutMs: number) {
    super(message);
    this.name = "TimeoutError";
    this.timeoutMs = timeoutMs;
  }
}

export async function withTimeout<T>(fn: () => Promise<T>, timeoutMs: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new TimeoutError(`operation timed out after ${timeoutMs}ms`, timeoutMs)), timeoutMs);
  });
  try {
    return await Promise.race([fn(), timeoutPromise]) as T;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export function resolveTimeout(
  flowOverride?: { timeout?: string } | null,
  participant?: { timeout?: string } | null,
  defaults?: { timeout?: string } | null
): number | undefined {
  const t = (flowOverride && flowOverride.timeout) ?? (participant && participant.timeout) ?? (defaults && defaults.timeout);
  if (!t) return undefined;
  try {
    return parseDuration(t);
  } catch (err) {
    // If parsing fails, rethrow as Error with context
    throw new Error(`invalid timeout value '${t}': ${(err && (err as Error).message) || err}`);
  }
}

export default {
  TimeoutError,
  withTimeout,
  resolveTimeout,
};
