import { toApiError } from "@/client/lib/api";

/**
 * Normalized failure kind for workspace/share/page/reporting flows.
 *
 * Classification uses only structured error codes from the worker's JSON
 * response (`toApiError(err).error`) plus the `online` flag. No
 * `message.includes(...)`, no status code parsing from message strings.
 *
 * - `"auth-ambiguous"` — `error: "unauthorized"` survived the client
 *   auto-refresh cycle. Could be a true expired session, a localhost-only
 *   Miniflare 401→403 artifact, or a transient server issue. Callers that
 *   need definitive auth revocation must use the session store's state
 *   transitions (`markExpired`, `setSessionMode`), not this classifier.
 * - `"forbidden"` — definitive access denial; not the 401 masquerade.
 * - `"not-found"` — definitive not-found.
 * - `"network"` — offline, transport failure, or fetch-level error.
 * - `"server"` — `internal_error` or other server-side failure.
 * - `"unknown"` — unclassifiable; ambiguity preserved.
 */
export type FailureKind = "auth-ambiguous" | "forbidden" | "not-found" | "network" | "server" | "unknown";

export function classifyFailure(err: unknown, context: { online: boolean }): FailureKind {
  if (!context.online) return "network";

  const apiErr = toApiError(err);

  switch (apiErr.error) {
    case "unauthorized":
      return "auth-ambiguous";
    case "forbidden":
      return "forbidden";
    case "not_found":
      return "not-found";
    case "internal_error":
      return "server";
    case "request_failed":
      return "network";
  }

  if (err instanceof TypeError) return "network";

  return "unknown";
}
