# @duckflux/core & @duckflux/runner

TypeScript runtime for [duckflux](https://docs.duckflux.openvibes.tech/javascript-runtime/) workflows. Dual-purpose: **CLI tool** (`@duckflux/runner`) and **importable library** (`@duckflux/core`).

Spec version: **v0.7**

## Packages

| Package | Description |
|---------|-------------|
| `@duckflux/core` | Engine, parser, CEL, event hub (in-memory) |
| `@duckflux/runner` | CLI tool (`quack run`, `quack lint`, `quack validate`) |
| `@duckflux/hub-nats` | Optional NATS JetStream event hub backend |
| `@duckflux/hub-redis` | Optional Redis Streams event hub backend |

## Installation

```bash
# Core library
bun add @duckflux/core

# CLI runner
bun add @duckflux/runner

# Optional event hub backends
bun add @duckflux/hub-nats
bun add @duckflux/hub-redis
```

## CLI Usage

```bash
# Run a workflow
quack run workflow.yaml
quack run workflow.yaml --input name=World --input count=3
quack run workflow.yaml --input-file inputs.json
quack run workflow.yaml --cwd /path/to/workdir
cat inputs.json | quack run workflow.yaml

# Validate (schema + semantics)
quack lint workflow.yaml

# Validate with inputs
quack validate workflow.yaml --input name=World

# Print version
quack version
```

### Input Precedence

`--input` > `--input-file` > stdin

### Event Hub Flags

```bash
quack run workflow.yaml --event-backend memory   # default (in-memory MemoryHub)
quack run workflow.yaml --event-backend nats --nats-url nats://localhost:4222
quack run workflow.yaml --event-backend redis --redis-addr localhost:6379
```

## Library Usage

```typescript
import {
  parseWorkflow,
  validateSchema,
  validateSemantic,
  executeWorkflow,
} from "@duckflux/core";
import { MemoryHub } from "@duckflux/core/eventhub";

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

// Execute with event hub
const hub = new MemoryHub();
const result = await executeWorkflow(workflow, {}, ".", { hub });

console.log(result.output);  // "Hello, World!\n"
console.log(result.success); // true

await hub.close();
```

### Sub-module Imports

```typescript
import { parseWorkflow } from "@duckflux/core/parser";
import { evaluateCel } from "@duckflux/core/cel";
import { executeWorkflow } from "@duckflux/core/engine";
import { MemoryHub } from "@duckflux/core/eventhub";
```

## Spec v0.7 Features

- **Participant types** — `exec`, `http`, `emit`, `workflow` (+ `mcp` stub)
- **Exec input semantics** — map input becomes env vars, string input becomes stdin
- **Input merge on flow override** — chain < participant base input < flow override input
- **`set` construct** — write values to `execution.context` via CEL expressions
- **Inline participants** — define steps directly in the flow without a `participants` block
- **Implicit I/O chain** — step output automatically flows as input to the next step
- **`wait` steps** — sleep, poll conditions, or wait for events
- **`emit` participant** — publish events with optional acknowledgment
- **Event hub** — in-memory (default), NATS JetStream, or Redis Streams backends
- **`loop`** — with `max`, `until`, and `as` (renamed loop context)
- **`parallel`** — concurrent branch execution with abort on failure
- **`if`/`else`** — conditional flow
- **`when` guard** — skip steps based on CEL condition
- **`workflow.inputs.*`** namespace — inputs accessed as `workflow.inputs.<field>` in CEL
- **Participant-scoped `input`/`output`** — `input` and `output` in CEL refer to the current step
- **Boolean strictness** — `if.condition`, `when`, `loop.until` must evaluate to boolean
- **Input coercion & constraints** — `enum`, `min`, `max`, `pattern`, `format`, etc.
- **CWD precedence** — `participant.cwd` > `defaults.cwd` > `--cwd` > `process.cwd()`
- **Error strategies** — `fail`, `skip`, `retry` (exponential backoff), redirect to fallback participant
- **Timeout resolution** — flow override > participant > defaults > none
- **Output schema validation** — validate step and workflow output against schema definitions
- **Circular sub-workflow detection** — prevents infinite recursion in nested workflows
- **CEL standard library** — `has`, `size`, `matches`, `contains`, `startsWith`, `endsWith`, `lowerAscii`, `upperAscii`, `replace`, `split`, `join`, `filter`, `map`, `exists`, `exists_one`, `all`, `timestamp`, `duration`

## Event Hub Backends

| Backend | Package | Use Case |
|---------|---------|----------|
| `memory` | `@duckflux/core` (built-in) | Development, testing, single-process |
| `nats` | `@duckflux/hub-nats` | Distributed, multi-process |
| `redis` | `@duckflux/hub-redis` | Distributed with persistence |

## Development

```bash
# Run tests
bun test

# Build for npm publishing (ESM + type declarations)
bun run build
```

## License

See repository root.
