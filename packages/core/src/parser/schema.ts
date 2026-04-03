import Ajv2020 from "ajv/dist/2020";
import addFormats from "ajv-formats";
import type { ValidationResult } from "../model/index";
import rawSchemaJson from "./schema/duckflux.schema.json";

const schema = { ...rawSchemaJson } as Record<string, unknown>;
delete schema.$schema;

const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);
const validate = ajv.compile(schema);

export function validateSchema(workflow: unknown): ValidationResult {
  const valid = validate(workflow);
  if (valid) {
    return { valid: true, errors: [] };
  }

  const errors = (validate.errors ?? []).map((err) => ({
    path: err.instancePath || "/",
    message: err.message || "schema validation error",
  }));

  return { valid: false, errors };
}
