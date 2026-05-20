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
const WRANGLER_BIN_PATH = resolve(REPO_ROOT, "node_modules/wrangler/bin/wrangler.js");
const EMOJI_GENERATOR_PATH = resolve(REPO_ROOT, "scripts/generate-emoji-data.ts");
const SERVER_READY_TIMEOUT_MS = 120_000;
const SERVER_START_ATTEMPTS = 5;
const POLL_INTERVAL_MS = 1_000;
const COMMAND_STDIO_MAX_BYTES = 10 * 1024 * 1024;
const COMMAND_TAIL_BYTES = 8_000;
const LOG_TAIL_LINES = 40;
const PROCESS_TERM_TIMEOUT_MS = 10_000;
const PROCESS_KILL_TIMEOUT_MS = 5_000;
const PROCESS_CLOSE_TIMEOUT_MS = 2_000;
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

const COMMAND_TIMEOUTS = {
  emoji: 60_000,
  migrations: 180_000,
  seed: 60_000,
} as const;

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

function formatElapsed(startedAt: number): string {
  return `${((Date.now() - startedAt) / 1000).toFixed(1)}s`;
}

function stringifyOutput(value: unknown): string {
  if (typeof value === "string") return value;
  if (Buffer.isBuffer(value)) return value.toString("utf8");
  return "";
}

function tailText(value: string, maxBytes = COMMAND_TAIL_BYTES): string {
  const trimmed = value.trimEnd();
  if (trimmed.length <= maxBytes) return trimmed;
  return `... truncated ...\n${trimmed.slice(-maxBytes)}`;
}

async function readLogTail(filePath: string, lineCount = LOG_TAIL_LINES): Promise<string> {
  try {
    const content = await readFile(filePath, "utf8");
    return content.trim().split("\n").slice(-lineCount).join("\n");
  } catch {
    return "";
  }
}

async function formatLogTails(stdoutLogPath: string, stderrLogPath: string): Promise<string> {
  const [stdoutTail, stderrTail] = await Promise.all([readLogTail(stdoutLogPath), readLogTail(stderrLogPath)]);
  const sections: string[] = [];
  if (stdoutTail) sections.push(`Last stdout log lines:\n${stdoutTail}`);
  if (stderrTail) sections.push(`Last stderr log lines:\n${stderrTail}`);
  return sections.join("\n\n");
}

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
  label: string,
  command: string,
  args: string[],
  env: NodeJS.ProcessEnv,
  timeoutMs: number,
): Promise<{ stdout: string; stderr: string }> => {
  const startedAt = Date.now();
  console.log(`[e2e] ${label} started`);

  try {
    const result = await execFile(command, args, {
      cwd: REPO_ROOT,
      env,
      killSignal: "SIGTERM",
      maxBuffer: COMMAND_STDIO_MAX_BYTES,
      timeout: timeoutMs,
    });
    console.log(`[e2e] ${label} completed in ${formatElapsed(startedAt)}`);
    return result;
  } catch (error) {
    const commandError = error as Error & {
      code?: number | string | null;
      killed?: boolean;
      signal?: NodeJS.Signals | null;
      stderr?: string | Buffer;
      stdout?: string | Buffer;
      timedOut?: boolean;
    };
    const stdoutTail = tailText(stringifyOutput(commandError.stdout));
    const stderrTail = tailText(stringifyOutput(commandError.stderr));
    const details = [
      `${label} failed after ${formatElapsed(startedAt)}`,
      `command: ${command} ${args.join(" ")}`,
      `code: ${String(commandError.code ?? "unknown")}`,
      `signal: ${String(commandError.signal ?? "none")}`,
      `killed: ${String(commandError.killed ?? false)}`,
      `message: ${commandError.message}`,
      stdoutTail ? `stdout tail:\n${stdoutTail}` : null,
      stderrTail ? `stderr tail:\n${stderrTail}` : null,
    ].filter(Boolean);
    throw new Error(details.join("\n"), { cause: error });
  }
};

const execWrangler = async (
  label: string,
  args: string[],
  persistTo: string,
  timeoutMs: number,
): Promise<{ stdout: string; stderr: string }> =>
  await execCommand(
    label,
    process.execPath,
    [WRANGLER_BIN_PATH, ...args],
    { ...process.env, BLAND_PERSIST_STATE_PATH: persistTo, CI: "1", NO_D1_WARNING: "true" },
    timeoutMs,
  );

