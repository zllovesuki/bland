import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { performBootstrapRefresh, stripOidcMarker } from "@/client/lib/session-bootstrap";

beforeEach(() => {
  window.history.replaceState(null, "", "/");
});

afterEach(() => {
  window.history.replaceState(null, "", "/");
});

describe("stripOidcMarker", () => {
  it("removes the oidc query param while preserving the path", () => {
    window.history.replaceState(null, "", "/workspaces?oidc=1");
    stripOidcMarker();
    expect(window.location.search).toBe("");
    expect(window.location.pathname).toBe("/workspaces");
  });

  it("preserves other query params", () => {
    window.history.replaceState(null, "", "/invite/abc?accept=1&oidc=1");
    stripOidcMarker();
    expect(window.location.search).toBe("?accept=1");
    expect(window.location.pathname).toBe("/invite/abc");
  });

  it("is a no-op when the marker is absent", () => {
    window.history.replaceState(null, "", "/workspaces?accept=1");
    stripOidcMarker();
    expect(window.location.search).toBe("?accept=1");
  });
});

describe("performBootstrapRefresh", () => {
  it("continues without redirect on successful refresh", async () => {
    window.history.replaceState(null, "", "/workspaces?oidc=1");
    const clearAuth = vi.fn();
    const navigate = vi.fn();
    const refreshSession = vi.fn().mockResolvedValue({ ok: true });

    const outcome = await performBootstrapRefresh(true, { refreshSession, clearAuth, navigate });

    expect(outcome).toBe("continue");
    expect(clearAuth).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
    expect(window.location.search).toBe("");
  });

  it("continues when refresh fails outside a post-OIDC return", async () => {
    window.history.replaceState(null, "", "/workspaces");
    const clearAuth = vi.fn();
    const navigate = vi.fn();
    const refreshSession = vi.fn().mockResolvedValue({ ok: false });

    const outcome = await performBootstrapRefresh(false, { refreshSession, clearAuth, navigate });

    expect(outcome).toBe("continue");
    expect(clearAuth).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
  });

  it("fails closed when refresh fails after a post-OIDC return", async () => {
    window.history.replaceState(null, "", "/workspaces?oidc=1");
    const clearAuth = vi.fn();
    const navigate = vi.fn();
    const refreshSession = vi.fn().mockResolvedValue({ ok: false });

    const outcome = await performBootstrapRefresh(true, { refreshSession, clearAuth, navigate });

    expect(outcome).toBe("redirected");
    expect(clearAuth).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith("/login?error=oidc_post_callback_refresh_failed");
    expect(window.location.search).toBe("");
  });
});
