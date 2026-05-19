import type { ReactNode } from "react";
import type { IslandName, IslandPropsByName } from "@/shared/sites/island-schemas";

export interface SiteIslandHostProps<K extends IslandName> {
  name: K;
  props: IslandPropsByName[K];
  children: ReactNode;
}

export function SiteIslandHost<K extends IslandName>({ name, props, children }: SiteIslandHostProps<K>) {
  return (
    <div data-island={name}>
      <template data-island-props="" dangerouslySetInnerHTML={{ __html: serializeProps(props) }} />
      <div data-island-root="">{children}</div>
    </div>
  );
}

const ESCAPE_PATTERN = /[&<>\u2028\u2029]/g;
const ESCAPES: Record<string, string> = {
  "&": "\\u0026",
  "<": "\\u003c",
  ">": "\\u003e",
  "\u2028": "\\u2028",
  "\u2029": "\\u2029",
};

export function serializeProps(value: unknown): string {
  return JSON.stringify(value).replace(ESCAPE_PATTERN, (char) => ESCAPES[char] ?? char);
}
