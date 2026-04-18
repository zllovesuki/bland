export const SIDEBAR_TREE_INDENT_PX = 12;
export const SIDEBAR_TREE_ROW_PADDING_PX = 8;
export const SIDEBAR_TREE_DISCLOSURE_PX = 16;
export const SIDEBAR_TREE_GUTTER_PX = 12;

export function getSidebarTreeStandalonePaddingLeft(depth: number): string {
  return `${depth * SIDEBAR_TREE_INDENT_PX + SIDEBAR_TREE_ROW_PADDING_PX}px`;
}

export function getSidebarTreeContentPaddingLeft(depth: number): string {
  return `${depth * SIDEBAR_TREE_INDENT_PX + SIDEBAR_TREE_ROW_PADDING_PX + SIDEBAR_TREE_GUTTER_PX}px`;
}

export function getSidebarTreeChevronLeft(depth: number): string {
  return `${depth * SIDEBAR_TREE_INDENT_PX + SIDEBAR_TREE_ROW_PADDING_PX + SIDEBAR_TREE_GUTTER_PX - SIDEBAR_TREE_DISCLOSURE_PX}px`;
}
