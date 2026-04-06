import type { SyncStatus } from "@/client/hooks/use-sync";

const STATUS_META: Record<SyncStatus, { class: string; label: string }> = {
  connected: { class: "bg-emerald-400", label: "Connected" },
  connecting: { class: "bg-amber-400 animate-pulse", label: "Syncing" },
  disconnected: { class: "bg-zinc-500", label: "Offline" },
};

export function SyncStatusDot({ status }: { status: SyncStatus }) {
  const meta = STATUS_META[status];
  return (
    <div className="flex items-center gap-1.5" title={meta.label}>
      <span className={`inline-block h-2 w-2 rounded-full ${meta.class}`} />
      <span className="text-xs text-zinc-500">{meta.label}</span>
    </div>
  );
}
