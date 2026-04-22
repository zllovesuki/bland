import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import type YProvider from "y-partyserver/provider";
import { PageErrorState } from "@/client/components/ui/page-error-state";
import { PageTitleSection } from "@/client/components/ui/page-title-section";
import { Skeleton } from "@/client/components/ui/skeleton";
import {
  DOC_PAGE_MAIN_CLASS,
  DOC_PAGE_RAIL_CLASS,
  DOC_PAGE_RAIL_INNER_CLASS,
  type DocumentOutlineMode,
  PAGE_CONTENT_COLUMN_CLASS,
  PAGE_SHELL_CLASS,
  PAGE_STAGE_CLASS,
  PAGE_STAGE_WITH_TRACKS_CLASS,
} from "@/client/components/ui/page-layout";
import type { EditorAffordance } from "@/client/lib/affordance/editor";
import { reportClientError } from "@/client/lib/report-client-error";
import { toast } from "@/client/components/toast";
import { EditorBody } from "./editor-body";
import { useEditorSession } from "./use-editor-session";

const INVALID_SCHEMA_MESSAGE = "This build can't parse this page. Reload to catch up.";
const SNAPSHOT_ERROR_MESSAGE = "This page didn't load. Your connection might be flaky.";

interface DocumentPageProps {
  pageId: string;
  initialTitle: string;
  onTitleChange?: (title: string) => void;
  onProvider?: (provider: YProvider | null) => void;
  shareToken?: string;
  workspaceId?: string;
  affordance: EditorAffordance;
  outlineMode: DocumentOutlineMode;
  chrome: ReactNode;
  docFooterLeading?: ReactNode;
}

export function DocumentPage({
  pageId,
  initialTitle,
  onTitleChange,
  onProvider,
  shareToken,
  workspaceId,
  affordance,
  outlineMode,
  chrome,
  docFooterLeading,
}: DocumentPageProps) {
  const [outlineTarget, setOutlineTargetState] = useState<HTMLDivElement | null>(null);
  const setOutlineTarget = useCallback((node: HTMLDivElement | null) => {
    setOutlineTargetState(node);
  }, []);

  const [schemaError, setSchemaError] = useState<Error | null>(null);
  const schemaErrorReportedRef = useRef(false);

  useEffect(() => {
    setSchemaError(null);
    schemaErrorReportedRef.current = false;
  }, [pageId, shareToken]);

  const handleSchemaError = useCallback(
    (error: Error) => {
      setSchemaError((current) => current ?? error);

      if (schemaErrorReportedRef.current) return;
      schemaErrorReportedRef.current = true;

      reportClientError({
        source: "editor.invalid-schema",
        error,
        context: {
          pageId,
          workspaceId,
          hasShareToken: !!shareToken,
          readOnly: !affordance.documentEditable,
        },
      });
      toast.error(INVALID_SCHEMA_MESSAGE);
    },
    [pageId, affordance.documentEditable, shareToken, workspaceId],
  );

  const session = useEditorSession({
    pageId,
    initialTitle,
    onTitleChange,
    onProvider,
    shareToken,
    workspaceId,
    enabled: !schemaError,
  });

  const titleProps = {
    title: session.title,
    onInput: session.onTitleInput,
    disabled: session.kind !== "ready" || !!schemaError,
    readOnly: !affordance.documentEditable || schemaError !== null,
  };

  const body = schemaError ? (
    <PageErrorState
      message={INVALID_SCHEMA_MESSAGE}
      className="min-h-[12rem]"
      action={{ label: "Reload", onClick: () => window.location.reload() }}
    />
  ) : session.kind === "ready" ? (
    <EditorBody
      fragment={session.fragment}
      provider={session.provider}
      pageId={pageId}
      shareToken={shareToken}
      workspaceId={workspaceId}
      affordance={affordance}
      onSchemaError={handleSchemaError}
      outline={outlineMode === "rail" ? { kind: "rail", target: outlineTarget } : { kind: "inline" }}
      docFooterLeading={docFooterLeading}
    />
  ) : session.kind === "error" ? (
    <PageErrorState
      message={SNAPSHOT_ERROR_MESSAGE}
      className="min-h-[12rem]"
      action={{ label: "Retry", onClick: session.onRetry }}
    />
  ) : (
    <div className="mt-4 space-y-3 pl-7">
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-5/6" />
      <Skeleton className="h-4 w-3/6" />
    </div>
  );

  const showRail = outlineMode === "rail";

  return (
    <div className={PAGE_SHELL_CLASS}>
      <div className={showRail ? PAGE_STAGE_WITH_TRACKS_CLASS : PAGE_STAGE_CLASS}>
        <div className={showRail ? DOC_PAGE_MAIN_CLASS : "min-w-0"}>
          {chrome}
          <PageTitleSection {...titleProps} />
          <div className={PAGE_CONTENT_COLUMN_CLASS}>{body}</div>
        </div>
        {showRail ? (
          <aside className={DOC_PAGE_RAIL_CLASS} aria-label="Document outline">
            <div ref={setOutlineTarget} className={DOC_PAGE_RAIL_INNER_CLASS} />
          </aside>
        ) : null}
      </div>
    </div>
  );
}
