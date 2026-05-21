export const SESSION_HINT_COOKIE = "bland_has_session";

export const OIDC_TX_COOKIE = "__Host-bland_oidc_tx";

export const OIDC_RETURN_MARKER = "oidc";

// Stored in `users.password_hash` for tessera-bound accounts while the live
// schema keeps the legacy non-null column.
export const PASSWORD_DISABLED_SENTINEL = "tessera!disabled";
