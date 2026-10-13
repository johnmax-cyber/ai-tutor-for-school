import React from "react";
import { cn } from "./cn";

export interface MetricCardProps {
  title: string;
  value: string | number;
  icon: string;
  color?: "primary" | "secondary" | "accent" | "success";
}

export function MetricCard({ 
  title, 
  value, 
  icon, 
  color = "primary" 
}: MetricCardProps) {
  const colorClasses: Record<NonNullable<MetricCardProps["color"]>, string> = {
    primary: "bg-primary/10 text-primary border-primary/20",
    secondary: "bg-secondary/10 text-secondary border-secondary/20",
    accent: "bg-accent/10 text-accent border-accent/20",
    success: "bg-success/10 text-success border-success/20",
  };

  const resolvedColor = color || "primary";
  const classes = colorClasses[resolvedColor];

  return (
    <div className={cn(
      "rounded-xl border border-border p-6 text-center",
      classes
    )}>
      <div className="flex items-center justify-center mb-3">
        <span className={`material-symbols-outlined text-[24px] ${classes.split(' ')[1]}`}>
          {icon}
        </span>
      </div>
      <p className="text-sm font-medium text-on-surface-variant mb-2">{title}</p>
      <p className="text-2xl font-bold text-on-surface">{value}</p>
    </div>
  );
}