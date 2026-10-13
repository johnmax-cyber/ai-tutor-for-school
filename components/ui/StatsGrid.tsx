import React from "react";
import { cn } from "./cn";

export interface Stat {
  title: string;
  value: string | number;
}

export interface StatsGridProps {
  stats: Stat[];
}

export function StatsGrid({ stats }: StatsGridProps) {
  return (
    <div className="space-y-4">
      {stats.map((stat, index) => (
        <div key={index} className="rounded-xl border border-border p-6 text-center">
          <p className="text-sm font-medium text-on-surface-variant mb-2">
            {stat.title}
          </p>
          <p className="text-2xl font-bold text-on-surface">
            {stat.value}
          </p>
        </div>
      ))}
    </div>
  );
}