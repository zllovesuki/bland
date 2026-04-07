import type { InputHTMLAttributes, ReactNode } from "react";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
  icon?: ReactNode;
}

export function Input({ label, error, helperText, icon, id, className, ...rest }: InputProps) {
  const errorId = error && id ? `${id}-error` : undefined;
  const helperId = helperText && id ? `${id}-helper` : undefined;
  const describedBy = [errorId, helperId].filter(Boolean).join(" ") || undefined;

  return (
    <div>
      {label && (
        <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-zinc-300">
          {label}
        </label>
      )}
      <div className="relative">
        {icon && (
          <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-zinc-500">
            {icon}
          </div>
        )}
        <input
          id={id}
          aria-describedby={describedBy}
          aria-invalid={error ? true : undefined}
          className={[
            "w-full rounded-xl border border-zinc-700/60 bg-zinc-800/80 px-4 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-500 transition-colors focus:border-accent-500/50 focus:outline-none focus:ring-1 focus:ring-accent-500/30",
            icon ? "pl-10" : "",
            error ? "border-red-500/40" : "",
            className,
          ]
            .filter(Boolean)
            .join(" ")}
          {...rest}
        />
      </div>
      {error && (
        <p id={errorId} className="mt-1 text-xs text-red-400">
          {error}
        </p>
      )}
      {helperText && !error && (
        <p id={helperId} className="mt-1 text-xs text-zinc-500">
          {helperText}
        </p>
      )}
    </div>
  );
}
