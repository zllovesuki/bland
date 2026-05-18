import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import type { ReactNode } from "react";
import type { PageMentionPresentationKind } from "@/shared/editor/components/page-mention";

export interface SitesPageMentionRenderInfo {
  label: string;
  href?: string | null;
  icon?: ReactNode;
  kind?: PageMentionPresentationKind;
  ariaLabel?: string;
}

export interface RenderBlandSitesDocumentOptions {
  resolvePageMention?: (pageId: string) => SitesPageMentionRenderInfo | null;
  headingAnchorIds?: readonly (string | null)[];
}

export type StaticNodeMappingProps = {
  node: ProseMirrorNode;
  children?: ReactNode;
};
