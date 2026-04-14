import { AlertCircle } from "lucide-react";
import { Button } from "../ui/button";

interface PageErrorStateProps {
  message?: string;
  className?: string;
  action?: { label: string; onClick: () => void };
}

export function PageErrorState({ message = "Page not found.", className, action }: PageErrorStateProps) {
  return (
    <div className={["flex items-center justify-center", className].filter(Boolean).join(" ")}>
      <div className="text-center">
        <AlertCircle className="mx-auto mb-3 h-8 w-8 text-red-400" />
        <p className="text-sm text-zinc-400">{message}</p>
        {action && (
          <Button variant="secondary" size="sm" onClick={action.onClick} className="mt-4">
            {action.label}
          </Button>
        )}
      </div>
    </div>
  );
}
