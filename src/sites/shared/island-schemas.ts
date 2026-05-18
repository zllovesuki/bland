import { z } from "zod/mini";

const OutlineLevelSchema = z.union([
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
  z.literal(5),
  z.literal(6),
]);

export const OutlineItemSchema = z.object({
  id: z.string(),
  text: z.string(),
  level: OutlineLevelSchema,
  href: z.optional(z.string()),
});

export const SitesImagePropsSchema = z.object({
  bid: z.optional(z.nullable(z.string())),
  src: z.string().check(z.minLength(1)),
  alt: z.optional(z.nullable(z.string())),
  title: z.optional(z.nullable(z.string())),
  align: z._default(z.enum(["left", "center", "right"]), "left"),
  width: z.optional(z.nullable(z.number().check(z.positive()))),
  naturalWidth: z.optional(z.nullable(z.number().check(z.positive()))),
  naturalHeight: z.optional(z.nullable(z.number().check(z.positive()))),
});

export type SitesImageProps = z.infer<typeof SitesImagePropsSchema>;

export const CopyCodeButtonPropsSchema = z.strictObject({});

export type CopyCodeButtonProps = z.infer<typeof CopyCodeButtonPropsSchema>;

export const SiteOutlineControllerPropsSchema = z.object({
  items: z.array(OutlineItemSchema),
});

export type SiteOutlineControllerProps = z.infer<typeof SiteOutlineControllerPropsSchema>;

export const ISLAND_PROP_SCHEMAS = {
  "sites-image": SitesImagePropsSchema,
  "copy-code": CopyCodeButtonPropsSchema,
  "site-outline-controller": SiteOutlineControllerPropsSchema,
} as const;

export type IslandName = keyof typeof ISLAND_PROP_SCHEMAS;
export type IslandPropsByName = {
  [K in IslandName]: z.infer<(typeof ISLAND_PROP_SCHEMAS)[K]>;
};

type SafeParseSchema<T> = {
  safeParse(value: unknown): { success: true; data: T } | { success: false };
};

function parseWithSchema<T>(schema: SafeParseSchema<T>, value: unknown): T | null {
  const parsed = schema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function readIslandProps(name: "sites-image", text: string): SitesImageProps | null;
export function readIslandProps(name: "copy-code", text: string): CopyCodeButtonProps | null;
export function readIslandProps(name: "site-outline-controller", text: string): SiteOutlineControllerProps | null;
export function readIslandProps(name: IslandName, text: string): IslandPropsByName[IslandName] | null {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return null;
  }

  switch (name) {
    case "sites-image":
      return parseWithSchema(SitesImagePropsSchema, value);
    case "copy-code":
      return parseWithSchema(CopyCodeButtonPropsSchema, value);
    case "site-outline-controller":
      return parseWithSchema(SiteOutlineControllerPropsSchema, value);
  }
}
