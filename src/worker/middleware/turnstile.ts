import { z } from "zod";
import { isLocalRequestUrl } from "@/worker/http";

export type TurnstileResult = { ok: true } | { ok: false; message: string; status: 400 | 403 | 502 };

const turnstileResponseSchema = z.object({
  success: z.boolean(),
  "error-codes": z.array(z.string()).optional(),
  action: z.string().optional(),
});

export async function verifyTurnstileToken(
  env: Env,
  options: {
    token: string;
    expectedAction: string;
    remoteIp?: string | null;
    requestUrl: string;
  },
): Promise<TurnstileResult> {
  // Bypass verification in local development
  if (isLocalRequestUrl(options.requestUrl)) {
    return { ok: true };
  }

  if (!options.token) {
    return { ok: false, message: "Missing Turnstile token", status: 400 };
  }

  const formData = new URLSearchParams();
  formData.set("secret", env.TURNSTILE_SECRET);
  formData.set("response", options.token);
  if (options.remoteIp) {
    formData.set("remoteip", options.remoteIp);
  }

  const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: formData.toString(),
  });

  if (!response.ok) {
    return {
      ok: false,
      message: "Turnstile verification service unavailable",
      status: 502,
    };
  }

  const data = turnstileResponseSchema.parse(await response.json());

  if (!data.success) {
    return {
      ok: false,
      message: `Turnstile verification failed: ${(data["error-codes"] ?? []).join(", ") || "unknown error"}`,
      status: 403,
    };
  }

  // Verify the action matches if the response includes one
  if (data.action && data.action !== options.expectedAction) {
    return {
      ok: false,
      message: "Turnstile action mismatch",
      status: 403,
    };
  }

  return { ok: true };
}
