export const PAGE_SHELL_CLASS = "relative animate-fade-in px-4 py-10 sm:px-8";
export const PAGE_STAGE_CLASS = "mx-auto w-full max-w-[72rem]";
export const PAGE_STAGE_TRACKS_CLASS =
  "min-[1440px]:grid min-[1440px]:grid-cols-[minmax(0,48rem)_12rem] min-[1440px]:justify-center min-[1440px]:gap-x-8";
export const PAGE_STAGE_WITH_TRACKS_CLASS = `${PAGE_STAGE_CLASS} ${PAGE_STAGE_TRACKS_CLASS}`;
export const PAGE_CONTENT_COLUMN_CLASS = "mx-auto min-w-0 max-w-3xl";
export const CANVAS_PAGE_BODY_CENTERED_CLASS = "mx-auto mt-4 max-w-3xl xl:max-w-[60rem]";
export const CANVAS_PAGE_BODY_STAGE_CLASS = "mt-4 w-full";
export const DOC_PAGE_MAIN_CLASS = "min-w-0";
export const DOC_PAGE_RAIL_CLASS = "mt-8 w-full min-w-0 min-[1440px]:mt-0 min-[1440px]:pt-[5.5rem]";
export const DOC_PAGE_RAIL_INNER_CLASS = "min-[1440px]:sticky min-[1440px]:top-8";
export type CanvasStageLayout = "centered" | "stage";
export type DocumentOutlineMode = "rail" | "inline";
