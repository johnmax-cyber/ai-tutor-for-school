import React from "react";
import { cn } from "./cn";

export interface CheckboxProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "size"> {
  label?: string;
  error?: boolean;
  description?: string;
  id?: string;
}

export function Checkbox({ label, description, id, className, ...props }: CheckboxProps) {
  const generatedId = React.useId();
  const checkboxId = id ?? `checkbox-${generatedId}`;

  return (
    <div className="flex items-start gap-3">
      <div className="flex items-center justify-center">
        <input
          id={checkboxId}
          type="checkbox"
          className={cn(
            "h-4 w-4 cursor-pointer rounded border bg-surface-container checked:bg-primary focus:ring-2 focus:ring-(color: var(--focus-ring))",
            props.error && "border-error",
            className,
          )}
          {...props}
        />
      </div>
      {label && (
        <div>
          <label htmlFor={checkboxId} className="text-sm font-medium text-foreground cursor-pointer">
            {label}
          </label>
          {description && (
            <p className="text-xs text-foreground-secondary mt-1">{description}</p>
          )}
        </div>
      )}
    </div>
  );
}
