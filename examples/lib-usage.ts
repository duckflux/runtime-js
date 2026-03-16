import {
  parseWorkflow,
  validateSchema,
  validateSemantic,
  executeWorkflow,
} from "@duckflux/runner";

const yaml = `
name: greet
participants:
  greeter:
    type: exec
    run: sh -c 'name=$(cat -); echo "Hello, $name!"'
    input: input.name
inputs:
  name:
    type: string
    required: true
flow:
  - greeter
output: greeter.output
`;

const workflow = parseWorkflow(yaml);

const schemaResult = validateSchema(workflow);
if (!schemaResult.valid) {
  console.error("Schema errors:", schemaResult.errors);
  process.exit(1);
}

const semanticResult = await validateSemantic(workflow, ".");
if (!semanticResult.valid) {
  console.error("Semantic errors:", semanticResult.errors);
  process.exit(1);
}

const result = await executeWorkflow(workflow, { name: "World" });
console.log("Output:", result.output);
