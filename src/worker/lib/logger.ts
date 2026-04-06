export type LogLevel = "debug" | "info" | "warn" | "error";

type Fields = Record<string, unknown>;

const LEVELS: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

let minLevel: LogLevel = "info";

function parseLevel(input?: string | null): LogLevel {
  const v = (input || "").toLowerCase();
  if (v === "debug" || v === "info" || v === "warn" || v === "error") return v;
  return "info";
}

export function setLevel(input?: string) {
  minLevel = parseLevel(input);
}

export interface Logger {
  debug: (event: string, fields?: Fields) => void;
  info: (event: string, fields?: Fields) => void;
  warn: (event: string, fields?: Fields) => void;
  error: (event: string, fields?: Fields) => void;
  child: (fields: Fields) => Logger;
}

function write(level: LogLevel, component: string, base: Fields, event: string, fields: Fields) {
  if (LEVELS[level] < LEVELS[minLevel]) return;
  const entry = JSON.stringify({ ts: new Date().toISOString(), level, component, event, ...base, ...fields });
  if (level === "error") return console.error(entry);
  if (level === "warn") return console.warn(entry);
  console.log(entry);
}

export function createLogger(component: string, baseFields: Fields = {}): Logger {
  return {
    debug: (event, fields = {}) => write("debug", component, baseFields, event, fields),
    info: (event, fields = {}) => write("info", component, baseFields, event, fields),
    warn: (event, fields = {}) => write("warn", component, baseFields, event, fields),
    error: (event, fields = {}) => write("error", component, baseFields, event, fields),
    child: (fields) => createLogger(component, { ...baseFields, ...fields }),
  };
}

export function errorContext(error: unknown) {
  if (error instanceof Error) {
    return { errorName: error.name, errorMessage: error.message, errorStack: error.stack };
  }
  return { errorMessage: String(error) };
}
