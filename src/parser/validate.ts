import { constants } from "node:fs";
import { access } from "node:fs/promises";
import { resolve } from "node:path";
import { validateCelExpression } from "../cel/index";
import type { ValidationError, ValidationResult, Workflow } from "../model/index";

const RESERVED_NAMES = new Set(["workflow", "execution", "input", "output", "env", "loop", "event"]);
const BUILTIN_ONERROR = new Set(["fail", "skip", "retry"]);

function isInlineParticipant(step: unknown): step is Record<string, unknown> & { type: string } {
  return typeof step === "object" && step !== null && "type" in step;
}

function isWaitStep(step: unknown): step is { wait: Record<string, unknown> } {
  return typeof step === "object" && step !== null && "wait" in step && Object.keys(step).length === 1;
}

function collectParticipantReferences(
  flow: unknown[],
  refs: Array<{ name: string; path: string }>,
  inlineNames: Array<{ name: string; path: string }>,
  basePath = "flow",
): void {
  for (const [index, step] of flow.entries()) {
    const stepPath = `${basePath}[${index}]`;

    if (typeof step === "string") {
      refs.push({ name: step, path: stepPath });
      continue;
    }

    if (!step || typeof step !== "object") {
      continue;
    }

    // Inline participant
    if (isInlineParticipant(step)) {
      if (step.as && typeof step.as === "string") {
        inlineNames.push({ name: step.as, path: stepPath });
      }
      continue;
    }

    // Wait step
    if (isWaitStep(step)) {
      continue;
    }

    const obj = step as Record<string, unknown>;

    if (obj.parallel) {
      collectParticipantReferences(obj.parallel as unknown[], refs, inlineNames, `${stepPath}.parallel`);
      continue;
    }

    if (obj.loop) {
      const loopDef = obj.loop as Record<string, unknown>;
      collectParticipantReferences(
        (loopDef.steps ?? []) as unknown[],
        refs,
        inlineNames,
        `${stepPath}.loop.steps`,
      );
      continue;
    }

    if (obj.if) {
      const ifDef = obj.if as Record<string, unknown>;
      collectParticipantReferences(
        (ifDef.then ?? []) as unknown[],
        refs,
        inlineNames,
        `${stepPath}.if.then`,
      );
      if (ifDef.else) {
        collectParticipantReferences(
          ifDef.else as unknown[],
          refs,
          inlineNames,
          `${stepPath}.if.else`,
        );
      }
      continue;
    }

    // Participant override
    const keys = Object.keys(obj);
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

function validateFlowCel(flow: unknown[], errors: ValidationError[], basePath = "flow"): void {
  for (const [index, step] of flow.entries()) {
    const stepPath = `${basePath}[${index}]`;

    if (!step || typeof step !== "object") {
      continue;
    }

    const obj = step as Record<string, unknown>;

    // Wait step CEL
    if (isWaitStep(step)) {
      const waitDef = obj.wait as Record<string, unknown>;
      if (waitDef.match && typeof waitDef.match === "string") {
        validateCel(waitDef.match, errors, `${stepPath}.wait.match`);
      }
      if (waitDef.until && typeof waitDef.until === "string") {
        validateCel(waitDef.until, errors, `${stepPath}.wait.until`);
      }
      continue;
    }

    // Inline participant CEL
    if (isInlineParticipant(step)) {
      if (obj.when && typeof obj.when === "string") {
        validateCel(obj.when, errors, `${stepPath}.when`);
      }
      if (typeof obj.input === "string") {
        validateCel(obj.input, errors, `${stepPath}.input`);
      }
      if (obj.input && typeof obj.input === "object") {
        for (const [key, value] of Object.entries(obj.input as Record<string, unknown>)) {
          if (typeof value === "string") {
            validateCel(value, errors, `${stepPath}.input.${key}`);
          }
        }
      }
      // Emit payload CEL
      if (obj.type === "emit" && obj.payload && typeof obj.payload === "string") {
        validateCel(obj.payload, errors, `${stepPath}.payload`);
      }
      continue;
    }

    // Set step CEL
    if ("set" in obj && Object.keys(obj).length === 1) {
      const setDef = obj.set as Record<string, string>;
      for (const [key, expr] of Object.entries(setDef)) {
        if (typeof expr === "string") {
          validateCel(expr, errors, `${stepPath}.set.${key}`);
        }
      }
      continue;
    }

    if (obj.loop) {
      const loopDef = obj.loop as Record<string, unknown>;
      if (loopDef.until && typeof loopDef.until === "string") {
        validateCel(loopDef.until, errors, `${stepPath}.loop.until`);
      }
      validateFlowCel(
        (loopDef.steps ?? []) as unknown[],
        errors,
        `${stepPath}.loop.steps`,
      );
      continue;
    }

    if (obj.parallel) {
      validateFlowCel(obj.parallel as unknown[], errors, `${stepPath}.parallel`);
      continue;
    }

    if (obj.if) {
      const ifDef = obj.if as Record<string, unknown>;
      if (ifDef.condition && typeof ifDef.condition === "string") {
        validateCel(ifDef.condition, errors, `${stepPath}.if.condition`);
      }
      validateFlowCel((ifDef.then ?? []) as unknown[], errors, `${stepPath}.if.then`);
      if (ifDef.else) {
        validateFlowCel(ifDef.else as unknown[], errors, `${stepPath}.if.else`);
      }
      continue;
    }

    // Participant override
    const keys = Object.keys(obj);
    if (keys.length !== 1) continue;

    const participantName = keys[0];
    const override = obj[participantName];
    if (!override || typeof override !== "object") continue;

    const ov = override as Record<string, unknown>;
    if (ov.when && typeof ov.when === "string") {
      validateCel(ov.when, errors, `${stepPath}.${participantName}.when`);
    }
    if (typeof ov.input === "string") {
      validateCel(ov.input, errors, `${stepPath}.${participantName}.input`);
    }
    if (ov.input && typeof ov.input === "object") {
      for (const [key, value] of Object.entries(ov.input as Record<string, unknown>)) {
        if (typeof value === "string") {
          validateCel(value, errors, `${stepPath}.${participantName}.input.${key}`);
        }
      }
    }
  }
}

function validateLoopConstraints(flow: unknown[], errors: ValidationError[], basePath = "flow"): void {
  for (const [index, step] of flow.entries()) {
    const stepPath = `${basePath}[${index}]`;

    if (!step || typeof step !== "object") continue;

    const obj = step as Record<string, unknown>;

    if (obj.loop) {
      const loopDef = obj.loop as Record<string, unknown>;
      if (loopDef.until == null && loopDef.max == null) {
        errors.push({
          path: `${stepPath}.loop`,
          message: "loop must define at least one of 'until' or 'max'",
        });
      }
      // Validate loop.as doesn't conflict with reserved names
      if (loopDef.as && typeof loopDef.as === "string" && RESERVED_NAMES.has(loopDef.as)) {
        errors.push({
          path: `${stepPath}.loop.as`,
          message: `loop.as '${loopDef.as}' conflicts with reserved name`,
        });
      }
      validateLoopConstraints(
        (loopDef.steps ?? []) as unknown[],
        errors,
        `${stepPath}.loop.steps`,
      );
      continue;
    }

    if (obj.parallel) {
      validateLoopConstraints(obj.parallel as unknown[], errors, `${stepPath}.parallel`);
      continue;
    }

    if (obj.if) {
      const ifDef = obj.if as Record<string, unknown>;
      validateLoopConstraints((ifDef.then ?? []) as unknown[], errors, `${stepPath}.if.then`);
      if (ifDef.else) {
        validateLoopConstraints(ifDef.else as unknown[], errors, `${stepPath}.if.else`);
      }
    }
  }
}

function validateWaitSteps(flow: unknown[], errors: ValidationError[], basePath = "flow"): void {
  for (const [index, step] of flow.entries()) {
    const stepPath = `${basePath}[${index}]`;

    if (!step || typeof step !== "object") continue;

    if (isWaitStep(step)) {
      const waitDef = (step as { wait: Record<string, unknown> }).wait;

      // Validate wait modes
      const hasEvent = !!waitDef.event;
      const hasUntil = !!waitDef.until;

      if (hasEvent && hasUntil) {
        errors.push({
          path: `${stepPath}.wait`,
          message: "wait step cannot have both 'event' and 'until'",
        });
      }

      // Event mode: event required
      if (waitDef.match && !hasEvent) {
        errors.push({
          path: `${stepPath}.wait.match`,
          message: "wait.match requires wait.event",
        });
      }

      // Polling mode: until required for poll
      if (waitDef.poll && !hasUntil) {
        errors.push({
          path: `${stepPath}.wait.poll`,
          message: "wait.poll requires wait.until",
        });
      }

      // onTimeout validation
      if (waitDef.onTimeout && typeof waitDef.onTimeout === "string") {
        if (waitDef.onTimeout !== "fail" && waitDef.onTimeout !== "skip") {
          // Could be a participant name - validated elsewhere
        }
      }
      continue;
    }

    const obj = step as Record<string, unknown>;
    if (obj.loop) {
      validateWaitSteps(
        ((obj.loop as Record<string, unknown>).steps ?? []) as unknown[],
        errors,
        `${stepPath}.loop.steps`,
      );
    }
    if (obj.parallel) {
      validateWaitSteps(obj.parallel as unknown[], errors, `${stepPath}.parallel`);
    }
    if (obj.if) {
      const ifDef = obj.if as Record<string, unknown>;
      validateWaitSteps((ifDef.then ?? []) as unknown[], errors, `${stepPath}.if.then`);
      if (ifDef.else) {
        validateWaitSteps(ifDef.else as unknown[], errors, `${stepPath}.if.else`);
      }
    }
  }
}

function validateEmitParticipants(
  participants: Record<string, { type: string; event?: string }>,
  errors: ValidationError[],
): void {
  for (const [name, p] of Object.entries(participants)) {
    if (p.type === "emit" && !p.event) {
      errors.push({
        path: `participants.${name}.event`,
        message: "emit participant requires 'event' field",
      });
    }
  }
}

export async function validateSemantic(workflow: Workflow, basePath: string): Promise<ValidationResult> {
  const errors: ValidationError[] = [];
  const participants = workflow.participants ?? {};
  const participantNames = new Set(Object.keys(participants));

  // Validate reserved names
  for (const name of participantNames) {
    if (RESERVED_NAMES.has(name)) {
      errors.push({ path: `participants.${name}`, message: "participant name is reserved" });
    }
  }

  // Validate flow is non-empty
  if (!workflow.flow || workflow.flow.length === 0) {
    errors.push({ path: "flow", message: "flow must contain at least one step" });
  }

  // Collect references and inline names
  const refs: Array<{ name: string; path: string }> = [];
  const inlineNames: Array<{ name: string; path: string }> = [];
  collectParticipantReferences(workflow.flow ?? [], refs, inlineNames);

  // Validate participant references exist
  for (const ref of refs) {
    if (!participantNames.has(ref.name)) {
      errors.push({ path: ref.path, message: `participant '${ref.name}' does not exist` });
    }
  }

  // Validate inline `as` uniqueness
  const seenInlineNames = new Set<string>();
  for (const inline of inlineNames) {
    if (participantNames.has(inline.name)) {
      errors.push({
        path: inline.path,
        message: `inline participant 'as: ${inline.name}' conflicts with top-level participant`,
      });
    }
    if (RESERVED_NAMES.has(inline.name)) {
      errors.push({
        path: inline.path,
        message: `inline participant 'as: ${inline.name}' uses a reserved name`,
      });
    }
    if (seenInlineNames.has(inline.name)) {
      errors.push({
        path: inline.path,
        message: `inline participant 'as: ${inline.name}' is not unique`,
      });
    }
    seenInlineNames.add(inline.name);
  }

  // Validate onError references
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

  // Validate emit participants
  validateEmitParticipants(participants as Record<string, { type: string; event?: string }>, errors);

  // Validate loop, wait, CEL
  validateLoopConstraints(workflow.flow ?? [], errors);
  validateWaitSteps(workflow.flow ?? [], errors);
  validateFlowCel(workflow.flow ?? [], errors);

  // Validate sub-workflow paths
  for (const [name, participant] of Object.entries(participants)) {
    if (participant.type !== "workflow") continue;

    const resolvedPath = resolve(basePath, (participant as { path: string }).path);
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
