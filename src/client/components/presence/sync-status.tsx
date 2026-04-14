import type { SyncStatus } from "@/client/hooks/use-sync";

const STATUS_META: Record<SyncStatus, { class: string; label: string; shape: string }> = {
  connected: { class: "bg-emerald-400", label: "Connected", shape: "rounded-full" },
  connecting: { class: "bg-amber-400 animate-pulse", label: "Syncing", shape: "rounded-sm" },
  disconnected: { class: "bg-zinc-500", label: "Offline", shape: "rounded-full ring-1 ring-zinc-400" },
};

export function SyncStatusDot({ status }: { status: SyncStatus }) {
  const meta = STATUS_META[status];
  return (
    <div className="flex items-center gap-1.5" title={meta.label}>
      <span className={`inline-block h-2 w-2 ${meta.shape} ${meta.class}`} />
      <span className="text-xs text-zinc-400">{meta.label}</span>
    </div>
  );
}
