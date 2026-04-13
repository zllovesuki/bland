import { spawn, execFile as execFileCallback, type ChildProcess } from "node:child_process";
import { createWriteStream, type WriteStream } from "node:fs";
import { readFile, rm, writeFile } from "node:fs/promises";
import net from "node:net";
import { join, resolve } from "node:path";
import process from "node:process";
import { setTimeout as sleep } from "node:timers/promises";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFile = promisify(execFileCallback);

const REPO_ROOT = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const VITE_BIN_PATH = resolve(REPO_ROOT, "node_modules/vite/bin/vite.js");
const NPX_COMMAND = process.platform === "win32" ? "npx.cmd" : "npx";
const SERVER_READY_TIMEOUT_MS = 120_000;
const POLL_INTERVAL_MS = 1_000;
const D1_DATABASE = "bland-prod";
const DEV_VARS_PATH = resolve(REPO_ROOT, ".dev.vars");
const DEV_VARS_EXAMPLE_PATH = resolve(REPO_ROOT, ".dev.vars.example");

const TEST_EMAIL = "e2e@bland.test";
const TEST_PASSWORD = "testpass123";
const TEST_USER_NAME = "E2E Test User";
const WORKSPACE_NAME = "bland";
const WORKSPACE_SLUG = "bland";

// Pre-computed Argon2id hash for TEST_PASSWORD with fixed salt.
// Generated with: argon2id("testpass123", fixedSalt, { t:2, m:19456, p:1, dkLen:32 })
const TEST_PASSWORD_HASH =
  "$argon2id$v=19$m=19456,t=2,p=1$AQIDBAUGBwgJCgsMDQ4PEA$rA.QLz6haXry79CxQAJYTFYy9kR.h6L0nEpdIFqdDP4";

export interface E2eContext {
  tempDir: string;
  baseUrl: string;
  port: number;
  cloudflareEnv: string;
  devVarsPath: string;
  serverProcess: ChildProcess;
  stdoutLogPath: string;
  stderrLogPath: string;
  stdoutStream: WriteStream;
  stderrStream: WriteStream;
}

export interface E2eContextFile {
  baseUrl: string;
  tempDir: string;
}

export const TEST_CREDENTIALS = {
  email: TEST_EMAIL,
  password: TEST_PASSWORD,
  name: TEST_USER_NAME,
  workspaceSlug: WORKSPACE_SLUG,
} as const;

const delayUntil = async <T>(description: string, timeoutMs: number, action: () => Promise<T | null>): Promise<T> => {
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown = null;

  while (Date.now() < deadline) {
    try {
      const result = await action();
      if (result !== null) return result;
    } catch (error) {
      lastError = error;
    }
    await sleep(POLL_INTERVAL_MS);
  }

  if (lastError instanceof Error) {
    throw new Error(`${description} timed out: ${lastError.message}`);
  }
  throw new Error(`${description} timed out.`);
};

const closeWriteStream = async (stream: WriteStream): Promise<void> =>
  await new Promise<void>((resolveClose, reject) => {
    if (stream.destroyed || stream.closed || stream.writableFinished) {
      resolveClose();
      return;
    }
    try {
      stream.end((error?: Error | null) => {
        if (error) {
          reject(error);
          return;
        }
        resolveClose();
      });
    } catch (error) {
      reject(error);
    }
  });

export const getFreePort = async (): Promise<number> =>
  await new Promise<number>((resolvePort, reject) => {
    const server = net.createServer();
    server.unref();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close(() => reject(new Error("Failed to allocate a localhost port.")));
        return;
      }
      server.close((error?: Error | null) => {
        if (error) {
          reject(error);
          return;
        }
        resolvePort(address.port);
      });
    });
  });

const execCommand = async (
  command: string,
  args: string[],
  env: NodeJS.ProcessEnv,
): Promise<{ stdout: string; stderr: string }> =>
  await execFile(command, args, {
    cwd: REPO_ROOT,
    env,
    maxBuffer: 10 * 1024 * 1024,
  });

