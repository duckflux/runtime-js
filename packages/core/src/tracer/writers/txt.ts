import { appendFile, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { StepTrace } from "../../model/index";
import type { TraceFinalizeMeta, TraceOpenMeta, TraceWriter } from "../index";

function serializeValue(value: unknown): string {
  if (value === undefined || value === null) return "none";
  if (typeof value === "string") return value;
  return JSON.stringify(value, null, 2);
}

function formatStep(step: StepTrace): string {
  const lines: string[] = [
    `## [${step.seq}] ${step.name} (${step.type})`,
    `startedAt: ${step.startedAt}`,
  ];
  if (step.finishedAt) lines.push(`finishedAt: ${step.finishedAt}`);
  if (step.duration !== undefined) lines.push(`duration: ${step.duration}ms`);
  lines.push(`status: ${step.status}`);
  if (step.loopIndex !== undefined) lines.push(`loopIndex: ${step.loopIndex}`);
  if (step.retries !== undefined && step.retries > 0) lines.push(`retries: ${step.retries}`);
  lines.push(`input: ${serializeValue(step.input)}`);
  lines.push(`output: ${serializeValue(step.output)}`);
  if (step.error) lines.push(`error: ${step.error}`);
  lines.push("");
  return lines.join("\n");
}

export class TxtTraceWriter implements TraceWriter {
  private dir: string;
  private filePath = "";

  constructor(dir: string) {
    this.dir = dir;
  }

  async open(meta: TraceOpenMeta): Promise<void> {
    this.filePath = join(this.dir, `${meta.id}.txt`);

    const versionStr = meta.workflowVersion !== undefined ? ` (v${meta.workflowVersion})` : "";
    const workflowLabel = meta.workflowName ?? meta.workflowId ?? "unnamed";

    const header = [
      "# execution",
      `id: ${meta.id}`,
      `workflow: ${workflowLabel}${versionStr}`,
      `startedAt: ${meta.startedAt}`,
      "status: running",
      "",
      "# inputs",
      serializeValue(meta.inputs),
      "",
      "# steps",
      "",
    ].join("\n");

    await writeFile(this.filePath, header, "utf-8");
  }

  async writeStep(step: StepTrace): Promise<void> {
    if (!this.filePath) return;
    await appendFile(this.filePath, formatStep(step), "utf-8");
  }

  async finalize(meta: TraceFinalizeMeta): Promise<void> {
    if (!this.filePath) return;

    // Append output section
    const outputSection = [
      "# output",
      serializeValue(meta.output),
      "",
    ].join("\n");
    await appendFile(this.filePath, outputSection, "utf-8");

    // Rewrite the status: running line with final values
    const content = await readFile(this.filePath, "utf-8");
    const updated = content
      .replace(/^status: running$/m, `status: ${meta.status}\nfinishedAt: ${meta.finishedAt}\nduration: ${meta.duration}ms`);
    await writeFile(this.filePath, updated, "utf-8");
  }
}
