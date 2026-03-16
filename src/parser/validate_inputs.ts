import type { InputDefinition, ValidationError, ValidationResult } from "../model/index";

function matchesType(typeName: string, value: unknown): boolean {
  switch (typeName) {
    case "string":
      return typeof value === "string";
    case "integer":
      return typeof value === "number" && Number.isInteger(value);
    case "number":
      return typeof value === "number";
    case "boolean":
      return typeof value === "boolean";
    case "array":
      return Array.isArray(value);
    case "object":
      return typeof value === "object" && value !== null && !Array.isArray(value);
    default:
      return true;
  }
}

export function validateInputs(
  inputDefs: Record<string, InputDefinition> | undefined,
  provided: Record<string, unknown>,
): { result: ValidationResult; resolved: Record<string, unknown> } {
  if (!inputDefs) {
    return {
      result: { valid: true, errors: [] },
      resolved: { ...provided },
    };
  }

  const errors: ValidationError[] = [];
  const resolved: Record<string, unknown> = { ...provided };

  for (const [name, definition] of Object.entries(inputDefs)) {
    const hasProvided = Object.prototype.hasOwnProperty.call(provided, name);

    if (!hasProvided) {
      if (definition.default !== undefined) {
        resolved[name] = definition.default;
      } else if (definition.required) {
        errors.push({
          path: `inputs.${name}`,
          message: `required input '${name}' is missing`,
        });
      }
      continue;
    }

    if (definition.type && !matchesType(definition.type, provided[name])) {
      errors.push({
        path: `inputs.${name}`,
        message: `input '${name}' must be of type '${definition.type}'`,
      });
    }
  }

  return {
    result: { valid: errors.length === 0, errors },
    resolved,
  };
}
