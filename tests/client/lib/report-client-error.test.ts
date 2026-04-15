import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const initMock = vi.fn();
const captureExceptionMock = vi.fn();
const setTagMock = vi.fn();
const setExtrasMock = vi.fn();
const withScopeMock = vi.fn(
  (callback: (scope: { setTag: typeof setTagMock; setExtras: typeof setExtrasMock }) => void) =>
    callback({
      setTag: setTagMock,
      setExtras: setExtrasMock,
    }),
);

vi.mock("@sentry/react", () => ({
  init: initMock,
  captureException: captureExceptionMock,
  withScope: withScopeMock,
}));

beforeEach(() => {
  vi.resetModules();
  initMock.mockReset();
  captureExceptionMock.mockReset();
  setTagMock.mockReset();
  setExtrasMock.mockReset();
  withScopeMock.mockClear();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

function flushMicrotasks() {
  return Promise.resolve().then(() => Promise.resolve());
}

describe("reportClientError", () => {
  it("queues reports until Sentry finishes loading, then flushes them through Sentry", async () => {
    const { primeClientErrorReporting, reportClientError } = await import("@/client/lib/report-client-error");

    const initPromise = primeClientErrorReporting({
      turnstile_site_key: "turnstile-test-key",
      sentry_dsn: "https://public@example.ingest.sentry.io/1",
    });
    const error = new Error("boom");
    reportClientError({ source: "test.queue", error, context: { pageId: "page-1" } });

    expect(initMock).not.toHaveBeenCalled();
    expect(captureExceptionMock).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalledTimes(1);

    await initPromise;
    await flushMicrotasks();

    expect(initMock).toHaveBeenCalledWith(
      expect.objectContaining({
        dsn: "https://public@example.ingest.sentry.io/1",
        sendDefaultPii: false,
      }),
    );
    expect(withScopeMock).toHaveBeenCalledTimes(1);
    expect(setTagMock).toHaveBeenCalledWith("source", "test.queue");
    expect(setExtrasMock).toHaveBeenCalledWith({ pageId: "page-1" });
    expect(captureExceptionMock).toHaveBeenCalledWith(error);
  });

  it("stays console-only when bootstrap config is missing", async () => {
    const { primeClientErrorReporting, reportClientError } = await import("@/client/lib/report-client-error");

    await primeClientErrorReporting(null);
    const error = new Error("boom without bootstrap");
    reportClientError({ source: "test.retry", error, context: { pageId: "page-2" } });

    expect(initMock).not.toHaveBeenCalled();
    expect(captureExceptionMock).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalledTimes(1);
  });

  it("filters expected API errors out of Sentry while keeping console logging", async () => {
    const { primeClientErrorReporting, reportClientError } = await import("@/client/lib/report-client-error");

    await primeClientErrorReporting({
      turnstile_site_key: "turnstile-test-key",
      sentry_dsn: "https://public@example.ingest.sentry.io/1",
    });

    reportClientError({
      source: "test.expected",
      error: { error: "not_found", message: "missing" },
    });

    expect(console.error).toHaveBeenCalledTimes(1);
    expect(captureExceptionMock).not.toHaveBeenCalled();
  });

  it("stays console-only when the runtime config has no Sentry DSN", async () => {
    const { primeClientErrorReporting, reportClientError } = await import("@/client/lib/report-client-error");

    await primeClientErrorReporting({
      turnstile_site_key: "turnstile-test-key",
      sentry_dsn: null,
    });

    reportClientError({
      source: "test.console-only",
      error: new Error("boom"),
    });

    expect(initMock).not.toHaveBeenCalled();
    expect(captureExceptionMock).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalledTimes(1);
  });
});
