import { useCallback, useState, type ReactNode } from "react";

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

interface DocumentPageShellProps {
  chrome: ReactNode;
  sideRail: boolean;
  children: (payload: { outlineTarget: HTMLDivElement | null }) => ReactNode;
}

export function DocumentPageShell({ chrome, sideRail, children }: DocumentPageShellProps) {
  const [outlineTarget, setOutlineTargetState] = useState<HTMLDivElement | null>(null);
  const setOutlineTarget = useCallback((node: HTMLDivElement | null) => {
    setOutlineTargetState(node);
  }, []);

  return (
    <div className={PAGE_SHELL_CLASS}>
      <div className={sideRail ? PAGE_STAGE_WITH_TRACKS_CLASS : PAGE_STAGE_CLASS}>
        <div className={sideRail ? DOC_PAGE_MAIN_CLASS : "min-w-0"}>
          {chrome}
          {children({ outlineTarget: sideRail ? outlineTarget : null })}
        </div>
        {sideRail ? (
          <aside className={DOC_PAGE_RAIL_CLASS} aria-label="Document outline">
            <div ref={setOutlineTarget} className={DOC_PAGE_RAIL_INNER_CLASS} />
          </aside>
        ) : null}
      </div>
    </div>
  );
}

interface CanvasPageShellProps {
  layout?: CanvasStageLayout;
  chrome: ReactNode;
  body: ReactNode;
}

export function CanvasPageShell({ layout = "centered", chrome, body }: CanvasPageShellProps) {
  return (
    <div className={PAGE_SHELL_CLASS}>
      <div className={PAGE_STAGE_CLASS}>
        <div className={layout === "stage" ? PAGE_STAGE_TRACKS_CLASS : undefined}>
          <div className="min-w-0">{chrome}</div>
        </div>
        {body}
      </div>
    </div>
  );
}
