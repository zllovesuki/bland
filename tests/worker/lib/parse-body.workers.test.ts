import { exports } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";

import { bearerFor } from "@tests/worker/helpers/auth";
import { resetD1Tables } from "@tests/worker/helpers/db";
import { PROD_ORIGIN } from "@tests/worker/helpers/request";
import { seedUser, seedWorkspace } from "@tests/worker/helpers/seeds";

async function postWithAuth(body: string, userId: string, contentType = "application/json"): Promise<Response> {
  const url = new URL("/api/v1/workspaces", PROD_ORIGIN);
  const headers = new Headers({
    "content-type": contentType,
    authorization: await bearerFor(userId),
  });
  return exports.default.fetch(
    new Request(url.toString(), {
      method: "POST",
      headers,
      body,
    }),
  );
}

describe("parseBody - malformed JSON", () => {
  let userId: string;

  beforeEach(async () => {
    await resetD1Tables();
    const user = await seedUser();
    await seedWorkspace({ owner_id: user.id });
    userId = user.id;
  });

  it("returns 400 invalid_json for a malformed body via a parseBody route", async () => {
    const res = await postWithAuth("{not-valid-json", userId);
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string; message: string };
    expect(body.error).toBe("invalid_json");
  });

  it("returns 400 invalid_json for a body that is not JSON at all", async () => {
    const res = await postWithAuth("hello", userId, "text/plain");
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("invalid_json");
  });

  it("returns 400 validation_error for valid JSON that fails schema validation", async () => {
    // `null` is valid JSON; CreateWorkspaceRequest expects an object → Zod path, distinct error code.
    const res = await postWithAuth("null", userId);
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("validation_error");
  });
});
