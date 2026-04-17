import { describe, expect, it } from "vitest";
import { createRequestGuard } from "@/client/lib/request-guard";

describe("createRequestGuard", () => {
  it("treats the newest request as current", () => {
    const epochRef = { current: 0 };
    const activeRef = { current: true };

    const request = createRequestGuard(epochRef, activeRef);

    expect(request.isCurrent()).toBe(true);
  });

  it("invalidates older requests after navigation starts a newer request", () => {
    const epochRef = { current: 0 };
    const activeRef = { current: true };

    const first = createRequestGuard(epochRef, activeRef);
    const second = createRequestGuard(epochRef, activeRef);

    expect(first.isCurrent()).toBe(false);
    expect(second.isCurrent()).toBe(true);
  });

  it("invalidates requests on cleanup", () => {
    const epochRef = { current: 0 };
    const activeRef = { current: true };

    const request = createRequestGuard(epochRef, activeRef);
    request.cancel();

    expect(request.isCurrent()).toBe(false);
  });

  it("invalidates requests after the caller becomes inactive", () => {
    const epochRef = { current: 0 };
    const activeRef = { current: true };

    const request = createRequestGuard(epochRef, activeRef);
    activeRef.current = false;

    expect(request.isCurrent()).toBe(false);
  });
});
