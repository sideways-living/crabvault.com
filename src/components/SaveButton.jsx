import { useState } from "react";
import { Button } from "@/components/ui/button";
import { RefreshCw, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * SaveButton — wraps an async onSave handler with three states:
 *   idle → saving (spinning arrows) → saved (green) → idle (after 2s)
 *
 * Props: onSave (async fn), children, size, variant, className, disabled
 */
export default function SaveButton({ onSave, children, size, variant, className, disabled, ...props }) {
  const [state, setState] = useState("idle"); // idle | saving | saved

  const handleClick = async () => {
    if (state !== "idle") return;
    setState("saving");
    await onSave();
    setState("saved");
    setTimeout(() => setState("idle"), 2000);
  };

  return (
    <Button
      size={size}
      variant={state === "saved" ? undefined : variant}
      className={cn(
        "transition-all duration-300",
        state === "saved" && "bg-emerald-600 hover:bg-emerald-700 text-white border-0",
        className
      )}
      disabled={disabled || state === "saving"}
      onClick={handleClick}
      {...props}
    >
      {state === "saving" && <RefreshCw className="h-4 w-4 mr-1.5 animate-spin" />}
      {state === "saved" && <CheckCircle2 className="h-4 w-4 mr-1.5" />}
      {state === "idle" && children}
      {state === "saving" && "Saving…"}
      {state === "saved" && "Saved"}
    </Button>
  );
}