import React from "react";
import { cn } from "./cn";

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "elevated" | "interactive" | "selected" | "highlighted" | "warning" | "success" | "containerLow" | "container" | "containerHigh";
  padding?: "sm" | "md" | "lg";
}

const baseClasses =
  "rounded-xl border border-border shadow-sm";

const variantClasses: Record<NonNullable<CardProps["variant"]>, string> = {
  default: "bg-surface-container-low",
  elevated: "shadow-md hover:shadow-lg transition-shadow duration-200",
  interactive: "hover:bg-surface-container-hover cursor-pointer",
  selected: "bg-surface border-primary border-2",
  highlighted: "bg-primary/5 border-primary/30",
  warning: "bg-warning/5 border-warning/20",
  success: "bg-success/5 border-success/20",
  containerLow: "bg-surface-container-low",
  container: "bg-surface-container",
  containerHigh: "bg-surface-container-high",
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
  const resolvedVariant = variant || "default";
  const variantClass = variantClasses[resolvedVariant];
  const paddingClass = paddingClasses[padding || "md"];

  return (
    <div
      className={cn(
        baseClasses,
        variantClass,
        paddingClass,
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}
