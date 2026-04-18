import type { User } from "@/shared/types";
import { Avatar } from "@/client/components/ui/avatar";
import { formatAbsoluteDate, formatRelativeDate } from "@/client/lib/format-date";

interface PageBylineProps {
  creator: Pick<User, "name" | "avatar_url"> | null;
  createdAt: string;
}

export function PageByline({ creator, createdAt }: PageBylineProps) {
  if (!creator) return null;

  const relative = formatRelativeDate(createdAt);
  const absolute = formatAbsoluteDate(createdAt);

  return (
    <div
      className="flex items-center gap-1.5 text-[11px] leading-none text-zinc-500"
      aria-label={`Created by ${creator.name} on ${absolute}`}
    >
      <Avatar name={creator.name} avatarUrl={creator.avatar_url} className="h-4 w-4 text-[9px]" />
      <span className="truncate text-zinc-400">{creator.name}</span>
      <span aria-hidden="true" className="text-zinc-700">
        ·
      </span>
      <time dateTime={createdAt} title={absolute}>
        {relative}
      </time>
    </div>
  );
}
