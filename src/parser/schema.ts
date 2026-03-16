import { readFileSync } from "node:fs";
import Ajv from "ajv";
import addFormats from "ajv-formats";
import type { ValidationResult } from "../model/index";

const rawSchema = readFileSync(new URL("./schema/duckflux.schema.json", import.meta.url), "utf-8");
const schema = JSON.parse(rawSchema) as Record<string, unknown>;
delete schema.$schema;

const ajv = new Ajv({ allErrors: true, strict: false });
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
