import React from "react";
import { cn } from "./cn";

export type IconButtonVariant = "primary" | "secondary" | "outline" | "ghost" | "destructive";

export interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: IconButtonVariant;
  size?: "sm" | "md" | "lg";
  icon: React.ReactNode;
  label?: string;
}

const sizeClasses = {
  sm: "h-7 w-7 text-xs",
  md: "h-9 w-9 text-sm",
  lg: "h-11 w-11 text-base",
};

const variantClasses: Record<IconButtonVariant, string> = {
  primary: "bg-primary text-on-primary hover:opacity-90",
  secondary: "bg-secondary text-on-secondary hover:opacity-90",
  destructive: "bg-error text-on-error hover:opacity-90",
  outline: "border border-border bg-transparent hover:bg-surface-container",
  ghost: "bg-transparent text-foreground-secondary hover:bg-surface-container hover:text-foreground",
};

export function IconButton({
  variant = "ghost",
  size = "md",
  icon,
  label,
  className,
  ...props
}: IconButtonProps) {
  return (
    <button
      type="button"
      className={cn(
        "touch-target inline-flex items-center justify-center rounded-lg transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(color: var(--focus-ring)) disabled:pointer-events-none disabled:opacity-50",
        sizeClasses[size],
        variantClasses[variant],
        className,
      )}
      aria-label={label}
      {...props}
    >
      {icon}
    </button>
  );
}
