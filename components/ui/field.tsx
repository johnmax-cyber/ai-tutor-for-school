import React from "react";
import { cn } from "./cn";
import { Icon } from "./icon";

export interface FieldProps {
  label?: string;
  description?: string;
  error?: string;
  children: React.ReactNode;
  className?: string;
}

export function Field({ label, description, error, children, className }: FieldProps) {
  const id = React.useId();
  const describedBy = [
    description ? `${id}-desc` : "",
    error ? `${id}-error` : "",
  ].filter(Boolean).join(" ");

  const child = React.Children.only(children) as React.ReactElement<{
    id?: string;
    "aria-describedby"?: string;
    "aria-invalid"?: boolean;
  }>;

  const childWithProps = React.cloneElement(child, {
    id: child.props.id ?? id,
    "aria-describedby": describedBy || undefined,
    "aria-invalid": error ? true : child.props["aria-invalid"],
  });

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      {label && (
        <label
          htmlFor={id}
          className="text-xs font-semibold text-foreground-tertiary uppercase tracking-widest"
        >
          {label}
        </label>
      )}
      {childWithProps}
      {description && (
        <p className="text-xs text-foreground-secondary" id={`${id}-desc`}>
          {description}
        </p>
      )}
      {error && (
        <p
          className="text-xs text-error flex items-center gap-1.5"
          id={`${id}-error`}
          role="alert"
        >
          <Icon name="error" size="xs" />
          {error}
        </p>
      )}
    </div>
  );
}
