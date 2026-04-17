export const SIDEBAR_TREE_INDENT_PX = 16;
export const SIDEBAR_TREE_ROW_PADDING_PX = 8;

export function getSidebarTreePaddingLeft(depth: number): string {
  return `${depth * SIDEBAR_TREE_INDENT_PX + SIDEBAR_TREE_ROW_PADDING_PX}px`;
}