export const generateEmojiData = async (): Promise<void> => {
  await execCommand(
    "emoji generation",
    process.execPath,
    ["--import", "tsx", EMOJI_GENERATOR_PATH],
    { ...process.env, CI: "1" },
    COMMAND_TIMEOUTS.emoji,
  );
};

const waitForServerReady = async (
  baseUrl: string,
  logs: { stdoutLogPath: string; stderrLogPath: string },
): Promise<void> => {
  const startedAt = Date.now();
  const deadline = Date.now() + SERVER_READY_TIMEOUT_MS;
  let lastStatus: number | null = null;
  let lastError: string | null = null;

  while (Date.now() < deadline) {
    try {
      const status = await fetch(new URL("/api/v1/health", baseUrl), {
        signal: AbortSignal.timeout(5_000),
      }).then((r) => r.status);
      lastStatus = status;
      lastError = null;
      if (status === 200) {
        console.log(`[e2e] dev server ready in ${formatElapsed(startedAt)}`);
        return;
      }
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await sleep(POLL_INTERVAL_MS);
  }

  const logTails = await formatLogTails(logs.stdoutLogPath, logs.stderrLogPath);
  const details = [
    `dev server readiness timed out after ${formatElapsed(startedAt)}`,
    `health URL: ${new URL("/api/v1/health", baseUrl).toString()}`,
    `last status: ${lastStatus ?? "none"}`,
    `last error: ${lastError ?? "none"}`,
    logTails || null,
  ].filter(Boolean);
  throw new Error(details.join("\n\n"));
};

async function withStartupLogTails(error: unknown, logs: { stdoutLogPath: string; stderrLogPath: string }) {
  const baseMessage = error instanceof Error ? error.message : String(error);
  const logTails = await formatLogTails(logs.stdoutLogPath, logs.stderrLogPath);
  return new Error(logTails ? `${baseMessage}\n\n${logTails}` : baseMessage, { cause: error });
}

async function waitForProcessExit(serverProcess: ChildProcess, timeoutMs: number): Promise<boolean> {
  if (serverProcess.exitCode !== null || serverProcess.signalCode !== null) return true;

  return await new Promise<boolean>((resolveExit) => {
    function onExit() {
      clearTimeout(timer);
      resolveExit(true);
    }

    const timer = setTimeout(() => {
      serverProcess.off("exit", onExit);
      resolveExit(false);
    }, timeoutMs);

    serverProcess.once("exit", onExit);
  });
}

function waitForProcessClose(serverProcess: ChildProcess): Promise<void> {
  return new Promise<void>((resolveClose) => {
    serverProcess.once("close", () => resolveClose());
  });
}

async function waitForProcessCloseWithTimeout(closePromise: Promise<void>, timeoutMs: number): Promise<boolean> {
  return await Promise.race([closePromise.then(() => true), sleep(timeoutMs).then(() => false)]);
}

async function loadDevVarsTemplate(): Promise<string> {
  try {
    return await readFile(DEV_VARS_EXAMPLE_PATH, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }

  throw new Error("Missing .dev.vars.example");
}

async function createE2eDevVarsFile(baseUrl: string): Promise<{ cloudflareEnv: string; devVarsPath: string }> {
  const cloudflareEnv = `e2e-${process.pid}-${Date.now()}`;
  const devVarsPath = `${DEV_VARS_PATH}.${cloudflareEnv}`;
  const template = await loadDevVarsTemplate();
  const allowedOrigins = new URL(baseUrl).origin;
  const stripped = template
    .replace(/^ALLOWED_ORIGINS=.*$/gm, "")
    .replace(/^BLAND_AI_MODE=.*$/gm, "")
    .trimEnd();
  const content = `${stripped}\nALLOWED_ORIGINS=${allowedOrigins}\nBLAND_AI_MODE=mock\n`;

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
  await execWrangler(
    "D1 migrations",
    ["d1", "migrations", "apply", D1_DATABASE, "--local", "--persist-to", persistTo],
    persistTo,
    COMMAND_TIMEOUTS.migrations,
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

  await execWrangler(
    "D1 seed user",
    ["d1", "execute", D1_DATABASE, "--local", "--persist-to", persistTo, "--yes", "--command", sql],
    persistTo,
    COMMAND_TIMEOUTS.seed,
  );
};

function isPortInUseStartupError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("is already in use") || message.includes("EADDRINUSE");
}

export const startDevServer = async (persistTo: string): Promise<E2eContext> => {
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= SERVER_START_ATTEMPTS; attempt += 1) {
    try {
      return await startDevServerOnce(persistTo, attempt);
    } catch (error) {
      lastError = error;
      if (!isPortInUseStartupError(error) || attempt === SERVER_START_ATTEMPTS) {
        throw error;
      }
      console.warn(`[e2e] dev server port was busy on attempt ${attempt}; retrying with a fresh port`);
      await sleep(250);
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
};

const startDevServerOnce = async (persistTo: string, attempt: number): Promise<E2eContext> => {
  const port = await getFreePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const { cloudflareEnv, devVarsPath } = await createE2eDevVarsFile(baseUrl);
  const stdoutLogPath = join(persistTo, "dev.stdout.log");
  const stderrLogPath = join(persistTo, "dev.stderr.log");
  const stdoutStream = createWriteStream(stdoutLogPath, { flags: "a" });
  const stderrStream = createWriteStream(stderrLogPath, { flags: "a" });

  console.log(`[e2e] dev server startup attempt ${attempt}/${SERVER_START_ATTEMPTS} on ${baseUrl}`);

  const serverProcess = spawn(
    process.execPath,
    [VITE_BIN_PATH, "dev", "--host", "127.0.0.1", "--port", String(port), "--strictPort"],
    {
      cwd: REPO_ROOT,
      env: { ...process.env, BLAND_PERSIST_STATE_PATH: persistTo, CLOUDFLARE_ENV: cloudflareEnv },
      stdio: ["ignore", "pipe", "pipe"],
      detached: process.platform !== "win32",
    },
  );

  serverProcess.stdout?.pipe(stdoutStream);
  serverProcess.stderr?.pipe(stderrStream);
  const closePromise = waitForProcessClose(serverProcess);

  let removeExitListener = () => {};
  try {
    const exitedEarly = new Promise<never>((_, reject) => {
      const onExit = (code: number | null, signal: NodeJS.Signals | null) => {
        reject(new Error(`dev server exited before readiness (code=${code}, signal=${signal})`));
      };
      serverProcess.once("exit", onExit);
      removeExitListener = () => serverProcess.off("exit", onExit);
    });

    await Promise.race([waitForServerReady(baseUrl, { stdoutLogPath, stderrLogPath }), exitedEarly]);
    removeExitListener();
  } catch (error) {
    removeExitListener();
    await stopDevServer(serverProcess);
    await waitForProcessCloseWithTimeout(closePromise, PROCESS_CLOSE_TIMEOUT_MS);
    serverProcess.stdout?.unpipe(stdoutStream);
    serverProcess.stderr?.unpipe(stderrStream);
    await closeWriteStream(stdoutStream);
    await closeWriteStream(stderrStream);
    const startupError = await withStartupLogTails(error, { stdoutLogPath, stderrLogPath });
    await rm(devVarsPath, { force: true });
    throw startupError;
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

  const killServer = (signal: NodeJS.Signals): boolean => {
    if (serverProcess.pid === undefined) return false;
    try {
      if (process.platform === "win32") {
        return serverProcess.kill(signal);
      }
      process.kill(-serverProcess.pid, signal);
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ESRCH") return false;
      throw error;
    }
  };

  const termWait = waitForProcessExit(serverProcess, PROCESS_TERM_TIMEOUT_MS);
  const termSent = killServer("SIGTERM");
  if (!termSent || (await termWait)) return;

  if (serverProcess.exitCode === null && serverProcess.signalCode === null) {
    const killWait = waitForProcessExit(serverProcess, PROCESS_KILL_TIMEOUT_MS);
    const killSent = killServer("SIGKILL");
    if (killSent && !(await killWait)) {
      console.error(`[e2e] dev server did not exit after SIGKILL within ${PROCESS_KILL_TIMEOUT_MS}ms`);
    }
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
    `Reopen preserved state: CLOUDFLARE_ENV=${ctx.cloudflareEnv} BLAND_PERSIST_STATE_PATH=${ctx.tempDir} node ${VITE_BIN_PATH} dev --host 127.0.0.1 --port ${ctx.port} --strictPort`,
  );
};

export const printLogTails = async (ctx: E2eContext): Promise<void> => {
  for (const [label, filePath] of [
    ["stdout", ctx.stdoutLogPath],
    ["stderr", ctx.stderrLogPath],
  ] as const) {
    const tail = await readLogTail(filePath);
    if (tail.length > 0) {
      console.error(`Last ${label} log lines:\n${tail}`);
    }
  }
};
