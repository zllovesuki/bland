import { selectHasLocalSession, useAuthStore } from "@/client/stores/auth-store";

const MANIFEST_HREF = "/manifest.webmanifest";

function findManifestLink(): HTMLLinkElement | null {
  return document.head.querySelector<HTMLLinkElement>('link[rel="manifest"]');
}

function mountManifestLink(): void {
  if (findManifestLink()) return;
  const link = document.createElement("link");
  link.rel = "manifest";
  link.href = MANIFEST_HREF;
  document.head.appendChild(link);
}

function removeManifestLink(): void {
  const existing = findManifestLink();
  if (existing) existing.remove();
}

function apply(hasLocal: boolean): void {
  if (hasLocal) mountManifestLink();
  else removeManifestLink();
}

/**
 * Mount `<link rel="manifest">` only while the user has a local session
 * (AUTHENTICATED / LOCAL_ONLY / EXPIRED). Anonymous `/` visits stay
 * uninstallable so the browser's install heuristic never triggers before
 * the user signs in.
 */
export function installManifestGate(): () => void {
  if (typeof document === "undefined") return () => {};
  apply(selectHasLocalSession(useAuthStore.getState()));
  return useAuthStore.subscribe((state) => {
    apply(selectHasLocalSession(state));
  });
}
