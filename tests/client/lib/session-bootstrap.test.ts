import { describe, expect, it } from "vitest";
import { SESSION_HINT_COOKIE } from "@/shared/auth";
import { hasSessionRefreshHint, shouldBootstrapSession } from "@/client/lib/session-bootstrap";

describe("session bootstrap", () => {
  it("detects the session hint cookie", () => {
    expect(hasSessionRefreshHint(`${SESSION_HINT_COOKIE}=1`)).toBe(true);
    expect(hasSessionRefreshHint(`foo=bar; ${SESSION_HINT_COOKIE}=1`)).toBe(true);
  });

  it("ignores missing or falsey session hint cookies", () => {
    expect(hasSessionRefreshHint("")).toBe(false);
    expect(hasSessionRefreshHint("foo=bar")).toBe(false);
    expect(hasSessionRefreshHint(`${SESSION_HINT_COOKIE}=0`)).toBe(false);
  });

  it("skips bootstrap refresh on public routes without auth hints", () => {
    expect(shouldBootstrapSession("/", false, "")).toBe(false);
    expect(shouldBootstrapSession("/login", false, "")).toBe(false);
    expect(shouldBootstrapSession("/invite/test-token", false, "")).toBe(false);
    expect(shouldBootstrapSession("/s/share-token", false, "")).toBe(false);
  });

  it("refreshes on public routes when local auth state or a session hint exists", () => {
    expect(shouldBootstrapSession("/", true, "")).toBe(true);
    expect(shouldBootstrapSession("/", false, `${SESSION_HINT_COOKIE}=1`)).toBe(true);
  });

  it("refreshes on non-public routes even without local hints", () => {
    expect(shouldBootstrapSession("/shared-with-me", false, "")).toBe(true);
    expect(shouldBootstrapSession("/profile", false, "")).toBe(true);
    expect(shouldBootstrapSession("/workspace-slug", false, "")).toBe(true);
  });
});
