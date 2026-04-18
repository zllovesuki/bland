interface AvatarProps {
  name: string;
  avatarUrl: string | null | undefined;
  className?: string;
}

export function Avatar({ name, avatarUrl, className }: AvatarProps) {
  const initial = name.trim().charAt(0).toUpperCase() || "?";
  return (
    <span
      className={`inline-grid shrink-0 place-items-center overflow-hidden rounded-full bg-zinc-800 font-medium text-zinc-300 ${className ?? ""}`}
    >
      {avatarUrl ? <img src={avatarUrl} alt={name} className="h-full w-full object-cover" /> : initial}
    </span>
  );
}
