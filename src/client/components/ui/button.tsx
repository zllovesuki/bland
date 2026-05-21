import { type ButtonHTMLAttributes, type ReactNode, type Ref } from "react";
import {
  BUTTON_BASE_CLASSES,
  BUTTON_DISABLED_CLASSES,
  BUTTON_ICON_ONLY_SIZE_CLASSES,
  BUTTON_SIZE_CLASSES,
  BUTTON_VARIANT_CLASSES,
  type ButtonSize,
  type ButtonVariant,
} from "./button-classes";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  ref?: Ref<HTMLButtonElement>;
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: ReactNode;
  iconOnly?: boolean;
}

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
        BUTTON_BASE_CLASSES,
        BUTTON_DISABLED_CLASSES,
        iconOnly ? BUTTON_ICON_ONLY_SIZE_CLASSES[size] : BUTTON_SIZE_CLASSES[size],
        BUTTON_VARIANT_CLASSES[variant],
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
