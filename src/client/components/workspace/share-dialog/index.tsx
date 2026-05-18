import { useShareDialogController } from "./controller";
import { ShareDialogProviders } from "./providers";
import { ShareDialogPanel, ShareDialogTrigger } from "./shell";
import type { ShareDialogProps } from "./types";

export function ShareDialog({ pageId, workspaceId, pageKind, disabled = false, title }: ShareDialogProps) {
  const slices = useShareDialogController({
    pageId,
    workspaceId,
    pageKind,
    disabled,
    title,
  });

  return (
    <ShareDialogProviders slices={slices}>
      <div className="relative">
        <ShareDialogTrigger />
        <ShareDialogPanel />
      </div>
    </ShareDialogProviders>
  );
}
