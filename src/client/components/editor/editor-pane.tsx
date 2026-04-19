import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Skeleton } from "@/client/components/ui/skeleton";
import { PageTitle } from "@/client/components/ui/page-title";
import YProvider from "y-partyserver/provider";
import { reportClientError } from "@/client/lib/report-client-error";
import { toast } from "@/client/components/toast";
import { PageErrorState } from "@/client/components/ui/page-error-state";
import { EditorBody } from "./editor-body";
import type { EditorAffordance } from "@/client/lib/affordance/editor";
import type { ResolveIdentity } from "@/client/lib/presence-identity";
import { useEditorSession } from "./use-editor-session";

const INVALID_SCHEMA_MESSAGE = "This build can't parse this page. Reload to catch up.";
const SNAPSHOT_ERROR_MESSAGE = "This page didn't load. Your connection might be flaky.";

interface EditorPaneProps {
  pageId: string;
  initialTitle: string;
  onTitleChange?: (title: string) => void;
  onProvider?: (provider: YProvider | null) => void;
  shareToken?: string;
  workspaceId?: string;
  affordance: EditorAffordance;
  resolveIdentity: ResolveIdentity;
  outline?: EditorOutlinePlacement;
  docFooterLeading?: ReactNode;
}

export type EditorOutlinePlacement = { kind: "inline" } | { kind: "rail"; target: HTMLDivElement | null };

export function EditorPane({
  pageId,
  initialTitle,
  onTitleChange,
  onProvider,
  shareToken,
  workspaceId,
  affordance,
  resolveIdentity,
  outline,
  docFooterLeading,
}: EditorPaneProps) {
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

  return (
    <div>
      <PageTitle
        title={session.title}
        onInput={session.onTitleInput}
        disabled={session.kind !== "ready" || !!schemaError}
        readOnly={!affordance.documentEditable || schemaError !== null}
      />

      {schemaError ? (
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
          resolveIdentity={resolveIdentity}
          onSchemaError={handleSchemaError}
          outline={outline}
          docFooterLeading={docFooterLeading}
        />
      ) : session.kind === "error" ? (
        <PageErrorState
          message={SNAPSHOT_ERROR_MESSAGE}
          className="min-h-[12rem]"
          action={{ label: "Retry", onClick: session.onRetry }}
        />
      ) : (
        <div className="space-y-3 pl-7">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
          <Skeleton className="h-4 w-3/6" />
        </div>
      )}
    </div>
  );
}
