import { describe, expect, it } from "vitest";
import { Hono } from "hono";

import { SESSION_HINT_COOKIE } from "@/shared/auth";
import { REFRESH_COOKIE_MAX_AGE } from "@/worker/lib/constants";
import { REFRESH_COOKIE, clearRefreshCookie, setRefreshCookie } from "@/worker/lib/auth";

describe("auth cookie helpers", () => {
  it("sets refresh and session hint cookies with the expected flags", async () => {
    const app = new Hono();

    app.get("/", (c) => {
      setRefreshCookie(c, "refresh-token");
      return c.text("ok");
    });

    const res = await app.request("http://test/");

    expect(res.headers.getSetCookie()).toEqual([
      `${REFRESH_COOKIE}=refresh-token; Max-Age=${REFRESH_COOKIE_MAX_AGE}; Path=/; HttpOnly; Secure; SameSite=Strict`,
      `${SESSION_HINT_COOKIE}=1; Max-Age=${REFRESH_COOKIE_MAX_AGE}; Path=/; Secure; SameSite=Strict`,
    ]);
  });

  it("clears refresh and session hint cookies with the expected flags", async () => {
    const app = new Hono();

    app.get("/", (c) => {
      clearRefreshCookie(c);
      return c.text("ok");
    });

    const res = await app.request("http://test/");

    expect(res.headers.getSetCookie()).toEqual([
      `${REFRESH_COOKIE}=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Strict`,
      `${SESSION_HINT_COOKIE}=; Max-Age=0; Path=/; Secure; SameSite=Strict`,
    ]);
  });
});
