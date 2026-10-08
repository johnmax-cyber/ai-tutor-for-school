import React from "react";
import { cn } from "./cn";

export interface RadioProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "size"> {
  label?: string;
  description?: string;
  id?: string;
}

export function Radio({ label, description, id, className, ...props }: RadioProps) {
  const generatedId = React.useId();
  const radioId = id ?? `radio-${generatedId}`;

  return (
    <>
      <input
        id={radioId}
        type="radio"
        className={cn(
          "h-4 w-4 cursor-pointer border border-border text-primary focus:ring-2 focus:ring-(color: var(--focus-ring))",
          className,
        )}
        {...props}
      />
      {label && (
        <label htmlFor={radioId} className="text-sm font-medium text-foreground cursor-pointer">
          {label}
        </label>
      )}
      {description && (
        <p className="text-xs text-foreground-secondary mt-1" id={`${radioId}-desc`}>
          {description}
        </p>
      )}
    </>
  );
}
