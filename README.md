# @duckflux/runtime

JavaScript/TypeScript runtime for [duckflux](https://duckflux.dev) workflows. Dual-purpose: **CLI tool** and **importable library**.

Spec version: **v0.4**

## Installation

```bash
# With Bun (recommended)
bun add @duckflux/runtime

# With npm
npm install @duckflux/runtime
```

## CLI Usage

```bash
# Run a workflow
duckflux run workflow.yaml
duckflux run workflow.yaml --input name=World --input count=3
duckflux run workflow.yaml --input-file inputs.json
duckflux run workflow.yaml --cwd /path/to/workdir
cat inputs.json | duckflux run workflow.yaml

# Validate (schema + semantics)
duckflux lint workflow.yaml

# Validate with inputs
duckflux validate workflow.yaml --input name=World

# Print version
duckflux version
```

### Input Precedence

`--input` > `--input-file` > stdin

### Event Hub Flags

```bash
duckflux run workflow.yaml --event-backend memory   # default
duckflux run workflow.yaml --event-backend nats --nats-url nats://localhost:4222
duckflux run workflow.yaml --event-backend redis --redis-addr localhost:6379
```

## Library Usage

```typescript
import {
  parseWorkflow,
  validateSchema,
  validateSemantic,
  executeWorkflow,
  MemoryHub,
} from "@duckflux/runtime";

const yaml = `
flow:
  - type: exec
    as: greet
    run: echo "Hello, World!"
output: greet.output
`;

const workflow = parseWorkflow(yaml);

// Validate
const schema = validateSchema(workflow);
const semantic = await validateSemantic(workflow, ".");

// Execute with optional event hub
const hub = new MemoryHub();
const result = await executeWorkflow(workflow, {}, ".", { hub });

console.log(result.output);  // "Hello, World!\n"
console.log(result.success); // true

await hub.close();
```

### Sub-module Imports

```typescript
import { parseWorkflow } from "@duckflux/runtime/parser";
import { evaluateCel } from "@duckflux/runtime/cel";
import { executeWorkflow } from "@duckflux/runtime/engine";
import { createHub, MemoryHub } from "@duckflux/runtime/eventhub";
```

## Spec v0.4 Features

- **`set` construct** — write values to `execution.context` via CEL expressions; a flow-level control operation transparent to the I/O chain
- **Inline participants** — define steps directly in the flow without a `participants` block
- **Anonymous inline** — omit `as` for unnamed steps; output accessible only via implicit I/O chain
- **Implicit I/O chain** — step output automatically flows as input to the next step
- **`wait` steps** — sleep, poll conditions, or wait for events
- **`emit` participant** — publish events with optional acknowledgment
- **Event hub** — in-memory, NATS JetStream, or Redis Streams backends
- **`workflow.inputs.*`** namespace — inputs accessed as `workflow.inputs.<field>` in CEL
- **Participant-scoped `input`/`output`** — `input` and `output` in CEL refer to the current step
- **`loop.as`** — rename the loop context variable
- **Boolean strictness** — `if.condition`, `when`, `loop.until` must evaluate to boolean
- **Input coercion & constraints** — `enum`, `min`, `max`, `pattern`, `format`, etc.
- **CWD precedence** — `participant.cwd` > `defaults.cwd` > `--cwd` > `process.cwd()`
- **Default output** — if no `output:` defined, returns final chain value
- **Parallel output** — ordered array of branch outputs

## Event Hub Backends

| Backend | Package | Use Case |
|---------|---------|----------|
| `memory` | built-in | Development, testing, single-process |
| `nats` | `nats` (optional) | Distributed, multi-process |
| `redis` | `ioredis` (optional) | Distributed with persistence |

NATS and Redis packages are optional dependencies — install them only if needed.

## Development

```bash
# Run tests
bun test

# Build for npm publishing (ESM + type declarations)
bun run build
```

## License

See repository root.
