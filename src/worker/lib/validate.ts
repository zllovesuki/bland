import type { Context } from "hono";
import type { z } from "zod";

/**
 * Parse the JSON body against a Zod schema.
 * Returns the parsed data, or a 400 Response if validation fails.
 */
export async function parseBody<T extends z.ZodType>(c: Context, schema: T): Promise<z.infer<T> | Response> {
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    return c.json({ error: "invalid_json", message: "Request body is not valid JSON" }, 400);
  }
  const body = schema.safeParse(raw);
  if (!body.success) {
    return c.json({ error: "validation_error", message: body.error.issues[0].message, issues: body.error.issues }, 400);
  }
  return body.data;
}
