// ADR: tokens live in a separate `.ts` (not in `button.tsx`) so the component
// module stays component-only for React Fast Refresh — mixed exports force
// full reloads on token edits. They're shared between <Button> and the small
// set of CTAs that render <a href> for top-level navigation (currently the
// OIDC sign-in hand-offs in client/components/auth/{login,invite}-page.tsx),
// which need native link semantics (cmd/ctrl-click new-tab, hover URL
// preview, link role) that a <button onClick=location.assign> would lose.
// Callers MUST consume these tokens — hand-rolling button classes inline is
// how the primary base drifts a rung lighter (accent-500 vs the canonical
// accent-600). For anything other than top-level navigation, use <Button>.

export type ButtonVariant = "primary" | "secondary" | "danger" | "ghost" | "subtle";
export type ButtonSize = "xs" | "sm" | "md";

export const BUTTON_BASE_CLASSES =
  "inline-flex items-center justify-center gap-2 font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500/50 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas";

export const BUTTON_DISABLED_CLASSES = "disabled:cursor-not-allowed disabled:opacity-50";

export const BUTTON_VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: "bg-accent-600 text-white hover:bg-accent-500 active:scale-[0.98] transition",
  secondary:
    "border border-zinc-700/60 bg-zinc-800/60 text-zinc-300 hover:bg-zinc-700/60 hover:text-zinc-100 active:scale-[0.98] transition",
  danger:
    "border border-red-500/20 bg-red-500/10 text-red-400 hover:bg-red-500/20 hover:text-red-300 active:scale-[0.98] transition",
  ghost: "text-zinc-400 hover:bg-zinc-700 hover:text-zinc-100 active:scale-[0.97] transition",
  // Subtle metadata affordance (icon + faded label). Icon stays at full opacity;
  // children render through a fading <span> in <Button>.
  subtle: "group text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300 transition",
};

export const BUTTON_SIZE_CLASSES: Record<ButtonSize, string> = {
  xs: "rounded-md px-2 py-1 text-xs",
  sm: "rounded-lg px-3 py-1.5 text-xs",
  md: "rounded-xl px-4 py-2.5 text-sm",
};

export const BUTTON_ICON_ONLY_SIZE_CLASSES: Record<ButtonSize, string> = {
  xs: "rounded-md p-1",
  sm: "rounded-md p-1.5",
  md: "rounded-lg p-2",
};
