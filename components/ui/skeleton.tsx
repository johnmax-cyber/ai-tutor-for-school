import React from "react";
import { cn } from "./cn";

export interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "text" | "rect" | "circle";
  animation?: "pulse" | "none";
}

export function Skeleton({
  variant = "rect",
  animation = "pulse",
  className,
  ...props
}: SkeletonProps) {
  return (
    <div
      className={cn(
        "bg-surface-container-high",
        variant === "text" && "h-4 w-full rounded",
        variant === "rect" && "rounded-lg",
        variant === "circle" && "rounded-full",
        animation === "pulse" && "animate-pulse",
        className,
      )}
      aria-label="Loading"
      {...props}
    />
  );
}
