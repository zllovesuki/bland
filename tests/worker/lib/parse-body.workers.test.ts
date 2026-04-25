import { exports } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";

import { resetD1Tables } from "@tests/worker/helpers/db";
import { PROD_ORIGIN } from "@tests/worker/helpers/request";

async function postRaw(body: string, contentType = "application/json"): Promise<Response> {
  const url = new URL("/api/v1/auth/login", PROD_ORIGIN);
  return exports.default.fetch(
    new Request(url.toString(), {
      method: "POST",
      headers: { "content-type": contentType },
      body,
    }),
  );
}

describe("parseBody - malformed JSON", () => {
  beforeEach(async () => {
    await resetD1Tables();
  });

  it("returns 400 invalid_json for a malformed body via a parseBody route", async () => {
    const res = await postRaw("{not-valid-json");
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string; message: string };
    expect(body.error).toBe("invalid_json");
  });

  it("returns 400 invalid_json for a body that is not JSON at all", async () => {
    const res = await postRaw("hello", "text/plain");
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("invalid_json");
  });

  it("returns 400 validation_error for valid JSON that fails schema validation", async () => {
    // `null` is valid JSON; LoginRequest expects an object → Zod path, distinct error code.
    const res = await postRaw("null");
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("validation_error");
  });
});
