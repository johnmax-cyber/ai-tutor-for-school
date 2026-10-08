import React from "react";
import { cn } from "./cn";

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  error?: boolean;
  placeholder?: string;
}

export function Select({ className, error, placeholder, children, ...props }: SelectProps) {
  return (
    <div className="relative">
      <select
        className={cn(
          "w-full appearance-none rounded-lg border border-border bg-surface-container px-3.5 py-2.5 text-base text-foreground placeholder-foreground-tertiary focus:border-primary focus:outline-none focus:ring-2 focus:ring-(color: var(--focus-ring)) transition-colors",
          error && "border-error focus:border-error",
          className,
        )}
        {...props}
      >
        {placeholder && (
          <option value="" disabled hidden>
            {placeholder}
          </option>
        )}
        {children}
      </select>
      <span
        className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-foreground-tertiary"
        aria-hidden="true"
      >
        <span className="material-symbols-outlined text-sm">arrow_drop_down</span>
      </span>
    </div>
  );
}
