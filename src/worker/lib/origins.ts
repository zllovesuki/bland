const ALLOWED_ORIGINS_ERROR = "ALLOWED_ORIGINS must be a comma-separated list of http(s) origins";

function normalizeConfiguredOrigin(rawOrigin: string): string {
  let url: URL;
  try {
    url = new URL(rawOrigin);
  } catch {
    throw new Error(`${ALLOWED_ORIGINS_ERROR}: invalid origin "${rawOrigin}"`);
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`${ALLOWED_ORIGINS_ERROR}: invalid protocol "${url.protocol}" in "${rawOrigin}"`);
  }

  return url.origin;
}

function normalizeRequestOrigin(origin: string): string | null {
  try {
    const url = new URL(origin);
    return url.protocol === "http:" || url.protocol === "https:" ? url.origin : null;
  } catch {
    return null;
  }
}

export function getAllowedOrigins(env: Pick<Env, "ALLOWED_ORIGINS">): string[] {
  const rawValue = env.ALLOWED_ORIGINS?.trim();
  if (!rawValue) {
    throw new Error(`${ALLOWED_ORIGINS_ERROR}: value is missing`);
  }

  const rawOrigins = rawValue
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  if (rawOrigins.length === 0) {
    throw new Error(`${ALLOWED_ORIGINS_ERROR}: value is empty`);
  }

  return [...new Set(rawOrigins.map(normalizeConfiguredOrigin))];
}

export function isAllowedOrigin(origin: string | null | undefined, env: Pick<Env, "ALLOWED_ORIGINS">): boolean {
  if (!origin) return false;

  const normalizedOrigin = normalizeRequestOrigin(origin);
  if (!normalizedOrigin) return false;

  return getAllowedOrigins(env).includes(normalizedOrigin);
}
