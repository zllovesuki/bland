import { type ButtonHTMLAttributes, type ReactNode, type Ref } from "react";

type ButtonVariant = "primary" | "secondary" | "danger" | "ghost" | "subtle";
type ButtonSize = "xs" | "sm" | "md";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  ref?: Ref<HTMLButtonElement>;
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: ReactNode;
  iconOnly?: boolean;
}

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: "bg-accent-600 text-white hover:bg-accent-500 active:scale-[0.98] transition",
  secondary:
    "border border-zinc-700/60 bg-zinc-800/60 text-zinc-300 hover:bg-zinc-700/60 hover:text-zinc-100 active:scale-[0.98] transition",
  danger:
    "border border-red-500/20 bg-red-500/10 text-red-400 hover:bg-red-500/20 hover:text-red-300 active:scale-[0.98] transition",
  ghost: "text-zinc-400 hover:bg-zinc-700 hover:text-zinc-100 active:scale-[0.97] transition",
  // Subtle metadata affordance (icon + faded label). Icon stays at full opacity;
  // children render through a fading <span> below.
  subtle: "group text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300 transition",
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  xs: "rounded-md px-2 py-1 text-xs",
  sm: "rounded-lg px-3 py-1.5 text-xs",
  md: "rounded-xl px-4 py-2.5 text-sm",
};

const ICON_ONLY_SIZE_CLASSES: Record<ButtonSize, string> = {
  xs: "rounded-md p-1",
  sm: "rounded-md p-1.5",
  md: "rounded-lg p-2",
};

export function Button({
  ref,
  variant = "secondary",
  size = "md",
  loading = false,
  icon,
  iconOnly = false,
  children,
  disabled,
  className,
  ...rest
}: ButtonProps) {
  return (
    <button
      ref={ref}
      type="button"
      disabled={disabled || loading}
      className={[
        "inline-flex items-center justify-center gap-2 font-medium",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500/50 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas",
        "disabled:cursor-not-allowed disabled:opacity-50",
        iconOnly ? ICON_ONLY_SIZE_CLASSES[size] : SIZE_CLASSES[size],
        VARIANT_CLASSES[variant],
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      {...rest}
    >
      {loading
        ? (icon ?? <span className="h-4 w-4 animate-spin rounded-full border-2 border-current/30 border-t-current" />)
        : icon}
      {variant === "subtle" ? (
        <span className="opacity-60 transition-opacity group-hover:opacity-100">{children}</span>
      ) : (
        children
      )}
    </button>
  );
}
