import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createServer } from "node:net";
import { dirname, join, resolve } from "node:path";
import { spawn, spawnSync } from "node:child_process";

const FIRST_WORKTREE_PORT = 3001;
const LAST_WORKTREE_PORT = 3010;
const LOCK_WAIT_MS = 50;

function git(...args) {
  const result = spawnSync("git", args, { encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || `git ${args.join(" ")} failed`);
  }
  return result.stdout.trim();
}

function sleep(milliseconds) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
}

function processIsRunning(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === "EPERM";
  }
}

function acquireLock(lockPath) {
  mkdirSync(dirname(lockPath), { recursive: true });

  for (let attempt = 0; attempt < 200; attempt += 1) {
    try {
      const descriptor = openSync(lockPath, "wx");
      writeFileSync(descriptor, `${process.pid}\n`);
      return () => {
        closeSync(descriptor);
        if (existsSync(lockPath) && readFileSync(lockPath, "utf8").trim() === String(process.pid)) {
          rmSync(lockPath);
        }
      };
    } catch (error) {
      if (error.code !== "EEXIST") throw error;

      try {
        const ownerPid = Number(readFileSync(lockPath, "utf8").trim());
        if (!processIsRunning(ownerPid)) {
          rmSync(lockPath, { force: true });
          continue;
        }
      } catch (readError) {
        if (readError.code !== "ENOENT") throw readError;
      }
      sleep(LOCK_WAIT_MS);
    }
  }

  throw new Error("Timed out waiting for another worktree to choose a development port");
}

function canListen(port) {
  return new Promise((resolveResult) => {
    const server = createServer();
    server.unref();
    server.once("error", () => resolveResult(false));
    server.listen({ host: "127.0.0.1", port }, () => {
      server.close(() => resolveResult(true));
    });
  });
}

function worktreeContext() {
  const worktreePath = resolve(git("rev-parse", "--show-toplevel"));
  const commonGitDirectory = resolve(worktreePath, git("rev-parse", "--git-common-dir"));
  return {
    branch: git("branch", "--show-current"),
    commonGitDirectory,
    isPrimary: worktreePath === dirname(commonGitDirectory),
  };
}

async function choosePort(isPrimary) {
  if (isPrimary) return 3000;

  for (let port = FIRST_WORKTREE_PORT; port <= LAST_WORKTREE_PORT; port += 1) {
    if (await canListen(port)) return port;
  }

  throw new Error(
    `No development port is available. Remove an unused worktree or stop the process using ports ${FIRST_WORKTREE_PORT}-${LAST_WORKTREE_PORT}.`,
  );
}

async function waitUntilReady(child, port) {
  for (let attempt = 0; attempt < 300; attempt += 1) {
    if (child.exitCode !== null) {
      throw new Error(`Next.js exited before opening port ${port}`);
    }
    if (!(await canListen(port))) return;
    await new Promise((resolveWait) => setTimeout(resolveWait, 50));
  }
  throw new Error(`Timed out waiting for Next.js to open port ${port}`);
}

const context = worktreeContext();
const lockPath = join(context.commonGitDirectory, "wt", "dev-port-start.lock");
const releaseLock = acquireLock(lockPath);
let child;
let port;

try {
  port = await choosePort(context.isPrimary);
  child = spawn(
    process.execPath,
    ["node_modules/next/dist/bin/next", "dev", "--port", String(port)],
    { stdio: "inherit" },
  );
  await waitUntilReady(child, port);

  const stateResult = spawnSync("wt", ["config", "state", "vars", "set", `devport=${port}`], {
    stdio: "inherit",
  });
  if (stateResult.status !== 0) throw new Error("Failed to save the development port");
} catch (error) {
  child?.kill("SIGTERM");
  throw error;
} finally {
  releaseLock();
}

console.log(`worktrunk: ${context.branch} is available at http://localhost:${port}`);

let stopping = false;
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    stopping = true;
    child.kill(signal);
  });
}

const result = await new Promise((resolveExit) => {
  child.on("exit", (code, signal) => resolveExit({ code, signal }));
});
process.exit(stopping ? 0 : (result.code ?? 1));
