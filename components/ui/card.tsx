import React from "react";
import { cn } from "./cn";

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "interactive" | "selected" | "highlighted" | "warning" | "success";
  padding?: "sm" | "md" | "lg";
}

const variantClasses = {
  default: "bg-surface-container-low border border-border",
  interactive:
    "bg-surface-container-low border border-border hover:bg-surface-container hover:border-border-strong transition-colors cursor-pointer",
  selected:
    "bg-surface-container border-primary border-2",
  highlighted:
    "bg-primary/5 border-primary/30",
  warning:
    "bg-warning/5 border-warning/20",
  success:
    "bg-success/5 border-success/20",
};

const paddingClasses = {
  sm: "p-3",
  md: "p-5",
  lg: "p-7",
};

export function Card({
  variant = "default",
  padding = "md",
  className,
  children,
  ...props
}: CardProps) {
  return (
    <div
      className={cn(
        "rounded-xl shadow-sm",
        variantClasses[variant],
        paddingClasses[padding],
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}
