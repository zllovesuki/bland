import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import type { ReactNode } from "react";

export type StaticNodeMappingProps = {
  node: ProseMirrorNode;
  children?: ReactNode;
};
