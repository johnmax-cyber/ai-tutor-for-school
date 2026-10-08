import React from "react";
import { cn } from "./cn";

export interface ProgressProps extends React.HTMLAttributes<HTMLDivElement> {
  value: number;
  max?: number;
  size?: "sm" | "md" | "lg";
  variant?: "default" | "success" | "warning" | "error";
}

const variantClasses = {
  default: "bg-primary",
  success: "bg-success",
  warning: "bg-warning",
  error: "bg-error",
};

export function ProgressBar({
  value,
  max = 100,
  size = "md",
  variant = "default",
  className,
  ...props
}: ProgressProps) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100));
  const sizeClasses = {
    sm: "h-1.5",
    md: "h-2.5",
    lg: "h-4",
  };

  return (
    <div
      className={cn("relative w-full overflow-hidden rounded-full bg-surface-container-high", sizeClasses[size], className)}
      role="progressbar"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={max}
      {...props}
    >
      <div
        className={cn("h-full w-full transition-all duration-300", variantClasses[variant])}
        style={{ width: `${pct}%`, clipPath: `inset(0 ${100 - pct}% 0 0)` }}
      />
    </div>
  );
}
