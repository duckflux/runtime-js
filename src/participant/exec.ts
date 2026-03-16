import { spawn } from "node:child_process";

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

export async function executeExec(
  participant: any,
  input?: unknown,
  env: Record<string, string> = {},
  signal?: AbortSignal
): Promise<StepResult> {
  const command = participant.run ?? participant.command ?? participant.cmd ?? "";
  const participantEnv = participant.env ?? {};
  const cwd = participant.cwd ?? process.cwd();

  const start = Date.now();

  return new Promise<StepResult>((resolve) => {
    try {
      const proc = spawn("sh", ["-c", command], { env: { ...process.env, ...env, ...participantEnv }, cwd, stdio: ["pipe", "pipe", "pipe"] });

      let stdout = "";
      let stderr = "";

      const onStdout = (d: Buffer) => { stdout += d.toString(); };
      const onStderr = (d: Buffer) => { stderr += d.toString(); };

      proc.stdout.on("data", onStdout);
      proc.stderr.on("data", onStderr);

      let aborted = false;
      const onAbort = () => {
        aborted = true;
        try { proc.kill("SIGKILL"); } catch (_) {}
      };

      if (signal) {
        if (signal.aborted) onAbort();
        else signal.addEventListener("abort", onAbort);
      }

      proc.on("error", (err) => {
        const duration = Date.now() - start;
        if (signal) signal.removeEventListener("abort", onAbort);
        resolve({ status: "failed", output: "", parsedOutput: undefined, error: String(err), duration });
      });

      proc.on("close", (code) => {
        const duration = Date.now() - start;
        if (signal) signal.removeEventListener("abort", onAbort);

        if (aborted) {
          resolve({ status: "failed", output: stdout, parsedOutput: undefined, error: "aborted", duration });
          return;
        }

        const exitCode = code ?? 1;
        if (exitCode !== 0) {
          const errMsg = stderr.trim() || `exit code ${exitCode}`;
          resolve({ status: "failed", output: stdout, parsedOutput: undefined, error: errMsg, duration });
          return;
        }

        let parsed: unknown | undefined = undefined;
        try {
          parsed = JSON.parse(stdout);
        } catch (_) {
          // ignore parse errors
        }

        resolve({ status: "completed", output: stdout, parsedOutput: parsed, duration });
      });

      // write input if provided
      if (input !== undefined && input !== null) {
        const s = inputToString(input);
        try {
          proc.stdin.write(s);
          proc.stdin.end();
        } catch (err) {
          // ignore
        }
      }
    } catch (err) {
      const duration = Date.now() - start;
      resolve({ status: "failed", output: "", parsedOutput: undefined, error: String(err), duration });
    }
  });
}

export default executeExec;
