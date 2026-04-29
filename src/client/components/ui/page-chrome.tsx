import type { ReactNode } from "react";
import { EmojiIcon } from "@/client/components/ui/emoji-icon";
import { PAGE_CONTENT_COLUMN_CLASS, PAGE_ICON_ROW_CLASS } from "@/client/components/ui/page-layout";

/**
 * Page chrome shared by the workspace surface, share surface, and loading
 * skeleton. Owns the layout (cover wrapper -> breadcrumb row -> icon row) and
 * exposes named slots for surface-specific content. Consumers cannot reorder
 * or restyle the rows -- that's the point of the primitive.
 */
export interface PageChromeProps {
  /** PageCover element. Primitive supplies the gutter wrapper, group/cover, and relative positioning. */
  cover?: ReactNode;
  /** Optional overlay positioned absolute right-2 top-2 inside the cover wrapper (workspace CoverPicker). */
  coverOverlay?: ReactNode;
  /** PageBreadcrumbs (any mode) or breadcrumb skeleton. The row is omitted entirely when this is null/undefined (e.g., share root page); otherwise reserves min-h-8 even when content is shorter than the right-side actions. */
  breadcrumb?: ReactNode;
  /** Right-aligned actions on the breadcrumb row. Workspace passes Summarize/Share/AvatarStack/SyncStatusDot. */
  breadcrumbActions?: ReactNode;
  /** Icon row content: IconPicker (+ optional CoverPicker), <PageEmojiIcon>, or icon-shaped skeleton. */
  icon?: ReactNode;
}

export function PageChrome({ cover, coverOverlay, breadcrumb, breadcrumbActions, icon }: PageChromeProps) {
  return (
    <div className={PAGE_CONTENT_COLUMN_CLASS}>
      {cover ? (
        <div className="group/cover relative -mx-4 -mt-10 mb-6 sm:-mx-8 lg:mx-0">
          {cover}
          {coverOverlay ? <div className="absolute right-2 top-2">{coverOverlay}</div> : null}
        </div>
      ) : null}

      {breadcrumb ? (
        <div className="mb-6 flex min-h-8 items-center gap-3">
          <div className="min-w-0 flex-1">{breadcrumb}</div>
          {breadcrumbActions ? <div className="flex shrink-0 items-center gap-3">{breadcrumbActions}</div> : null}
        </div>
      ) : null}

      {icon ? <div className={PAGE_ICON_ROW_CLASS}>{icon}</div> : null}
    </div>
  );
}

/**
 * Read-only counterpart to IconPicker's interactive button. The `px-2 py-1`
 * inset matches IconPicker's button (icon-picker.tsx:34, 57) so the painted
 * emoji lands at the same horizontal position whether the icon is editable
 * or not. If IconPicker's button padding changes, update here in lockstep.
 */
export function PageEmojiIcon({ emoji }: { emoji: string }) {
  return (
    <div className="flex items-center px-2 py-1">
      <EmojiIcon emoji={emoji} size={28} />
    </div>
  );
}
