import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { StepTrace } from "../model/index";

export type { StepTrace };

export interface TraceOpenMeta {
  id: string;
  workflowId?: string;
  workflowName?: string;
  workflowVersion?: string | number;
  startedAt: string;
  inputs: unknown;
}

export interface TraceFinalizeMeta {
  status: "success" | "failure";
  output: unknown;
  finishedAt: string;
  duration: number;
}

export interface TraceWriter {
  open(meta: TraceOpenMeta): Promise<void>;
  writeStep(step: StepTrace): void | Promise<void>;
  finalize(meta: TraceFinalizeMeta): Promise<void>;
}

export class TraceCollector {
  private openSteps: Map<number, { name: string; type: string; startedAt: string; startMs: number; input?: unknown; loopIndex?: number }> = new Map();
  private seq = 0;
  readonly truncateAt: number;
  writer?: TraceWriter;

  constructor(truncateAt = 1_000_000) {
    this.truncateAt = truncateAt;
  }

  startStep(name: string, type: string, input?: unknown, loopIndex?: number): number {
    this.seq += 1;
    this.openSteps.set(this.seq, {
      name,
      type,
      startedAt: new Date().toISOString(),
      startMs: performance.now(),
      input: input !== undefined ? this.truncate(input) : undefined,
      loopIndex,
    });
    return this.seq;
  }

  endStep(seq: number, status: StepTrace["status"], output?: unknown, error?: string, retries?: number): void {
    const open = this.openSteps.get(seq);
    if (!open) return;
    this.openSteps.delete(seq);

    const finishedAt = new Date().toISOString();
    const duration = Math.max(0, performance.now() - open.startMs);

    const step: StepTrace = {
      seq,
      name: open.name,
      type: open.type,
      startedAt: open.startedAt,
      finishedAt,
      duration: Math.round(duration),
      status,
      ...(open.input !== undefined ? { input: open.input } : {}),
      ...(output !== undefined ? { output: this.truncate(output) } : {}),
      ...(error !== undefined ? { error } : {}),
      ...(retries !== undefined && retries > 0 ? { retries } : {}),
      ...(open.loopIndex !== undefined ? { loopIndex: open.loopIndex } : {}),
    };

    this.writer?.writeStep(step);
  }

  truncate(value: unknown): unknown {
    if (value == null) return value;
    const str = typeof value === "string" ? value : JSON.stringify(value);
    const bytes = new TextEncoder().encode(str);
    if (bytes.length <= this.truncateAt) return value;
    const cut = new TextDecoder().decode(bytes.slice(0, this.truncateAt));
    return cut + "...[truncated]";
  }
}

export async function createTraceWriter(
  dir: string,
  format: "json" | "txt" | "sqlite",
): Promise<TraceWriter> {
  await mkdir(dir, { recursive: true });

  if (format === "json") {
    const { JsonTraceWriter } = await import("./writers/json");
    return new JsonTraceWriter(dir);
  }
  if (format === "txt") {
    const { TxtTraceWriter } = await import("./writers/txt");
    return new TxtTraceWriter(dir);
  }
  if (format === "sqlite") {
    const { SqliteTraceWriter } = await import("./writers/sqlite");
    return new SqliteTraceWriter(dir);
  }

  throw new Error(`unknown trace format: ${format}`);
}
