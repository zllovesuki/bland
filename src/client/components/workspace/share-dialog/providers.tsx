import type { ReactNode } from "react";

import { ShareDialogShellContext, ShareLinkContext, SharePeopleContext, SitePublishContext } from "./context";
import type { ShareDialogSlices } from "./types";

export function ShareDialogProviders({ slices, children }: { slices: ShareDialogSlices; children: ReactNode }) {
  return (
    <ShareDialogShellContext.Provider value={slices.shell}>
      <SharePeopleContext.Provider value={slices.people}>
        <ShareLinkContext.Provider value={slices.link}>
          <SitePublishContext.Provider value={slices.publish}>{children}</SitePublishContext.Provider>
        </ShareLinkContext.Provider>
      </SharePeopleContext.Provider>
    </ShareDialogShellContext.Provider>
  );
}
