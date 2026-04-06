import { execFile as execFileCallback } from "node:child_process";
import { createInterface } from "node:readline";
import { promisify } from "node:util";
import { randomBytes as nodeRandomBytes } from "node:crypto";
import { argon2id } from "@noble/hashes/argon2.js";
import { randomBytes } from "@noble/hashes/utils.js";

const execFile = promisify(execFileCallback);

const WORKSPACE_NAME = "bland";
const WORKSPACE_SLUG = "bland";
const DATABASE = "bland-prod";
const ARGON2_PARAMS = { t: 2, m: 19456, p: 1, dkLen: 32 } as const;

function base64Encode(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, ".").replace(/\//g, "/").replace(/=+$/, "");
}

function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = argon2id(password, salt, ARGON2_PARAMS);
  const saltB64 = base64Encode(salt);
  const hashB64 = base64Encode(hash);
  return `$argon2id$v=19$m=${ARGON2_PARAMS.m},t=${ARGON2_PARAMS.t},p=${ARGON2_PARAMS.p}$${saltB64}$${hashB64}`;
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
  const random = nodeRandomBytes(10);
  for (let i = 0; i < 10; i++) {
    result += encodingChars[random[i] % 32];
  }
  return result;
}

function escapeSql(value: string): string {
  return value.replace(/'/g, "''");
}

async function promptPassword(): Promise<string> {
  process.stderr.write("Password: ");
  process.stdin.setRawMode?.(true);
  process.stdin.resume();
  process.stdin.setEncoding("utf8");

  return new Promise((resolve) => {
    let input = "";
    const onData = (ch: string) => {
      if (ch === "\n" || ch === "\r" || ch === "\u0004") {
        process.stdin.setRawMode?.(false);
        process.stdin.pause();
        process.stdin.removeListener("data", onData);
        process.stderr.write("\n");
        resolve(input);
      } else if (ch === "\u007f" || ch === "\b") {
        input = input.slice(0, -1);
      } else if (ch === "\u0003") {
        process.exit(1);
      } else {
        input += ch;
      }
    };
    process.stdin.on("data", onData);
  });
}

function parseArgs(argv: string[]) {
  let mode: "--local" | "--remote" = "--local";
  let email: string | null = null;
  let name: string | null = null;
  let password: string | null = null;

  for (let i = 0; i < argv.length; i++) {
    switch (argv[i]) {
      case "--local":
        mode = "--local";
        break;
      case "--remote":
        mode = "--remote";
        break;
      case "--email":
        email = argv[++i];
        break;
      case "--name":
        name = argv[++i];
        break;
      case "--password":
        password = argv[++i];
        break;
    }
  }

  return { mode, email, name, password };
}

async function main() {
  const { mode, email, name, password: passwordArg } = parseArgs(process.argv.slice(2));

  if (!email || !name) {
    console.error("Usage: npm run db:seed-initial-user -- --local --email <email> --name <name> [--password <pw>]");
    process.exit(1);
  }

  // Preflight: refuse if users already exist
  try {
    const { stdout } = await execFile(
      "npx",
      [
        "wrangler",
        "d1",
        "execute",
        DATABASE,
        mode,
        "--yes",
        "--json",
        "--command",
        "SELECT COUNT(*) AS count FROM users",
      ],
      { cwd: process.cwd() },
    );
    const results = JSON.parse(stdout);
    const count = results?.[0]?.results?.[0]?.count ?? 0;
    if (count > 0) {
      console.error(`Refusing to seed: ${count} user(s) already exist.`);
      process.exit(1);
    }
  } catch (err: any) {
    console.error("Preflight check failed:", err.stderr || err.message);
    process.exit(1);
  }

  const password = passwordArg || (await promptPassword());
  if (!password || password.length < 8) {
    console.error("Password must be at least 8 characters.");
    process.exit(1);
  }

  const userId = generateUlid();
  const workspaceId = generateUlid();
  const now = new Date().toISOString();
  const passwordHash = hashPassword(password);

  const sql = [
    `INSERT INTO users (id, email, password_hash, name, created_at, updated_at) VALUES ('${escapeSql(userId)}', '${escapeSql(email.toLowerCase())}', '${escapeSql(passwordHash)}', '${escapeSql(name)}', '${escapeSql(now)}', '${escapeSql(now)}');`,
    `INSERT INTO workspaces (id, name, slug, owner_id, created_at) VALUES ('${escapeSql(workspaceId)}', '${escapeSql(WORKSPACE_NAME)}', '${escapeSql(WORKSPACE_SLUG)}', '${escapeSql(userId)}', '${escapeSql(now)}');`,
    `INSERT INTO memberships (user_id, workspace_id, role, joined_at) VALUES ('${escapeSql(userId)}', '${escapeSql(workspaceId)}', 'owner', '${escapeSql(now)}');`,
  ].join("\n");

  console.log(`Seeding ${mode === "--local" ? "local" : "remote"} database...`);

  try {
    const { stdout, stderr } = await execFile(
      "npx",
      ["wrangler", "d1", "execute", DATABASE, mode, "--yes", "--command", sql],
      { cwd: process.cwd() },
    );
    if (stdout.trim()) console.log(stdout.trim());
    if (stderr.trim()) console.error(stderr.trim());
  } catch (err: any) {
    console.error("Failed to seed:", err.stderr || err.message);
    process.exit(1);
  }

  console.log("\nSeed complete!");
  console.log(`  Email:     ${email.toLowerCase()}`);
  console.log(`  Name:      ${name}`);
  console.log(`  Workspace: ${WORKSPACE_SLUG}`);
  console.log(`\nLog in at http://localhost:5173/login and invite others.`);
}

main();
