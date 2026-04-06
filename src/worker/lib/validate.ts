import type { Context } from "hono";
import type { z } from "zod";

/**
 * Parse the JSON body against a Zod schema.
 * Returns the parsed data, or a 400 Response if validation fails.
 */
export async function parseBody<T extends z.ZodType>(c: Context, schema: T): Promise<z.infer<T> | Response> {
  const body = schema.safeParse(await c.req.json());
  if (!body.success) {
    return c.json({ error: "validation_error", message: body.error.issues[0].message, issues: body.error.issues }, 400);
  }
  return body.data;
}
