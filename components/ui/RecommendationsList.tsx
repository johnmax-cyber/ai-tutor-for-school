import React from "react";
import Link from "next/link";
import { cn } from "./cn";
import { Button } from "./button";

export interface Recommendation {
  type: "review_mistake" | "continue_resource" | "practice_weak_concept" | "start_session" | "ask_tutor";
  title: string;
  description: string;
  estimatedTime: number; // in minutes
  actionText: string;
  actionLink: string;
  topicName?: string;
  subjectName?: string;
}

export interface RecommendationsListProps {
  recommendations: Recommendation[];
}

export function RecommendationsList({ recommendations }: RecommendationsListProps) {
  // Show only first 3 recommendations for progressive disclosure
  const displayedRecommendations = recommendations.slice(0, 3);
  const hasMore = recommendations.length > 3;

  return (
    <div className="space-y-4">
      {displayedRecommendations.map((rec, index) => (
        <div key={index} className="rounded-xl border border-border p-4">
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0">
              <span className="material-symbols-outlined text-[24px] text-primary">
                {/* We'll use a simple icon mapping for now */}
                {rec.type === "review_mistake" && "repeat"}
                {rec.type === "continue_resource" && "play_arrow"}
                {rec.type === "practice_weak_concept" && "psychology_alt"}
                {rec.type === "start_session" && "get_app"}
                {rec.type === "ask_tutor" && "question_answer"}
              </span>
            </div>
            <div className="flex-1">
              <h3 className="text-base font-semibold text-on-surface mb-1">
                {rec.title}
              </h3>
              <p className="text-sm text-on-surface-variant mb-2">
                {rec.description}
              </p>
              <div className="flex items-center gap-3 text-xs font-mono text-on-surface-variant">
                <span>
                  {/* Assuming we have a function to format time, but we'll inline for now */}
                  {rec.estimatedTime < 60 ? `${rec.estimatedTime} min` : `${Math.round(rec.estimatedTime / 60)}h`}
                </span>
                <span>
                  {rec.topicName && (
                    <>
                      <span className="material-symbols-outlined text-[16px] text-outline me-1">
                        folder
                      </span>
                      <span>{rec.topicName}</span>
                    </>
                  )}
                </span>
              </div>
              <Link
                href={rec.actionLink}
                className="mt-2 inline-flex items-center gap-2 px-3 py-1.5 bg-primary text-on-primary text-xs font-sm hover:opacity-90 transition-opacity"
              >
                {rec.actionText}
                <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
              </Link>
            </div>
          </div>
        </div>
      ))}

      {hasMore && (
        <div className="text-center pt-4">
          <Link
            href="/study"
            className="text-sm text-primary hover:underline"
          >
            View all recommendations ({recommendations.length})
            <span className="material-symbols-outlined ml-[2px] text-[14px]">vertical_align_bottom</span>
          </Link>
        </div>
      )}
    </div>
  );
}