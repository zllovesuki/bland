import { OutlinePresentation } from "@/shared/editor/presentation/outline";
import type { SiteOutlineControllerProps } from "@/shared/sites/island-schemas";
import { SiteIslandHost } from "./island-host";

export function SiteOutlineControllerIslandHost(props: SiteOutlineControllerProps) {
  return (
    <SiteIslandHost name="site-outline-controller" props={props}>
      <OutlinePresentation items={props.items} mode="link" variant="rail" />
    </SiteIslandHost>
  );
}
