export const TURNSTILE_SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY ?? "1x00000000000000000000AA";

export const STORAGE_KEYS = {
  D1_BOOKMARK: "bland:d1:bookmark",
  USER: "bland:user",
  LAYOUT: "bland:layout",
} as const;
