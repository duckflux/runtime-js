import { createInterface } from "node:readline";

export interface StepResult {
  status: "completed" | "failed" | "skipped";
  output: string;
  parsedOutput?: unknown;
  error?: string;
  duration: number;
}

function inputToString(input: unknown): string {
  if (input == null) return "";
  if (typeof input === "string") return input;
  try {
    return JSON.stringify(input);
  } catch (_) {
    return String(input);
  }
}

export default async function executeHuman(participant: any, input?: unknown): Promise<StepResult> {
  const promptText = participant?.prompt ?? "";
  const start = Date.now();

  // write prompt to stdout
  try {
    process.stdout.write(promptText + " ");
  } catch (_) {
    // ignore if writing fails
  }

  const rl = createInterface({ input: process.stdin, output: process.stdout });

  const answer: string = await new Promise((resolve) => {
    try {
      rl.question("", (ans) => {
        rl.close();
        resolve(ans);
      });
    } catch (err) {
      rl.close();
      resolve("");
    }
  });

  const duration = Date.now() - start;

  let parsed: unknown | undefined = undefined;
  try {
    parsed = JSON.parse(answer);
  } catch (_) {
    // ignore parse errors
  }

  return { status: "completed", output: answer, parsedOutput: parsed, duration };
}
