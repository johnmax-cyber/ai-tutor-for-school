import React from "react";
import { cn } from "./cn";

export type ButtonVariant = "primary" | "secondary" | "outline" | "ghost" | "destructive" | "success";
export type ButtonSize = "sm" | "md" | "lg" | "icon";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: React.ReactNode;
}

const baseClasses =
  "inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50";

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    "bg-primary text-on-primary hover:opacity-90 focus-visible:ring-(color: var(--focus-ring))",
  secondary:
    "bg-secondary text-on-secondary hover:opacity-90 focus-visible:ring-(color: var(--focus-ring))",
  success:
    "bg-success text-on-success hover:opacity-90 focus-visible:ring-(color: var(--focus-ring))",
  destructive:
    "bg-error text-on-error hover:opacity-90 focus-visible:ring-(color: var(--focus-ring))",
  outline:
    "border border-border bg-transparent text-foreground hover:bg-surface-container focus-visible:ring-(color: var(--focus-ring))",
  ghost:
    "bg-transparent text-foreground-secondary hover:bg-surface-container hover:text-foreground focus-visible:ring-(color: var(--focus-ring))",
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-xs",
  md: "h-10 px-4 text-sm",
  lg: "h-12 px-5 text-sm font-semibold",
  icon: "h-9 w-9 p-0 text-base",
};

export function buttonClasses(variant: ButtonVariant, size: ButtonSize) {
  return `${baseClasses} ${variantClasses[variant]} ${sizeClasses[size]}`;
}

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  disabled,
  icon,
  children,
  className,
  ...props
}: ButtonProps) {
  const isLoading = loading;
  const isDisabled = disabled || isLoading;

  return (
    <button
      className={cn(buttonClasses(variant, size), className)}
      disabled={isDisabled}
      aria-busy={isLoading || undefined}
      {...props}
    >
      {isLoading && (
        <span
          className="material-symbols-outlined animate-spin"
          aria-hidden="true"
        >
          progress_activity
        </span>
      )}
      {!isLoading && icon && <span aria-hidden="true">{icon}</span>}
      <span>{children}</span>
    </button>
  );
}
