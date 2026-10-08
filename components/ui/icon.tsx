import React from "react";
import { cn } from "./cn";

export interface IconProps extends React.HTMLAttributes<HTMLSpanElement> {
  name: string;
  size?: "xs" | "sm" | "md" | "lg" | "xl";
}

export function Icon({ name, size = "md", className, ...props }: IconProps) {
  return (
    <span
      className={cn(
        "material-symbols-outlined leading-none",
        {
          "text-xs": size === "xs",
          "text-sm": size === "sm",
          "text-base": size === "md",
          "text-lg": size === "lg",
          "text-xl": size === "xl",
        },
        className,
      )}
      {...props}
    >
      {name}
    </span>
  );
}