const waitForServerReady = async (baseUrl: string): Promise<void> => {
  await delayUntil("dev server readiness", SERVER_READY_TIMEOUT_MS, async () => {
    const status = await fetch(new URL("/api/v1/health", baseUrl), {
      signal: AbortSignal.timeout(5_000),
    }).then((r) => r.status);
    return status === 200 ? true : null;
  });
};

function mergeAllowedOrigins(...rawValues: Array<string | undefined>): string {
  const origins = new Set<string>();

  for (const rawValue of rawValues) {
    if (!rawValue) continue;

    for (const rawOrigin of rawValue.split(",")) {
      const trimmedOrigin = rawOrigin.trim();
      if (!trimmedOrigin) continue;
      origins.add(new URL(trimmedOrigin).origin);
    }
  }

  return [...origins].join(",");
}

async function loadDevVarsTemplate(): Promise<string> {
  for (const path of [DEV_VARS_PATH, DEV_VARS_EXAMPLE_PATH]) {
    try {
      return await readFile(path, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }

  throw new Error("Missing .dev.vars and .dev.vars.example");
}

async function createE2eDevVarsFile(baseUrl: string): Promise<{ cloudflareEnv: string; devVarsPath: string }> {
  const cloudflareEnv = `e2e-${process.pid}-${Date.now()}`;
  const devVarsPath = `${DEV_VARS_PATH}.${cloudflareEnv}`;
  const template = await loadDevVarsTemplate();
  const allowedOrigins = mergeAllowedOrigins(process.env.ALLOWED_ORIGINS, baseUrl);
  const content = `${template.replace(/^ALLOWED_ORIGINS=.*$/gm, "").trimEnd()}\nALLOWED_ORIGINS=${allowedOrigins}\n`;

  await writeFile(devVarsPath, content);

  return { cloudflareEnv, devVarsPath };
}

function escapeSql(value: string): string {
  return value.replace(/'/g, "''");
}

function generateUlid(): string {
  const timestamp = Date.now();
  const encodingChars = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
  let result = "";
  let t = timestamp;
  for (let i = 9; i >= 0; i--) {
    result = encodingChars[t % 32] + result;
    t = Math.floor(t / 32);
  }
  const random = new Uint8Array(10);
  crypto.getRandomValues(random);
  for (let i = 0; i < 10; i++) {
    result += encodingChars[random[i] % 32];
  }
  return result;
}

export const applyMigrations = async (persistTo: string): Promise<void> => {
  await execCommand(
    NPX_COMMAND,
    ["wrangler", "d1", "migrations", "apply", D1_DATABASE, "--local", "--persist-to", persistTo],
    { ...process.env, CI: "1", NO_D1_WARNING: "true" },
  );
};

export const seedTestUser = async (persistTo: string): Promise<void> => {
  const userId = generateUlid();
  const workspaceId = generateUlid();
  const now = new Date().toISOString();

  const sql = [
    `INSERT INTO users (id, email, password_hash, name, created_at, updated_at) VALUES ('${escapeSql(userId)}', '${escapeSql(TEST_EMAIL)}', '${escapeSql(TEST_PASSWORD_HASH)}', '${escapeSql(TEST_USER_NAME)}', '${escapeSql(now)}', '${escapeSql(now)}');`,
    `INSERT INTO workspaces (id, name, slug, owner_id, created_at) VALUES ('${escapeSql(workspaceId)}', '${escapeSql(WORKSPACE_NAME)}', '${escapeSql(WORKSPACE_SLUG)}', '${escapeSql(userId)}', '${escapeSql(now)}');`,
    `INSERT INTO memberships (user_id, workspace_id, role, joined_at) VALUES ('${escapeSql(userId)}', '${escapeSql(workspaceId)}', 'owner', '${escapeSql(now)}');`,
  ].join("\n");

  await execCommand(
    NPX_COMMAND,
    ["wrangler", "d1", "execute", D1_DATABASE, "--local", "--persist-to", persistTo, "--yes", "--command", sql],
    { ...process.env, CI: "1", NO_D1_WARNING: "true" },
  );
};

export const startDevServer = async (persistTo: string): Promise<E2eContext> => {
  const port = await getFreePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const { cloudflareEnv, devVarsPath } = await createE2eDevVarsFile(baseUrl);
  const stdoutLogPath = join(persistTo, "dev.stdout.log");
  const stderrLogPath = join(persistTo, "dev.stderr.log");
  const stdoutStream = createWriteStream(stdoutLogPath, { flags: "a" });
  const stderrStream = createWriteStream(stderrLogPath, { flags: "a" });

  const serverProcess = spawn(process.execPath, [VITE_BIN_PATH, "dev", "--host", "127.0.0.1", "--port", String(port)], {
    cwd: REPO_ROOT,
    env: { ...process.env, BLAND_PERSIST_STATE_PATH: persistTo, CLOUDFLARE_ENV: cloudflareEnv },
    stdio: ["ignore", "pipe", "pipe"],
    detached: process.platform !== "win32",
  });

  serverProcess.stdout?.pipe(stdoutStream);
  serverProcess.stderr?.pipe(stderrStream);

  try {
    await Promise.race([
      waitForServerReady(baseUrl),
      new Promise<never>((_, reject) => {
        serverProcess.once("exit", (code, signal) => {
          reject(new Error(`dev server exited before readiness (code=${code}, signal=${signal})`));
        });
      }),
    ]);
  } catch (error) {
    await stopDevServer(serverProcess);
    await rm(devVarsPath, { force: true });
    await closeWriteStream(stdoutStream);
    await closeWriteStream(stderrStream);
    throw error;
  }

  return {
    tempDir: persistTo,
    baseUrl,
    port,
    cloudflareEnv,
    devVarsPath,
    serverProcess,
    stdoutLogPath,
    stderrLogPath,
    stdoutStream,
    stderrStream,
  };
};

export const stopDevServer = async (serverProcess: ChildProcess): Promise<void> => {
  if (serverProcess.exitCode !== null || serverProcess.signalCode !== null) return;

  const killServer = (signal: NodeJS.Signals): void => {
    if (serverProcess.pid === undefined) return;
    if (process.platform === "win32") {
      serverProcess.kill(signal);
      return;
    }
    process.kill(-serverProcess.pid, signal);
  };

  killServer("SIGTERM");
  const exited = await Promise.race([
    new Promise<boolean>((resolveExit) => {
      serverProcess.once("exit", () => resolveExit(true));
    }),
    sleep(10_000).then(() => false),
  ]);

  if (!exited && serverProcess.exitCode === null && serverProcess.signalCode === null) {
    killServer("SIGKILL");
    await new Promise<void>((resolveExit) => {
      serverProcess.once("exit", () => resolveExit());
    });
  }
};

export const closeContextLogs = async (ctx: E2eContext): Promise<void> => {
  ctx.serverProcess.stdout?.unpipe(ctx.stdoutStream);
  ctx.serverProcess.stderr?.unpipe(ctx.stderrStream);
  await closeWriteStream(ctx.stdoutStream);
  await closeWriteStream(ctx.stderrStream);
};

export const printFailureContext = (ctx: E2eContext): void => {
  console.error(`Preserved temp state: ${ctx.tempDir}`);
  console.error(`Cloudflare env vars: ${ctx.devVarsPath}`);
  console.error(`Dev server stdout: ${ctx.stdoutLogPath}`);
  console.error(`Dev server stderr: ${ctx.stderrLogPath}`);
  console.error(
    `Reopen preserved state: CLOUDFLARE_ENV=${ctx.cloudflareEnv} BLAND_PERSIST_STATE_PATH=${ctx.tempDir} npm run dev -- --host 127.0.0.1 --port ${ctx.port}`,
  );
};

export const printLogTails = async (ctx: E2eContext): Promise<void> => {
  const { readFile } = await import("node:fs/promises");
  for (const [label, filePath] of [
    ["stdout", ctx.stdoutLogPath],
    ["stderr", ctx.stderrLogPath],
  ] as const) {
    try {
      const content = await readFile(filePath, "utf8");
      const tail = content.trim().split("\n").slice(-20).join("\n");
      if (tail.length > 0) {
        console.error(`Last ${label} log lines:\n${tail}`);
      }
    } catch {}
  }
};
