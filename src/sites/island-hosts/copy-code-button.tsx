import { CodeBlockCopyButtonChrome } from "@/shared/editor/presentation/code-block";
import type { CopyCodeButtonProps } from "@/shared/sites/island-schemas";
import { SiteIslandHost } from "./island-host";

export function CopyCodeButtonIslandHost(props: CopyCodeButtonProps) {
  return (
    <SiteIslandHost name="copy-code" props={props}>
      <CodeBlockCopyButtonChrome />
    </SiteIslandHost>
  );
}
