import { describe, expect, it } from "vitest";
import { SESSION_HINT_COOKIE } from "@/shared/auth";
import { getSessionBootstrapStrategy, hasSessionRefreshHint } from "@/client/lib/session-bootstrap";

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

  it("skips bootstrap refresh when there is no local user or session hint", () => {
    expect(getSessionBootstrapStrategy("/", false, "")).toBe("skip");
    expect(getSessionBootstrapStrategy("/login", false, "")).toBe("skip");
    expect(getSessionBootstrapStrategy("/invite/test-token", false, "")).toBe("skip");
    expect(getSessionBootstrapStrategy("/s/share-token", false, "")).toBe("skip");
    expect(getSessionBootstrapStrategy("/shared-with-me", false, "")).toBe("skip");
  });

  it("runs background refresh when a cached user exists", () => {
    expect(getSessionBootstrapStrategy("/", true, "")).toBe("background");
    expect(getSessionBootstrapStrategy("/profile", true, "")).toBe("background");
  });

  it("runs background refresh on public routes when only the session hint exists", () => {
    expect(getSessionBootstrapStrategy("/", false, `${SESSION_HINT_COOKIE}=1`)).toBe("background");
    expect(getSessionBootstrapStrategy("/login", false, `${SESSION_HINT_COOKIE}=1`)).toBe("background");
  });

  it("blocks protected routes when the session hint exists without a cached user", () => {
    expect(getSessionBootstrapStrategy("/shared-with-me", false, `${SESSION_HINT_COOKIE}=1`)).toBe("block");
    expect(getSessionBootstrapStrategy("/profile", false, `${SESSION_HINT_COOKIE}=1`)).toBe("block");
    expect(getSessionBootstrapStrategy("/workspace-slug", false, `${SESSION_HINT_COOKIE}=1`)).toBe("block");
  });
});
