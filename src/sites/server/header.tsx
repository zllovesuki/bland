import { Pilcrow } from "lucide-react";
import { SiteIconMark } from "./icons";

export interface SiteHeaderProps {
  workspaceName: string;
  workspaceIcon: string | null;
  homeHref: string;
  currentIsHome: boolean;
}

function WorkspaceMark({ icon }: { icon: string | null }) {
  if (icon) {
    return (
      <SiteIconMark
        icon={icon}
        imageClassName="site-workspace-mark-img block h-5 w-5"
        glyphClassName="site-workspace-mark-glyph text-base leading-none"
        imageSize={20}
      />
    );
  }

  return (
    <Pilcrow
      className="site-workspace-mark-pilcrow h-5 w-5 shrink-0 text-accent-400"
      strokeWidth={2}
      aria-hidden="true"
    />
  );
}

function WorkspaceIdentity({ workspaceName, workspaceIcon }: Pick<SiteHeaderProps, "workspaceName" | "workspaceIcon">) {
  return (
    <>
      <WorkspaceMark icon={workspaceIcon} />
      <span className="site-workspace-name font-display text-sm font-semibold tracking-tight">{workspaceName}</span>
    </>
  );
}

export function SiteHeader({ workspaceName, workspaceIcon, homeHref, currentIsHome }: SiteHeaderProps) {
  const identity = <WorkspaceIdentity workspaceName={workspaceName} workspaceIcon={workspaceIcon} />;

  return (
    <header className="site-header sticky top-0 z-50 w-full border-b border-zinc-800/60 bg-zinc-900/95 px-4 backdrop-blur-sm sm:px-8">
      <div className="site-header-stage mx-auto flex h-14 w-full max-w-3xl items-center">
        {currentIsHome ? (
          <div className="flex items-center gap-2 text-zinc-200">{identity}</div>
        ) : (
          <a
            href={homeHref}
            className="flex items-center gap-2 rounded-md text-zinc-300 transition-colors hover:text-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500/50 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
            aria-label="Workspace home"
          >
            {identity}
          </a>
        )}
      </div>
    </header>
  );
}
