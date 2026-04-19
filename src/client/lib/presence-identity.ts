export interface PresenceIdentity {
  name: string;
  avatar_url: string | null;
}

export type ResolveIdentity = (userId: string | null, clientId: number) => PresenceIdentity;
