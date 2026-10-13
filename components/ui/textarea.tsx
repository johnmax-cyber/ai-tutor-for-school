import React from "react";
import { cn } from "./cn";

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  error?: boolean;
  rows?: number;
}

export function Textarea({ className, error, rows, ...props }: TextareaProps) {
  return (
    <textarea
      rows={rows ?? 4}
      className={cn(
        "w-full rounded-lg border border-border bg-surface-container px-4 py-3 text-base text-foreground placeholder-foreground-tertiary min-h-[80px] resize-y focus:border-primary focus:outline-none focus:ring-2 focus:ring-(color: var(--focus-ring)) transition-colors duration-150 touch-target",
        error && "border-error focus:border-error",
        className,
      )}
      {...props}
    />
  );
}
