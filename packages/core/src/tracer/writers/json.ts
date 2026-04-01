import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { ExecutionTrace, StepTrace } from "../../model/index";
import type { TraceFinalizeMeta, TraceOpenMeta, TraceWriter } from "../index";

export class JsonTraceWriter implements TraceWriter {
  private dir: string;
  private filePath = "";
  private trace: ExecutionTrace = {
    execution: {
      id: "",
      startedAt: "",
      finishedAt: "",
      duration: 0,
      status: "running",
      inputs: null,
      output: null,
    },
    steps: [],
  };

  constructor(dir: string) {
    this.dir = dir;
  }

  async open(meta: TraceOpenMeta): Promise<void> {
    this.filePath = join(this.dir, `${meta.id}.json`);
    this.trace = {
      execution: {
        id: meta.id,
        workflowId: meta.workflowId,
        workflowName: meta.workflowName,
        workflowVersion: meta.workflowVersion,
        startedAt: meta.startedAt,
        finishedAt: "",
        duration: 0,
        status: "running",
        inputs: meta.inputs,
        output: null,
      },
      steps: [],
    };
    await this.flush();
  }

  writeStep(step: StepTrace): void {
    this.trace.steps.push(step);
    this.flushSync();
  }

  async finalize(meta: TraceFinalizeMeta): Promise<void> {
    this.trace.execution.status = meta.status;
    this.trace.execution.output = meta.output;
    this.trace.execution.finishedAt = meta.finishedAt;
    this.trace.execution.duration = meta.duration;
    await this.flush();
  }

  private flushSync(): void {
    // Fire-and-forget async write; errors are silently ignored to not disrupt execution
    this.flush().catch(() => {});
  }

  private async flush(): Promise<void> {
    if (!this.filePath) return;
    await writeFile(this.filePath, JSON.stringify(this.trace, null, 2), "utf-8");
  }
}
