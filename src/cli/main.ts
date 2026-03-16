#!/usr/bin/env bun
import { parseArgs } from "node:util";
import runCommand from "./run";
import lintCommand from "./lint";
import validateCommand from "./validate";

if (import.meta.main) {
  const argv = Bun.argv.slice(2);
  const { values, positionals } = parseArgs({
    args: argv,
    options: {
      input: { type: "string", multiple: true, short: "i" },
      "input-file": { type: "string" },
      verbose: { type: "boolean", short: "v" },
      quiet: { type: "boolean", default: false },
    },
    allowPositionals: true,
  });

  const cmd = positionals[0] ?? "run";
  if (cmd === "run") {
    const file = positionals[1];
    const exitCode = await runCommand(file, values);
    if (typeof exitCode === "number" && exitCode !== 0) process.exit(exitCode);
  } else if (cmd === "lint") {
    const file = positionals[1];
    const exitCode = await lintCommand(file);
    if (typeof exitCode === "number" && exitCode !== 0) process.exit(exitCode);
    } else if (cmd === "validate") {
      const file = positionals[1];
      const valuesArg = values;
      const exitCode = await validateCommand(file, valuesArg);
      if (typeof exitCode === "number" && exitCode !== 0) process.exit(exitCode);
  } else {
    console.error("Unknown command:", cmd);
    process.exit(1);
  }
}
