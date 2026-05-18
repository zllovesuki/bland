import type { JSONContent } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { renderToReactElement } from "@tiptap/static-renderer/pm/react";
import type { ReactNode } from "react";
import { createHeadlessEditorExtensions } from "@/shared/editor/schema";
import { createBlandSitesStaticNodeMappings } from "./node-mappings";
import type { RenderBlandSitesDocumentOptions } from "./types";

export function renderBlandSitesDocumentToReactElement(
  content: ProseMirrorNode | JSONContent,
  options: RenderBlandSitesDocumentOptions = {},
): ReactNode {
  return renderToReactElement({
    content,
    extensions: createHeadlessEditorExtensions(),
    options: {
      nodeMapping: createBlandSitesStaticNodeMappings(options),
    },
  });
}

export type { RenderBlandSitesDocumentOptions, SitesPageMentionRenderInfo } from "./types";
