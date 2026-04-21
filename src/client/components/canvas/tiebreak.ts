/**
 * Mirrors Excalidraw's own reconciler tiebreak (see `reconcileElements`):
 * local wins when its version is strictly higher, or on a tie when its
 * versionNonce sorts first. Exported as a pure helper so the Vitest suite
 * can exercise the truth table without pulling in the Excalidraw bundle.
 */
export function localWinsVersionTiebreak(
  local: { version: number; versionNonce: number },
  remote: { version: number; versionNonce: number } | null,
): boolean {
  if (!remote) return true;
  if (local.version > remote.version) return true;
  if (local.version < remote.version) return false;
  return local.versionNonce < remote.versionNonce;
}
