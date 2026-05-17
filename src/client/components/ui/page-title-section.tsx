import { PageTitle, type PageTitleProps } from "@/client/components/ui/page-title";
import { PAGE_CONTENT_COLUMN_CLASS } from "@/client/components/ui/page-layout";

interface PageTitleSectionProps extends PageTitleProps {
  className?: string;
}

export function PageTitleSection({
  className = `${PAGE_CONTENT_COLUMN_CLASS} mb-1.5`,
  ...props
}: PageTitleSectionProps) {
  return (
    <div className={className}>
      <PageTitle {...props} />
    </div>
  );
}
