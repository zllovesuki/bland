import { AlertCircle } from "lucide-react";

interface PageErrorStateProps {
  message?: string;
  className?: string;
}

export function PageErrorState({ message = "Page not found.", className }: PageErrorStateProps) {
  return (
    <div className={["flex items-center justify-center", className].filter(Boolean).join(" ")}>
      <div className="text-center">
        <AlertCircle className="mx-auto mb-3 h-8 w-8 text-red-400" />
        <p className="text-sm text-zinc-400">{message}</p>
      </div>
    </div>
  );
}
