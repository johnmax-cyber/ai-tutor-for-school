import React from "react";
import { cn } from "./cn";
import { Icon } from "./icon";

export type AlertVariant = "info" | "success" | "warning" | "error";

export interface AlertProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: AlertVariant;
  title?: string;
  icon?: boolean;
}

const variantClasses: Record<AlertVariant, { container: string; icon: string; title: string }> =
  {
    info: {
      container: "bg-primary/5 border-primary/20 text-foreground",
      icon: "text-primary",
      title: "text-primary font-semibold",
    },
    success: {
      container: "bg-success/10 border-success/20 text-foreground",
      icon: "text-success",
      title: "text-success font-semibold",
    },
    warning: {
      container: "bg-warning/10 border-warning/20 text-foreground",
      icon: "text-warning",
      title: "text-warning font-semibold",
    },
    error: {
      container: "bg-error/10 border-error/20 text-foreground",
      icon: "text-error",
      title: "text-error font-semibold",
    },
  };

const variantIcons: Record<AlertVariant, string> = {
  info: "info",
  success: "check_circle",
  warning: "warning",
  error: "error",
};

export function Alert({
  variant = "info",
  title,
  icon: showIcon = true,
  className,
  children,
  ...props
}: AlertProps) {
  const v = variantClasses[variant];

  return (
    <div
      className={cn(
        "flex gap-3 items-start rounded-xl border p-4 text-sm",
        v.container,
        className,
      )}
      role="alert"
      {...props}
    >
      {showIcon && (
        <span className={v.icon} aria-hidden="true">
          <Icon name={variantIcons[variant]} size="sm" />
        </span>
      )}
      <div className="flex-1">
        {title && <p className={v.title}>{title}</p>}
        {children}
      </div>
    </div>
  );
}
