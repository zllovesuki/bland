import { CollaborationCaret } from "@tiptap/extension-collaboration-caret";
import type { Awareness } from "y-protocols/awareness";
import { awarenessColor } from "@/client/hooks/use-sync";
import type { ResolveIdentity } from "@/client/lib/presence-identity";

function extractPresenceKeys(user: Record<string, unknown>): { userId: string | null; clientId: number } {
  const clientId = typeof user.clientId === "number" ? user.clientId : 0;
  const userId = typeof user.userId === "string" ? user.userId : null;
  return { userId, clientId };
}

interface CollaborationCaretOptions {
  provider: { awareness: Awareness };
  user: { userId: string | null };
  resolveIdentity: ResolveIdentity;
}

export function createCollaborationCaret({ provider, user, resolveIdentity }: CollaborationCaretOptions) {
  return CollaborationCaret.configure({
    provider,
    user: { userId: user.userId },
    render: (remote) => {
      const { userId, clientId } = extractPresenceKeys(remote);
      const color = awarenessColor(userId, clientId);
      const { name } = resolveIdentity(userId, clientId);

      const cursor = document.createElement("span");
      cursor.classList.add("collaboration-carets__caret");
      cursor.setAttribute("style", `border-color: ${color}`);

      const label = document.createElement("div");
      label.classList.add("collaboration-carets__label");
      label.setAttribute("style", `background-color: ${color}`);
      label.appendChild(document.createTextNode(name));

      cursor.appendChild(label);
      return cursor;
    },
    selectionRender: (remote) => {
      const { userId, clientId } = extractPresenceKeys(remote);
      const color = awarenessColor(userId, clientId);
      return {
        nodeName: "span",
        class: "collaboration-carets__selection",
        style: `background-color: ${color}`,
        "data-client-id": String(clientId),
      };
    },
  });
}
