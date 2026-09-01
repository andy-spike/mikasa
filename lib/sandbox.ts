import "server-only";

/**
 * The real Sandbox (ticket #9): a Vercel Sandbox created for one
 * verification pass. It receives no environment variables — the
 * deployment's secrets never reach the machine the candidate's code runs
 * on — and it is stopped as soon as the pass ends.
 */
import { Sandbox } from "@vercel/sandbox";
import type { SandboxProvider } from "@/lib/course/sandbox-verify";

/** The whole pass gets five minutes before the Sandbox is torn down. */
const SANDBOX_TIMEOUT_MS = 5 * 60 * 1000;

/** One command inside the Sandbox gets at most two minutes. */
const COMMAND_TIMEOUT_MS = 2 * 60 * 1000;

export function vercelSandboxProvider(): SandboxProvider {
  return {
    create: async () => {
      /* Deliberately no `env`: the Sandbox inherits nothing. */
      const sandbox = await Sandbox.create({ timeout: SANDBOX_TIMEOUT_MS });

      return {
        createdWith: { env: undefined },
        writeFile: (path, content) => sandbox.fs.writeFile(path, content),
        run: async (command) => {
          const [cmd, ...args] = command.trim().split(/\s+/);
          const result = await sandbox.runCommand(cmd, args, {
            signal: AbortSignal.timeout(COMMAND_TIMEOUT_MS),
          });
          const [stdout, stderr] = await Promise.all([result.stdout(), result.stderr()]);
          return { exitCode: result.exitCode, stdout, stderr };
        },
        listFiles: async () => {
          const entries = await sandbox.fs.readdir(".", { withFileTypes: true });
          const paths: string[] = [];
          for (const entry of entries) {
            if (entry.isFile()) paths.push(entry.name);
            else if (entry.isDirectory()) {
              const nested = await sandbox.fs.readdir(entry.name);
              paths.push(...nested.map((n) => `${entry.name}/${n}`));
            }
          }
          return paths.sort();
        },
        dispose: async () => {
          await sandbox.stop();
        },
      };
    },
  };
}
