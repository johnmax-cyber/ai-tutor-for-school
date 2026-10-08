import React from "react";
import { cn } from "./cn";

export interface DividerProps extends React.HTMLAttributes<HTMLDivElement> {
  orientation?: "horizontal" | "vertical";
  text?: string;
}

export function Divider({ orientation = "horizontal", text, className, ...props }: DividerProps) {
  if (text) {
    return (
      <div
        className={cn(
          "relative flex items-center text-sm text-foreground-tertiary",
          orientation === "horizontal" && "flex-row my-4",
          orientation === "vertical" && "flex-col mx-2",
          className,
        )}
        {...props}
      >
        <span className="absolute inset-0 flex items-center">
          <span className="w-full border-t border-border"></span>
        </span>
        <span className="relative flex items-center justify-center">
          <span className="px-2 bg-surface-container-low text-xs">
            {text}
          </span>
        </span>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "border-border",
        orientation === "horizontal" && "w-full border-t",
        orientation === "vertical" && "h-full border-l",
        className,
      )}
      {...props}
    />
  );
}
