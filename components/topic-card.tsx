"use client";

import Link from "next/link";

interface TopicCardProps {
  topic: {
    id: string;
    name: string;
    description: string;
    subject_name: string | null;
    mastery_state: "not_started" | "learning" | "developing" | "strong" | "review_needed";
    total_attempts: number;
    correct_attempts: number;
    last_studied: string | null;
    next_review_at: string | null;
    resource_count: number;
  };
}

export default function TopicCard({ topic }: TopicCardProps) {
  const masteryConfig: Record<
    "not_started" | "learning" | "developing" | "strong" | "review_needed",
    { label: string; badgeClass: string }
  > = {
    not_started: {
      label: "Not Started",
      badgeClass: "bg-surface-container-high text-outline border-outline-variant/30",
    },
    learning: {
      label: "Learning",
      badgeClass: "bg-primary/10 text-primary border-primary/20",
    },
    developing: {
      label: "Developing",
      badgeClass: "bg-secondary/10 text-secondary border-secondary/20",
    },
    strong: {
      label: "Mastered",
      badgeClass: "bg-secondary/20 text-secondary border-secondary/30",
    },
    review_needed: {
      label: "Review Needed",
      badgeClass: "bg-warning/10 text-warning border-warning/20",
    },
  };

  const progress =
    topic.total_attempts > 0
      ? Math.round((topic.correct_attempts / topic.total_attempts) * 100)
      : 0;

  const currentMastery = masteryConfig[topic.mastery_state] || masteryConfig.not_started;

  return (
    <Link
      href={`/study/new?topicId=${topic.id}`}
      className="block p-5 rounded-xl bg-surface-container border border-surface-container-high hover:border-primary/50 transition-colors shadow-sm group"
    >
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="min-w-0">
          <h3 className="font-semibold text-base text-on-surface group-hover:text-primary transition-colors truncate">
            {topic.name}
          </h3>
          {topic.subject_name && (
            <span className="text-xs text-outline font-medium">
              Subject: {topic.subject_name}
            </span>
          )}
        </div>

        <span
          className={`shrink-0 px-2.5 py-0.5 rounded text-xs font-semibold border ${currentMastery.badgeClass}`}
        >
          {currentMastery.label}
        </span>
      </div>

      {topic.description && (
        <p className="text-xs text-on-surface-variant line-clamp-2 mb-3">
          {topic.description}
        </p>
      )}

      {/* Progress meter */}
      <div className="space-y-1.5 my-3">
        <div className="flex justify-between text-[11px] text-outline font-mono">
          <span>Accuracy ({topic.correct_attempts}/{topic.total_attempts})</span>
          <span className="text-secondary font-semibold">{progress}%</span>
        </div>
        <div className="w-full h-1.5 rounded-full bg-surface-container-high overflow-hidden">
          <div
            className="h-full bg-secondary rounded-full transition-all"
            style={{ width: `${Math.min(100, Math.max(progress > 0 ? 5 : 0, progress))}%` }}
          ></div>
        </div>
      </div>

      <div className="flex items-center justify-between text-xs text-outline font-mono pt-2 border-t border-surface-container-high">
        <span>{topic.resource_count} linked doc{topic.resource_count === 1 ? "" : "s"}</span>
        {topic.last_studied ? (
          <span>
            Studied: {new Date(topic.last_studied).toLocaleDateString()}
          </span>
        ) : (
          <span>Unstudied</span>
        )}
      </div>

      {topic.next_review_at && (
        <div className="flex items-center gap-1.5 text-xs text-outline font-mono pt-1">
          <span className="material-symbols-outlined text-[14px] text-secondary">
            event
          </span>
          <span>
            Next review: {new Date(topic.next_review_at).toLocaleDateString()}
          </span>
        </div>
      )}
    </Link>
  );
}