import { spawn } from "node:child_process";

const SECRET_ENV = /(TOKEN|KEY|SECRET|PASSWORD|CREDENTIAL|DATABASE_URL)/i;

export function sanitizeLog(value: string): string {
  let output = value;
  for (const [key, raw] of Object.entries(process.env)) {
    if (!raw || raw.length < 8 || !SECRET_ENV.test(key)) continue;
    output = output.split(raw).join("***");
  }
  return output
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer ***")
    .replace(/x-access-token:[^@\s]+/gi, "x-access-token:***")
    .replace(/\bgh[pousr]_[A-Za-z0-9]{20,}\b/g, "***")
    .replace(/\bnpm_[A-Za-z0-9]{20,}\b/g, "***")
    .replace(/(postgres(?:ql)?:\/\/)[^\s"']+/gi, "$1***");
}

export type CommandResult = {
  code: number;
  output: string;
  timedOut: boolean;
  cancelled: boolean;
};

export function runCommand(
  binary: string,
  args: string[],
  options: {
    cwd?: string;
    timeoutMs?: number;
    env?: Record<string, string | undefined>;
    signal?: AbortSignal;
    onLine?: (line: string) => void;
  } = {},
): Promise<CommandResult> {
  return new Promise((resolve) => {
    const useShell = process.platform === "win32" && /\.(cmd|bat)$/i.test(binary);
    const child = useShell
      ? spawn(/* turbopackIgnore: true */ process.env.ComSpec ?? "cmd.exe", ["/d", "/s", "/c", binary, ...args], {
          cwd: options.cwd,
          windowsHide: true,
          env: { ...process.env, ...options.env },
        })
      : spawn(/* turbopackIgnore: true */ binary, args, {
          cwd: options.cwd,
          windowsHide: true,
          env: { ...process.env, ...options.env },
        });

    let output = "";
    let timedOut = false;
    let cancelled = false;

    const push = (chunk: string) => {
      output += chunk;
      if (output.length > 120_000) output = output.slice(output.length - 120_000);
      const lines = chunk.split(/\r?\n/).filter(Boolean);
      for (const line of lines) options.onLine?.(sanitizeLog(line).slice(0, 400));
    };

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, options.timeoutMs ?? 15 * 60 * 1000);

    const onAbort = () => {
      cancelled = true;
      child.kill("SIGKILL");
    };
    if (options.signal) {
      if (options.signal.aborted) onAbort();
      else options.signal.addEventListener("abort", onAbort, { once: true });
    }

    child.stdout.on("data", (data: Buffer) => push(data.toString()));
    child.stderr.on("data", (data: Buffer) => push(data.toString()));
    child.on("error", (error) => {
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", onAbort);
      resolve({ code: -1, output: `${output}\n${error.message}`, timedOut, cancelled });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", onAbort);
      resolve({ code: code ?? -1, output, timedOut, cancelled });
    });
  });
}
