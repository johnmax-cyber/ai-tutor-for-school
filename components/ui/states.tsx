import React from "react";
import { cn } from "./cn";
import { Icon } from "./icon";

export interface StateProps extends React.HTMLAttributes<HTMLDivElement> {
  title?: string;
  description?: string;
  icon?: string;
  action?: React.ReactNode;
}

export function EmptyState({
  title = "Nothing here yet",
  description = "No items to show.",
  icon,
  action,
  className,
  ...props
}: StateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-4 p-8 text-center rounded-xl border border-border bg-surface-container-low",
        className,
      )}
      {...props}
    >
      {icon && (
        <span className="text-4xl text-foreground-tertiary" aria-hidden="true">
          <Icon name={icon} size="lg" />
        </span>
      )}
      <h3 className="text-lg font-semibold text-foreground">{title}</h3>
      <p className="text-sm text-foreground-secondary max-w-sm">{description}</p>
      {action}
    </div>
  );
}

export function ErrorState({
  title = "Something went wrong",
  description = "We could not load this content. Please try again.",
  icon = "error",
  action,
  className,
  ...props
}: StateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-4 p-8 text-center rounded-xl border border-error/20 bg-error/5",
        className,
      )}
      role="alert"
      {...props}
    >
      <span className="text-4xl text-error" aria-hidden="true">
        <Icon name={icon} size="lg" />
      </span>
      <h3 className="text-lg font-semibold text-error">{title}</h3>
      <p className="text-sm text-foreground-secondary max-w-sm">{description}</p>
      {action}
    </div>
  );
}

export interface LoadingStateProps extends React.HTMLAttributes<HTMLDivElement> {
  label?: string;
}

export function LoadingState({ label = "Loading…", className, ...props }: LoadingStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 p-8 text-center rounded-xl bg-surface-container-low border border-border",
        className,
      )}
      {...props}
    >
      <span className="material-symbols-outlined animate-spin text-3xl text-primary">
        progress_activity
      </span>
      <p className="text-sm text-foreground-secondary">{label}</p>
    </div>
  );
}
