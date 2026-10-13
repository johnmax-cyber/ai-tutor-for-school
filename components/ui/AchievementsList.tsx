import React from "react";
import Link from "next/link";
import { cn } from "./cn";

export interface Achievement {
  id: string;
  title: string;
  description: string;
  icon: string;
  date: string; // ISO date string
}

export interface AchievementsListProps {
  achievements: Achievement[];
}

export function AchievementsList({ achievements }: AchievementsListProps) {
  // Show only first 3 achievements for progressive disclosure
  const displayedAchievements = achievements.slice(0, 3);
  const hasMore = achievements.length > 3;

  return (
    <div className="space-y-4">
      {displayedAchievements.map((achievement, index) => (
        <div key={index} className="rounded-xl border border-border p-4">
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0">
              <span className="material-symbols-outlined text-[24px] text-primary">
                {achievement.icon}
              </span>
            </div>
            <div className="flex-1">
              <h3 className="text-base font-semibold text-on-surface mb-1">
                {achievement.title}
              </h3>
              <p className="text-sm text-on-surface-variant mb-2">
                {achievement.description}
              </p>
              <p className="text-xs text-on-surface-variant">
                {/* Format date */}
                {new Date(achievement.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
              </p>
            </div>
          </div>
        </div>
      ))}

      {hasMore && (
        <div className="text-center pt-4">
          <Link
            href="/progress"
            className="text-sm text-primary hover:underline"
          >
            View all achievements ({achievements.length})
            <span className="material-symbols-outlined ml-[2px] text-[14px]">vertical_align_bottom</span>
          </Link>
        </div>
      )}
    </div>
  );
}