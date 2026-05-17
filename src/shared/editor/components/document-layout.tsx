import type { ReactNode, Ref } from "react";

export const PAGE_SHELL_CLASS = "relative animate-fade-in px-4 py-10 sm:px-8";
export const PAGE_STAGE_CLASS = "mx-auto w-full max-w-[72rem]";
export const PAGE_STAGE_TRACKS_CLASS =
  "min-[1440px]:grid min-[1440px]:grid-cols-[minmax(0,48rem)_12rem] min-[1440px]:justify-center min-[1440px]:gap-x-8";
export const PAGE_STAGE_WITH_TRACKS_CLASS = `${PAGE_STAGE_CLASS} ${PAGE_STAGE_TRACKS_CLASS}`;
export const PAGE_BALANCED_STAGE_CLASS = "mx-auto w-full max-w-[76rem]";
export const PAGE_BALANCED_STAGE_TRACKS_CLASS =
  "min-[1280px]:grid min-[1280px]:grid-cols-[12rem_minmax(0,48rem)_12rem] min-[1280px]:justify-center min-[1280px]:gap-x-8";
export const PAGE_BALANCED_STAGE_WITH_TRACKS_CLASS = `${PAGE_BALANCED_STAGE_CLASS} ${PAGE_BALANCED_STAGE_TRACKS_CLASS}`;
export const PAGE_CONTENT_COLUMN_CLASS = "mx-auto min-w-0 max-w-3xl";
export const PAGE_ICON_ROW_CLASS = "mb-4 flex min-h-9 items-center gap-3 pl-7";
export const DOC_PAGE_MAIN_CLASS = "min-w-0";
export const DOC_PAGE_INLINE_OUTLINE_CLASS = "mx-auto mt-8 w-full min-w-0 max-w-3xl min-[1440px]:hidden";
export const DOC_PAGE_BALANCED_INLINE_OUTLINE_CLASS = "mx-auto mt-8 w-full min-w-0 max-w-3xl min-[1280px]:hidden";
export const DOC_PAGE_BALANCED_INLINE_OUTLINE_BEFORE_CLASS =
  "mx-auto mb-8 w-full min-w-0 max-w-3xl min-[1280px]:hidden";
export const DOC_PAGE_RAIL_CLASS = "hidden min-w-0 min-[1440px]:block min-[1440px]:pt-[5.5rem]";
export const DOC_PAGE_BALANCED_RAIL_CLASS =
  "hidden min-w-0 min-[1280px]:col-start-3 min-[1280px]:block min-[1280px]:pt-[5.5rem]";
export const DOC_PAGE_RAIL_INNER_CLASS = "min-[1440px]:sticky min-[1440px]:top-8";
export const DOC_PAGE_BALANCED_RAIL_INNER_CLASS = "min-[1280px]:sticky min-[1280px]:top-8";

// Must mirror the literal `min-[1440px]:` used in the rail class strings above.
// JS gating that depends on the rail layout being realized should read this constant.
export const OUTLINE_RAIL_MEDIA_QUERY = "(min-width: 1440px)";

export type DocumentOutlineMode = "rail" | "inline";

interface DocumentFrameProps {
  main: ReactNode;
  rail?: ReactNode;
  inlineOutline?: ReactNode;
  railBalance?: "none" | "content";
  railLabel?: string;
  railRef?: Ref<HTMLDivElement>;
}

export function DocumentFrame({
  main,
  rail,
  inlineOutline,
  railBalance = "none",
  railLabel = "Document outline",
  railRef,
}: DocumentFrameProps) {
  const hasRail = rail !== null && rail !== undefined;
  const balanceContent = hasRail && railBalance === "content";
  const stageClass = hasRail
    ? balanceContent
      ? PAGE_BALANCED_STAGE_WITH_TRACKS_CLASS
      : PAGE_STAGE_WITH_TRACKS_CLASS
    : PAGE_STAGE_CLASS;
  const mainClass = balanceContent ? `${DOC_PAGE_MAIN_CLASS} min-[1280px]:col-start-2` : DOC_PAGE_MAIN_CLASS;
  const inlineClass = balanceContent ? DOC_PAGE_BALANCED_INLINE_OUTLINE_CLASS : DOC_PAGE_INLINE_OUTLINE_CLASS;
  const railClass = balanceContent ? DOC_PAGE_BALANCED_RAIL_CLASS : DOC_PAGE_RAIL_CLASS;
  const railInnerClass = balanceContent ? DOC_PAGE_BALANCED_RAIL_INNER_CLASS : DOC_PAGE_RAIL_INNER_CLASS;

  return (
    <div className={stageClass}>
      <div className={mainClass}>
        {main}
        {inlineOutline !== null && inlineOutline !== undefined ? (
          <div className={inlineClass}>{inlineOutline}</div>
        ) : null}
      </div>
      {hasRail ? (
        <aside className={railClass} aria-label={railLabel}>
          <div ref={railRef} className={railInnerClass}>
            {rail}
          </div>
        </aside>
      ) : null}
    </div>
  );
}
