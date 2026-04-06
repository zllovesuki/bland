import type { Awareness } from "y-protocols/awareness";
import { useAwareness, type AwarenessState } from "@/client/hooks/use-sync";

interface AvatarStackProps {
  awareness: Awareness | null;
  localClientId: number | null;
}

export function AvatarStack({ awareness, localClientId }: AvatarStackProps) {
  const states = useAwareness(awareness);

  const remoteUsers: { clientId: number; name: string; color: string }[] = [];
  states.forEach((state: AwarenessState, clientId: number) => {
    if (clientId === localClientId || !state.user) return;
    remoteUsers.push({ clientId, name: state.user.name, color: state.user.color });
  });

  if (remoteUsers.length === 0) return null;

  return (
    <div className="flex -space-x-1.5">
      {remoteUsers.slice(0, 5).map((u) => (
        <div
          key={u.clientId}
          className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-zinc-900 text-[10px] font-medium text-white"
          style={{ backgroundColor: u.color }}
          title={u.name}
        >
          {u.name.charAt(0).toUpperCase()}
        </div>
      ))}
      {remoteUsers.length > 5 && (
        <div className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-zinc-900 bg-zinc-700 text-[10px] font-medium text-zinc-300">
          +{remoteUsers.length - 5}
        </div>
      )}
    </div>
  );
}
