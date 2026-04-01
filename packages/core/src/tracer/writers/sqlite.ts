import { join } from "node:path";
import type { StepTrace } from "../../model/index";
import type { TraceFinalizeMeta, TraceOpenMeta, TraceWriter } from "../index";

function toJson(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

export class SqliteTraceWriter implements TraceWriter {
  private dir: string;
  private db: import("bun:sqlite").Database | null = null;
  private executionId = "";

  constructor(dir: string) {
    this.dir = dir;
  }

  async open(meta: TraceOpenMeta): Promise<void> {
    this.executionId = meta.id;
    const filePath = join(this.dir, `${meta.id}.sqlite`);

    const { Database } = await import("bun:sqlite");
    this.db = new Database(filePath);

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS executions (
        id TEXT PRIMARY KEY,
        workflow_id TEXT,
        workflow_name TEXT,
        workflow_version TEXT,
        started_at TEXT NOT NULL,
        finished_at TEXT,
        duration_ms INTEGER,
        status TEXT NOT NULL,
        inputs TEXT,
        output TEXT
      );

      CREATE TABLE IF NOT EXISTS steps (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        execution_id TEXT NOT NULL REFERENCES executions(id),
        seq INTEGER NOT NULL,
        name TEXT NOT NULL,
        type TEXT NOT NULL,
        started_at TEXT,
        finished_at TEXT,
        duration_ms INTEGER,
        status TEXT NOT NULL,
        input TEXT,
        output TEXT,
        error TEXT,
        retries INTEGER,
        loop_index INTEGER
      );
    `);

    const insert = this.db.prepare(`
      INSERT INTO executions (id, workflow_id, workflow_name, workflow_version, started_at, status, inputs)
      VALUES (?, ?, ?, ?, ?, 'running', ?)
    `);
    insert.run(
      meta.id,
      meta.workflowId ?? null,
      meta.workflowName ?? null,
      meta.workflowVersion !== undefined ? String(meta.workflowVersion) : null,
      meta.startedAt,
      toJson(meta.inputs),
    );
  }

  writeStep(step: StepTrace): void {
    if (!this.db) return;
    const insert = this.db.prepare(`
      INSERT INTO steps
        (execution_id, seq, name, type, started_at, finished_at, duration_ms, status, input, output, error, retries, loop_index)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    insert.run(
      this.executionId,
      step.seq,
      step.name,
      step.type,
      step.startedAt ?? null,
      step.finishedAt ?? null,
      step.duration ?? null,
      step.status,
      toJson(step.input),
      toJson(step.output),
      step.error ?? null,
      step.retries ?? null,
      step.loopIndex ?? null,
    );
  }

  async finalize(meta: TraceFinalizeMeta): Promise<void> {
    if (!this.db) return;
    const update = this.db.prepare(`
      UPDATE executions
      SET status = ?, output = ?, finished_at = ?, duration_ms = ?
      WHERE id = ?
    `);
    update.run(
      meta.status,
      toJson(meta.output),
      meta.finishedAt,
      Math.round(meta.duration),
      this.executionId,
    );
    this.db.close();
    this.db = null;
  }
}
