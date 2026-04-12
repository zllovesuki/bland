interface PageCoverProps {
  coverUrl: string;
  shareToken?: string;
}

export function PageCover({ coverUrl, shareToken }: PageCoverProps) {
  const src = shareToken && coverUrl.startsWith("/uploads/") ? `${coverUrl}?share=${shareToken}` : coverUrl;

  return (
    <div className="h-48 overflow-hidden rounded-b-lg">
      {coverUrl.startsWith("linear-gradient") ? (
        <div className="h-full w-full" style={{ background: coverUrl }} />
      ) : (
        <div className="relative h-full w-full">
          <img src={src} alt="" className="h-full w-full object-cover" />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-zinc-950/70 to-transparent" />
        </div>
      )}
    </div>
  );
}
