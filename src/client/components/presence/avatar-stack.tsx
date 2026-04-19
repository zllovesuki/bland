import type { Awareness } from "y-protocols/awareness";
import { awarenessColor, useAwareness, type AwarenessState } from "@/client/hooks/use-sync";
import type { ResolveIdentity } from "@/client/lib/presence-identity";

interface AvatarStackProps {
  awareness: Awareness | null;
  localClientId: number | null;
  resolveIdentity: ResolveIdentity;
}

interface RemoteUser {
  clientId: number;
  color: string;
  name: string;
  avatar_url: string | null;
}

export function AvatarStack({ awareness, localClientId, resolveIdentity }: AvatarStackProps) {
  const states = useAwareness(awareness);

  const remoteUsers: RemoteUser[] = [];
  states.forEach((state: AwarenessState, clientId: number) => {
    if (clientId === localClientId || !state.user) return;
    const userId = state.user.userId ?? null;
    const identity = resolveIdentity(userId, clientId);
    remoteUsers.push({
      clientId,
      color: awarenessColor(userId, clientId),
      name: identity.name,
      avatar_url: identity.avatar_url,
    });
  });

  if (remoteUsers.length === 0) return null;

  return (
    <div className="flex -space-x-1.5">
      {remoteUsers.slice(0, 5).map((u) => (
        <div
          key={u.clientId}
          className="flex h-6 w-6 items-center justify-center overflow-hidden rounded-full border-2 border-canvas text-[10px] font-medium text-white"
          style={{ backgroundColor: u.color }}
          title={u.name}
        >
          {u.avatar_url ? (
            <img src={u.avatar_url} alt={u.name} className="h-full w-full object-cover" />
          ) : (
            <span style={{ textShadow: "0 0 2px rgba(0,0,0,0.5)" }}>{u.name.charAt(0).toUpperCase()}</span>
          )}
        </div>
      ))}
      {remoteUsers.length > 5 && (
        <div className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-canvas bg-zinc-700 text-[10px] font-medium text-zinc-300">
          +{remoteUsers.length - 5}
        </div>
      )}
    </div>
  );
}
