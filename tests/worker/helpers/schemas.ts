import { z } from "zod";

export const ApiErrorResponse = z.object({ error: z.string(), message: z.string() });
