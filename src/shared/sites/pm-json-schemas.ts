import { z } from "zod";

export interface PmJsonMark {
  type: string;
  attrs?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface PmJsonContent {
  type?: string;
  attrs?: Record<string, unknown>;
  content?: PmJsonContent[];
  marks?: PmJsonMark[];
  text?: string;
  [key: string]: unknown;
}

const PmJsonAttrsSchema = z.record(z.string(), z.unknown());

export const PmJsonMarkSchema: z.ZodType<PmJsonMark> = z.looseObject({
  type: z.string(),
  attrs: PmJsonAttrsSchema.optional(),
});

export const PmJsonContentSchema: z.ZodType<PmJsonContent> = z.lazy(() =>
  z.looseObject({
    type: z.string().optional(),
    attrs: PmJsonAttrsSchema.optional(),
    content: z.array(PmJsonContentSchema).optional(),
    marks: z.array(PmJsonMarkSchema).optional(),
    text: z.string().optional(),
  }),
);

export const EditorTextMetricsSchema = z.object({
  words: z.number().int().nonnegative(),
  characters: z.number().int().nonnegative(),
});

export const SitePmJsonEnvelopeSchema = z.object({
  content: PmJsonContentSchema,
  metrics: EditorTextMetricsSchema,
  updatedAt: z.string().min(1),
});

export type SitePmJsonEnvelope = z.infer<typeof SitePmJsonEnvelopeSchema>;

export function parseSitePmJsonEnvelope(text: string): SitePmJsonEnvelope | null {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return null;
  }
  const parsed = SitePmJsonEnvelopeSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
