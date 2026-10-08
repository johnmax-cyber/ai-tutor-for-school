import React from "react";
import { cn } from "./cn";

export type BadgeVariant =
  | "primary"
  | "secondary"
  | "success"
  | "warning"
  | "error"
  | "outline"
  | "neutral";

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  size?: "sm" | "md";
}

const variantClasses: Record<BadgeVariant, string> = {
  primary: "bg-primary/10 text-primary border-primary/20",
  secondary: "bg-surface-container-high text-foreground-secondary border-border",
  success: "bg-success/10 text-success border-success/20",
  warning: "bg-warning/10 text-warning border-warning/20",
  error: "bg-error/10 text-error border-error/20",
  neutral: "bg-surface-container-high text-foreground-secondary border-border",
  outline: "border border-border text-foreground",
};

export function Badge({ variant = "neutral", size = "md", className, children }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium",
        size === "sm" && "px-2 py-0 text-2xs",
        variantClasses[variant],
        className,
      )}
      role="status"
      aria-label={
        variant === "success" ? "Success"
        : variant === "warning" ? "Warning"
        : variant === "error" ? "Error"
        : variant === "primary" ? "Primary"
        : undefined
      }
    >
      {children}
    </span>
  );
}
