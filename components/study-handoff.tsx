"use client";

import Link from "next/link";

export interface StudyHandoffProps {
  handoffText: string;
}

export function StudyHandoff({ handoffText }: StudyHandoffProps) {
  return (
    <div className="p-6 rounded-xl bg-surface-container-low border border-surface-container-high shadow-sm space-y-6">
      <div className="flex items-center justify-between pb-4 border-b border-surface-container-high">
        <div className="flex items-center gap-2.5">
          <span className="material-symbols-outlined text-secondary text-[24px]">
            verified
          </span>
          <h2 className="text-xl font-bold text-on-surface">
            Session Synthesis &amp; Handoff
          </h2>
        </div>
        <span className="text-xs text-outline font-mono">
          Generated {new Date().toLocaleDateString()}
        </span>
      </div>

      <div className="p-5 rounded-lg bg-surface-container border border-surface-container-high font-mono text-xs sm:text-sm text-on-surface leading-relaxed whitespace-pre-line shadow-inner">
        {handoffText}
      </div>

      <div className="pt-4 border-t border-surface-container-high flex flex-wrap items-center justify-between gap-3">
        <span className="text-xs text-outline">
          Mastery updates and mistake trajectories recorded to profile.
        </span>

        <div className="flex items-center gap-2">
          <Link
            href="/study"
            className="px-3.5 py-2 rounded-lg bg-surface-container hover:bg-surface-container-high text-xs font-semibold text-on-surface border border-outline-variant/30 transition-colors"
          >
            Study Hub
          </Link>
          <Link
            href="/study/new"
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary text-on-primary text-xs font-semibold hover:opacity-90 transition-opacity shadow-sm"
          >
            <span>Start Next Session</span>
            <span className="material-symbols-outlined text-[16px]">
              arrow_forward
            </span>
          </Link>
        </div>
      </div>
    </div>
  );
}