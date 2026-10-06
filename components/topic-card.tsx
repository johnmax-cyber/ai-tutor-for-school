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
    resource_count: number;
  };
}

export default function TopicCard({ topic }: TopicCardProps) {
  const masteryColors: Record<"not_started" | "learning" | "developing" | "strong" | "review_needed", string> = {
    not_started: "bg-gray-100 text-gray-800",
    learning: "bg-yellow-100 text-yellow-800",
    developing: "bg-orange-100 text-orange-800",
    strong: "bg-green-100 text-green-800",
    review_needed: "bg-red-100 text-red-800"
  };

  const progress = topic.total_attempts > 0 
    ? Math.round((topic.correct_attempts / topic.total_attempts) * 100) 
    : 0;

  return (
    <Link
      href={`/study/new?topicId=${topic.id}`}
      className="block border border-gray-200 rounded-lg p-4 hover:border-blue-300"
    >
      <div className="flex items-center justify-between mb-2">
        <div>
          <h3 className="font-medium">{topic.name}</h3>
          {topic.subject_name && (
            <span className="text-sm text-gray-500 ml-2">({topic.subject_name})</span>
          )}
        </div>
        <span className={`px-2 py-1 text-xs rounded-full ${masteryColors[topic.mastery_state]}`}>
          {topic.mastery_state.replace("_", " ").toUpperCase()}
        </span>
      </div>
      {topic.description && (
        <p className="mt-1 text-sm text-gray-600">{topic.description}</p>
      )}
      <div className="mt-2 flex flex-col sm:flex-row sm:items-center sm:justify-between">
        <div className="text-sm text-gray-600">
          {topic.resource_count} resources • {progress}% accuracy
        </div>
        {topic.last_studied && (
          <span className="text-sm text-gray-600">
            Last studied: {new Date(topic.last_studied).toLocaleDateString()}
          </span>
        )}
      </div>
    </Link>
  );
}