import { constants } from "node:fs";
import { access } from "node:fs/promises";
import { resolve } from "node:path";
import { validateCelExpression } from "../cel/index";
import type { ValidationError, ValidationResult, Workflow } from "../model/index";

const RESERVED_NAMES = new Set(["workflow", "execution", "input", "output", "env", "loop"]);
const BUILTIN_ONERROR = new Set(["fail", "skip", "retry"]);

function collectParticipantReferences(flow: any[], refs: Array<{ name: string; path: string }>, basePath = "flow"): void {
  for (const [index, step] of flow.entries()) {
    const stepPath = `${basePath}[${index}]`;

    if (typeof step === "string") {
      refs.push({ name: step, path: stepPath });
      continue;
    }

    if (!step || typeof step !== "object") {
      continue;
    }

    if (step.parallel) {
      collectParticipantReferences(step.parallel, refs, `${stepPath}.parallel`);
      continue;
    }

    if (step.loop) {
      collectParticipantReferences(step.loop.steps ?? [], refs, `${stepPath}.loop.steps`);
      continue;
    }

    if (step.if) {
      collectParticipantReferences(step.if.then ?? [], refs, `${stepPath}.if.then`);
      if (step.if.else) {
        collectParticipantReferences(step.if.else, refs, `${stepPath}.if.else`);
      }
      continue;
    }

    const keys = Object.keys(step);
    if (keys.length === 1) {
      refs.push({ name: keys[0], path: `${stepPath}.${keys[0]}` });
    }
  }
}

function validateCel(expr: string, errors: ValidationError[], path: string): void {
  const validation = validateCelExpression(expr);
  if (!validation.valid) {
    errors.push({ path, message: validation.error ?? "invalid CEL expression" });
  }
}

function validateFlowCel(flow: any[], errors: ValidationError[], basePath = "flow"): void {
  for (const [index, step] of flow.entries()) {
    const stepPath = `${basePath}[${index}]`;

    if (!step || typeof step !== "object") {
      continue;
    }

    if (step.loop) {
      if (step.loop.until) {
        validateCel(step.loop.until, errors, `${stepPath}.loop.until`);
      }
      validateFlowCel(step.loop.steps ?? [], errors, `${stepPath}.loop.steps`);
      continue;
    }

    if (step.parallel) {
      validateFlowCel(step.parallel, errors, `${stepPath}.parallel`);
      continue;
    }

    if (step.if) {
      if (step.if.condition) {
        validateCel(step.if.condition, errors, `${stepPath}.if.condition`);
      }
      validateFlowCel(step.if.then ?? [], errors, `${stepPath}.if.then`);
      if (step.if.else) {
        validateFlowCel(step.if.else, errors, `${stepPath}.if.else`);
      }
      continue;
    }

    const keys = Object.keys(step);
    if (keys.length !== 1) {
      continue;
    }

    const participantName = keys[0];
    const override = step[participantName];
    if (!override || typeof override !== "object") {
      continue;
    }

    if (override.when) {
      validateCel(override.when, errors, `${stepPath}.${participantName}.when`);
    }

    if (typeof override.input === "string") {
      validateCel(override.input, errors, `${stepPath}.${participantName}.input`);
    }

    if (override.input && typeof override.input === "object") {
      for (const [key, value] of Object.entries(override.input)) {
        if (typeof value === "string") {
          validateCel(value, errors, `${stepPath}.${participantName}.input.${key}`);
        }
      }
    }
  }
}

function validateLoopConstraints(flow: any[], errors: ValidationError[], basePath = "flow"): void {
  for (const [index, step] of flow.entries()) {
    const stepPath = `${basePath}[${index}]`;

    if (!step || typeof step !== "object") {
      continue;
    }

    if (step.loop) {
      if (step.loop.until == null && step.loop.max == null) {
        errors.push({
          path: `${stepPath}.loop`,
          message: "loop must define at least one of 'until' or 'max'",
        });
      }
      validateLoopConstraints(step.loop.steps ?? [], errors, `${stepPath}.loop.steps`);
      continue;
    }

    if (step.parallel) {
      validateLoopConstraints(step.parallel, errors, `${stepPath}.parallel`);
      continue;
    }

    if (step.if) {
      validateLoopConstraints(step.if.then ?? [], errors, `${stepPath}.if.then`);
      if (step.if.else) {
        validateLoopConstraints(step.if.else, errors, `${stepPath}.if.else`);
      }
    }
  }
}

export async function validateSemantic(workflow: Workflow, basePath: string): Promise<ValidationResult> {
  const errors: ValidationError[] = [];
  const participants = workflow.participants ?? {};
  const participantNames = new Set(Object.keys(participants));

  for (const name of participantNames) {
    if (RESERVED_NAMES.has(name)) {
      errors.push({ path: `participants.${name}`, message: "participant name is reserved" });
    }
  }

  const refs: Array<{ name: string; path: string }> = [];
  collectParticipantReferences(workflow.flow ?? [], refs);
  for (const ref of refs) {
    if (!participantNames.has(ref.name)) {
      errors.push({ path: ref.path, message: `participant '${ref.name}' does not exist` });
    }
  }

  const defaultsOnError = workflow.defaults?.onError;
  if (defaultsOnError && !BUILTIN_ONERROR.has(defaultsOnError) && !participantNames.has(defaultsOnError)) {
    errors.push({
      path: "defaults.onError",
      message: `onError fallback '${defaultsOnError}' does not reference an existing participant`,
    });
  }

  for (const [name, participant] of Object.entries(participants)) {
    if (participant.onError && !BUILTIN_ONERROR.has(participant.onError) && !participantNames.has(participant.onError)) {
      errors.push({
        path: `participants.${name}.onError`,
        message: `onError fallback '${participant.onError}' does not reference an existing participant`,
      });
    }
  }

  validateLoopConstraints(workflow.flow ?? [], errors);
  validateFlowCel(workflow.flow ?? [], errors);

  for (const [name, participant] of Object.entries(participants)) {
    if (participant.type !== "workflow") {
      continue;
    }

    const resolvedPath = resolve(basePath, participant.path);
    const exists = await access(resolvedPath, constants.F_OK).then(
      () => true,
      () => false,
    );

    if (!exists) {
      errors.push({
        path: `participants.${name}.path`,
        message: `sub-workflow path does not exist: ${resolvedPath}`,
      });
    }
  }

  return { valid: errors.length === 0, errors };
}
