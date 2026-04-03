#!/usr/bin/env bun
import { dirname } from "node:path";
import { parseWorkflowFile, validateSchema, validateSemantic } from "@duckflux/core";
import type { Workflow } from "@duckflux/core";

interface LintWarning {
  path: string;
  message: string;
}

function collectLintWarnings(workflow: Workflow): LintWarning[] {
  const warnings: LintWarning[] = [];
  const participants = workflow.participants ?? {};

  collectFlowWarnings(workflow.flow ?? [], participants, warnings);

  return warnings;
}

function collectFlowWarnings(
  flow: unknown[],
  participants: Record<string, { type: string; as?: string; [key: string]: unknown }>,
  warnings: LintWarning[],
  basePath = "flow",
): void {
  for (const [index, step] of flow.entries()) {
    const stepPath = `${basePath}[${index}]`;

    if (!step || typeof step !== "object") continue;

    const obj = step as Record<string, unknown>;

    // Warn: loop with no `until` and no `max`
    if (obj.loop && Object.keys(obj).length === 1) {
      const loopDef = obj.loop as Record<string, unknown>;
      if (loopDef.until == null && loopDef.max == null) {
        warnings.push({
          path: `${stepPath}.loop`,
          message: "loop has no 'until' and no 'max' — this will be rejected at runtime",
        });
      }
      collectFlowWarnings(
        (loopDef.steps ?? []) as unknown[],
        participants,
        warnings,
        `${stepPath}.loop.steps`,
      );
      continue;
    }

    // Warn: parallel branches referencing the same mutable state via `set`
    if (obj.parallel && Object.keys(obj).length === 1) {
      const parallelSteps = obj.parallel as unknown[];
      const branchSetKeys: Map<string, number[]> = new Map();
      for (const [branchIdx, branch] of parallelSteps.entries()) {
        const setKeys = collectSetKeys(branch);
        for (const key of setKeys) {
          const branches = branchSetKeys.get(key) ?? [];
          branches.push(branchIdx);
          branchSetKeys.set(key, branches);
        }
      }
      for (const [key, branches] of branchSetKeys) {
        if (branches.length > 1) {
          warnings.push({
            path: `${stepPath}.parallel`,
            message: `branches [${branches.join(", ")}] both write to '${key}' via set — race condition risk`,
          });
        }
      }
      collectFlowWarnings(parallelSteps, participants, warnings, `${stepPath}.parallel`);
      continue;
    }

    // Warn: anonymous participant output referenced by name (unreachable)
    if ("type" in obj && !obj.as) {
      warnings.push({
        path: stepPath,
        message: "inline participant without 'as' — its output cannot be referenced by name",
      });
      continue;
    }

    if (obj.if && Object.keys(obj).length === 1) {
      const ifDef = obj.if as Record<string, unknown>;
      collectFlowWarnings(
        (ifDef.then ?? []) as unknown[],
        participants,
        warnings,
        `${stepPath}.if.then`,
      );
      if (ifDef.else) {
        collectFlowWarnings(
          ifDef.else as unknown[],
          participants,
          warnings,
          `${stepPath}.if.else`,
        );
      }
    }
  }
}

function collectSetKeys(step: unknown): string[] {
  if (!step || typeof step !== "object") return [];
  const obj = step as Record<string, unknown>;

  if ("set" in obj && Object.keys(obj).length === 1) {
    return Object.keys(obj.set as Record<string, unknown>);
  }

  // Recurse into nested flow structures
  const keys: string[] = [];
  if (obj.loop) {
    const loopDef = obj.loop as Record<string, unknown>;
    for (const s of (loopDef.steps ?? []) as unknown[]) {
      keys.push(...collectSetKeys(s));
    }
  }
  if (obj.if) {
    const ifDef = obj.if as Record<string, unknown>;
    for (const s of (ifDef.then ?? []) as unknown[]) {
      keys.push(...collectSetKeys(s));
    }
    if (ifDef.else) {
      for (const s of ifDef.else as unknown[]) {
        keys.push(...collectSetKeys(s));
      }
    }
  }
  return keys;
}

export default async function lintCommand(filePath?: string): Promise<number> {
  if (!filePath) {
    console.error("Usage: quack lint <workflow.yaml>");
    return 1;
  }

  try {
    const workflow = await parseWorkflowFile(filePath);

    const schemaRes = validateSchema(workflow);
    if (!schemaRes.valid) {
      console.error("Schema validation failed:");
      for (const e of schemaRes.errors) {
        console.error(`  - ${e.path}: ${e.message}`);
      }
      return 1;
    }

    const basePath = dirname(filePath);
    const semanticRes = await validateSemantic(workflow, basePath);
    if (!semanticRes.valid) {
      console.error("Semantic validation failed:");
      for (const e of semanticRes.errors) {
        console.error(`  - ${e.path}: ${e.message}`);
      }
      return 1;
    }

    // Lint warnings (non-blocking)
    const warnings = collectLintWarnings(workflow);
    if (warnings.length > 0) {
      console.warn("Warnings:");
      for (const w of warnings) {
        console.warn(`  - ${w.path}: ${w.message}`);
      }
    }

    console.log("valid");
    return 0;
  } catch (err: any) {
    console.error("Error during lint:", err && err.message ? err.message : err);
    return 1;
  }
}

export { lintCommand };
