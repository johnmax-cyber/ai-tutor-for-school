import React from "react";
import { cn } from "./cn";
import Link from "next/link";

export interface TodayFocusCardProps {
  topic: string;
  progress: number; // 0-100
  timeEstimate: number; // in minutes
}

export function TodayFocusCard({ 
  topic, 
  progress, 
  timeEstimate 
}: TodayFocusCardProps) {
  return (
    <div className="rounded-xl border border-border p-6">
      <div className="flex items-center gap-3 mb-4">
        <span className="material-symbols-outlined text-primary text-[24px]">
          psychology_alt
        </span>
        <div>
          <h3 className="text-base font-semibold text-on-surface mb-1">
            {topic}
          </h3>
          <p className="text-sm text-on-surface-variant">
            {timeEstimate} min estimated
          </p>
        </div>
      </div>
      <div className="w-full bg-surface-container-high rounded-full h-2.5 mb-3">
        <div
          className="h-full bg-primary rounded-full transition-width duration-300"
          style={{ width: `${progress}%` }}
        ></div>
      </div>
      <div className="text-sm font-medium text-primary">
        {progress}% complete
      </div>
      <Link
        href="/study"
        className="mt-4 inline-flex items-center gap-2 px-3 py-2 bg-primary text-on-primary text-xs font-sm hover:opacity-90 transition-opacity"
      >
        Start Focus Session
        <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
      </Link>
    </div>
  );
}