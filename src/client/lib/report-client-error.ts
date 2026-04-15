import type { PublicClientConfig } from "@/shared/types";

type ClientErrorContext = Record<string, boolean | number | string | null | undefined>;

interface ClientErrorReport {
  source: string;
  error: unknown;
  context?: ClientErrorContext;
}

type NormalizedClientErrorReport = {
  source: string;
  error: Error;
  context: ClientErrorContext;
};

type SentryModule = typeof import("@sentry/react");

const EXPECTED_API_ERRORS = new Set(["validation_error", "unauthorized", "forbidden", "not_found", "turnstile_failed"]);
const MAX_PENDING_REPORTS = 50;

let pendingReports: NormalizedClientErrorReport[] = [];
let reporterState: "pending" | "initializing" | "enabled" | "disabled" = "pending";
let reporterInitPromise: Promise<void> | null = null;
let sentryModule: SentryModule | null = null;

function getApiErrorCode(error: unknown): string | null {
  if (!error || typeof error !== "object" || !("error" in error)) {
    return null;
  }

  return typeof error.error === "string" ? error.error : null;
}

function shouldCaptureError(error: unknown): boolean {
  const apiErrorCode = getApiErrorCode(error);
  return apiErrorCode === null || !EXPECTED_API_ERRORS.has(apiErrorCode);
}

function normalizeError(error: unknown): Error {
  if (error instanceof Error) {
    return error;
  }

  if (typeof error === "string") {
    return new Error(error);
  }

  const apiErrorCode = getApiErrorCode(error);
  const message =
    error && typeof error === "object" && "message" in error && typeof error.message === "string"
      ? error.message
      : (() => {
          try {
            return JSON.stringify(error);
          } catch {
            return null;
          }
        })();

  const normalized = new Error(message || "Unknown client error");
  if (apiErrorCode) {
    normalized.name = apiErrorCode;
  }
  return normalized;
}

function normalizeReport({ source, error, context }: ClientErrorReport): NormalizedClientErrorReport {
  return {
    source,
    error: normalizeError(error),
    context: {
      ...context,
      ...(getApiErrorCode(error) ? { api_error: getApiErrorCode(error) } : {}),
    },
  };
}

function enqueuePendingReport(report: NormalizedClientErrorReport) {
  pendingReports.push(report);
  if (pendingReports.length > MAX_PENDING_REPORTS) {
    pendingReports.shift();
  }
}

function captureReport(report: NormalizedClientErrorReport) {
  if (!sentryModule) {
    return;
  }

  sentryModule.withScope((scope) => {
    scope.setTag("source", report.source);
    const extras = Object.fromEntries(Object.entries(report.context).filter(([, value]) => value !== undefined));
    if (Object.keys(extras).length > 0) {
      scope.setExtras(extras);
    }
    sentryModule?.captureException(report.error);
  });
}

function flushPendingReports() {
  if (!sentryModule || reporterState !== "enabled" || pendingReports.length === 0) {
    return;
  }

  const reports = pendingReports;
  pendingReports = [];

  for (const report of reports) {
    captureReport(report);
  }
}

export function primeClientErrorReporting(config: PublicClientConfig | null) {
  if (reporterState === "enabled" || reporterState === "disabled") {
    return Promise.resolve();
  }

  if (reporterInitPromise) {
    return reporterInitPromise;
  }

  const sentryDsn = config?.sentry_dsn ?? null;
  if (!sentryDsn) {
    reporterState = "disabled";
    pendingReports = [];
    return Promise.resolve();
  }

  reporterState = "initializing";
  reporterInitPromise = import("@sentry/react")
    .then((nextSentryModule) => {
      nextSentryModule.init({ dsn: sentryDsn, sendDefaultPii: false });
      sentryModule = nextSentryModule;
      reporterState = "enabled";
      flushPendingReports();
    })
    .catch(() => {
      reporterState = "disabled";
      pendingReports = [];
    })
    .finally(() => {
      reporterInitPromise = null;
    });

  return reporterInitPromise;
}

export function reportClientError({ source, error, context }: ClientErrorReport) {
  console.error(`[client:${source}]`, error, context ?? {});

  if (!shouldCaptureError(error)) {
    return;
  }

  const normalized = normalizeReport({ source, error, context });

  if (reporterState === "enabled" && sentryModule) {
    captureReport(normalized);
    return;
  }

  if (reporterState === "disabled") {
    return;
  }

  enqueuePendingReport(normalized);
}
