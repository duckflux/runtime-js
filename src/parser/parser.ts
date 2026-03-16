import { readFile } from "node:fs/promises";
import yaml from "yaml";
import type { Workflow, Participant } from "../model/index";

function normalizeParticipants(participants: Record<string, Participant> | undefined): Record<string, Participant> | undefined {
  if (!participants) return participants;

  for (const [name, p] of Object.entries(participants)) {
    try {
      if ((p as any).type === "exec") {
        const exec = p as any;
        if (exec.run == null) {
          if (exec.command != null) {
            exec.run = exec.command;
            delete exec.command;
          } else if (exec.cmd != null) {
            exec.run = exec.cmd;
            delete exec.cmd;
          }
        }
      }

      if ((p as any).type === "human" || (p as any).type === "hook") {
        // keep legacy types for compatibility but emit a warning so maintainers
        // can decide on a migration policy.
        // Do not change the object shape here to avoid unexpected side-effects.
        // This is intentionally a console warning so CI logs capture it.
        // eslint-disable-next-line no-console
        console.warn(`participant '${name}' uses legacy type '${(p as any).type}'`);
      }
    } catch (e) {
      // ignore normalization errors to avoid breaking parsing of user workflows
    }
  }

  return participants;
}

export function parseWorkflow(yamlContent: string): Workflow {
  const parsed = yaml.parse(yamlContent) as Workflow;
  // Normalize legacy participant fields for backward compatibility
  parsed.participants = normalizeParticipants(parsed.participants) as Record<string, Participant> | undefined;
  return parsed;
}

export async function parseWorkflowFile(filePath: string): Promise<Workflow> {
  const content = await readFile(filePath, "utf-8");
  return parseWorkflow(content);
}
