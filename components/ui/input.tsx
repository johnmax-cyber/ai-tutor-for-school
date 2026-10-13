import React from "react";
import { cn } from "./cn";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  error?: boolean;
}

export function Input({ className, error, ...props }: InputProps) {
  return (
    <input
      className={cn(
        "w-full rounded-lg border border-border bg-surface-container px-4 py-3 text-base text-foreground placeholder-foreground-tertiary focus:border-primary focus:outline-none focus:ring-2 focus:ring-(color: var(--focus-ring)) transition-colors duration-150 touch-target",
        error && "border-error focus:border-error",
        className,
      )}
      {...props}
    />
  );
}
