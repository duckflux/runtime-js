#!/usr/bin/env bun
import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { dirname, resolve } from "node:path";
import runCommand from "./run";
import lintCommand from "./lint";
import validateCommand from "./validate";

function getVersion(): string {
  try {
    const pkg = JSON.parse(readFileSync(resolve(dirname(new URL(import.meta.url).pathname), "../package.json"), "utf-8"));
    return pkg.version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
}

if (import.meta.main) {
  const argv = Bun.argv.slice(2);
  const { values, positionals } = parseArgs({
    args: argv,
    options: {
      input: { type: "string", multiple: true, short: "i" },
      "input-file": { type: "string" },
      verbose: { type: "boolean", short: "v" },
      quiet: { type: "boolean", default: false },
      cwd: { type: "string" },
      "event-backend": { type: "string", default: "memory" },
      "nats-url": { type: "string" },
      "nats-stream": { type: "string", default: "duckflux-events" },
      "redis-addr": { type: "string", default: "localhost:6379" },
      "redis-db": { type: "string", default: "0" },
      "trace-dir": { type: "string" },
      "trace-format": { type: "string", default: "json" },
    },
    allowPositionals: true,
  });

  const cmd = positionals[0] ?? "run";

  if (cmd === "version") {
    console.log(getVersion());
  } else if (cmd === "run") {
    const file = positionals[1];
    const exitCode = await runCommand(file, values);
    if (typeof exitCode === "number" && exitCode !== 0) process.exit(exitCode);
  } else if (cmd === "lint") {
    const file = positionals[1];
    const exitCode = await lintCommand(file);
    if (typeof exitCode === "number" && exitCode !== 0) process.exit(exitCode);
  } else if (cmd === "validate") {
    const file = positionals[1];
    const exitCode = await validateCommand(file, values);
    if (typeof exitCode === "number" && exitCode !== 0) process.exit(exitCode);
  } else {
    console.error("Unknown command:", cmd);
    console.error("Available commands: run, lint, validate, version");
    process.exit(1);
  }
}
