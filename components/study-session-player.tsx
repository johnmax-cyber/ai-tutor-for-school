"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { StudySession, StudyQuestion } from "@/types/study";

export interface StudySessionPlayerProps {
  sessionId: string;
  onSessionComplete: () => void;
}

export function StudySessionPlayer({
  sessionId,
  onSessionComplete,
}: StudySessionPlayerProps) {
  const [session, setSession] = useState<StudySession | null>(null);
  const [question, setQuestion] = useState<StudyQuestion | null>(null);
  const [answer, setAnswer] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const [currentAttemptNumber, setCurrentAttemptNumber] = useState(0);
  const [sessionStats, setSessionStats] = useState({ correct: 0, total: 0 });
  const [lastFeedback, setLastFeedback] = useState<string | null>(null);
  const [isCorrectFeedback, setIsCorrectFeedback] = useState<boolean | null>(null);
  const router = useRouter();

  useEffect(() => {
    const fetchSession = async () => {
      try {
        const response = await fetch(`/api/study/sessions/${sessionId}`);
        if (!response.ok) {
          throw new Error("Failed to load session");
        }
        const data = await response.json();
        setSession(data.session);

        // Get the first unanswered question or the last question
        if (data.questions && data.questions.length > 0) {
          const lastQuestion = data.questions[data.questions.length - 1];
          setQuestion(lastQuestion);

          // Count attempts for this question
          const attemptsForQuestion =
            data.attempts?.filter(
              (a: { question_id: string }) => a.question_id === lastQuestion.id
            ) || [];
          setCurrentAttemptNumber(attemptsForQuestion.length);
        }

        setSessionStats({
          correct: data.session.correct_attempts || 0,
          total: data.session.total_attempts || 0,
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load session");
      } finally {
        setLoading(false);
      }
    };

    fetchSession();
  }, [sessionId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!answer.trim() || isSubmitting || !question) return;

    setIsSubmitting(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/study/sessions/${sessionId}/attempts`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            questionId: question.id,
            answer: answer.trim(),
          }),
        }
      );

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to submit answer");
      }

      const result = await response.json();

      // Update session stats
      setSessionStats((prev) => ({
        correct: prev.correct + (result.attempt.is_correct ? 1 : 0),
        total: prev.total + 1,
      }));

      setIsCorrectFeedback(result.attempt.is_correct);
      setLastFeedback(result.attempt.feedback);

      if (result.attempt.is_correct) {
        // Move to next question
        if (result.nextQuestion) {
          setQuestion(result.nextQuestion);
          setAnswer("");
          setShowHint(false);
          setCurrentAttemptNumber(0);
        } else {
          // Session complete
          onSessionComplete();
        }
      } else {
        // Incorrect - show feedback and allow retry/hint
        setCurrentAttemptNumber((prev) => prev + 1);
        if (result.attempt.hint) {
          setShowHint(true);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit answer");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReveal = () => {
    setAnswer("");
    setShowHint(false);
    setCurrentAttemptNumber(0);
  };

  if (loading) {
    return (
      <div className="p-12 text-center flex flex-col items-center justify-center gap-3">
        <span className="material-symbols-outlined text-[36px] text-primary animate-spin">
          progress_activity
        </span>
        <p className="text-sm text-outline font-mono">
          Loading question and state...
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 rounded-xl bg-error-container/20 border border-error-crimson/30 space-y-3">
        <div className="flex items-center gap-2 text-error-crimson font-bold">
          <span className="material-symbols-outlined text-[20px]">error</span>
          <span>Session Error</span>
        </div>
        <p className="text-sm text-on-surface-variant">{error}</p>
        <button
          onClick={() => router.push("/study")}
          className="px-3.5 py-1.5 rounded-lg bg-surface-container hover:bg-surface-container-high text-xs font-semibold text-on-surface border border-outline-variant/30"
        >
          ← Back to Study Hub
        </button>
      </div>
    );
  }

  if (!question) {
    return (
      <div className="p-12 rounded-xl bg-surface-container-low border border-surface-container-high text-center space-y-3">
        <span className="material-symbols-outlined text-[36px] text-outline">
          quiz
        </span>
        <p className="text-sm text-outline font-medium">No active questions available</p>
      </div>
    );
  }

  const hasSubmitted = currentAttemptNumber > 0;
  const accuracyPercent =
    sessionStats.total > 0
      ? Math.round((sessionStats.correct / sessionStats.total) * 100)
      : 100;

  return (
    <div className="space-y-6">
      {/* Session Progress Meter */}
      <div className="p-4 rounded-xl bg-surface-container-low border border-surface-container-high shadow-sm space-y-2">
        <div className="flex items-center justify-between text-xs font-medium">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-secondary text-[16px]">
              insights
            </span>
            <span className="text-on-surface">Drill Performance</span>
          </div>
          <div className="flex items-center gap-3 font-mono">
            <span className="text-secondary font-bold">
              {sessionStats.correct} / {sessionStats.total} Correct
            </span>
            <span className="text-outline">({accuracyPercent}%)</span>
          </div>
        </div>

        <div className="w-full h-1.5 rounded-full bg-surface-container-high overflow-hidden">
          <div
            className="h-full bg-secondary rounded-full transition-all"
            style={{ width: `${Math.min(100, Math.max(5, accuracyPercent))}%` }}
          ></div>
        </div>
      </div>

      {/* Primary Question Card */}
      <div className="p-6 rounded-xl bg-surface-container-low border border-surface-container-high shadow-sm space-y-4">
        <div className="flex items-center justify-between text-xs">
          <span className="px-2.5 py-0.5 rounded bg-primary/10 text-primary border border-primary/20 font-semibold tracking-wide uppercase">
            {session?.topic_name ? `${session.topic_name}` : "Active Item"}
          </span>
          <span className="text-outline font-mono">
            Attempt: {currentAttemptNumber + 1}
          </span>
        </div>

        <div className="text-lg sm:text-xl font-semibold text-on-surface leading-relaxed">
          {question.content}
        </div>

        {question.explanation && hasSubmitted && (
          <div className="p-3.5 rounded-lg bg-surface-container border border-surface-container-high text-xs text-on-surface-variant leading-relaxed">
            <span className="font-semibold text-primary">Context: </span>
            {question.explanation}
          </div>
        )}

        {/* Feedback Alert Banner */}
        {lastFeedback && (
          <div
            className={`p-3.5 rounded-lg border flex items-start gap-2 text-xs leading-relaxed ${
              isCorrectFeedback
                ? "bg-secondary/10 border-secondary/30 text-secondary"
                : "bg-error-container/20 border-error-crimson/30 text-error-crimson"
            }`}
          >
            <span className="material-symbols-outlined text-[18px] shrink-0 mt-0.5">
              {isCorrectFeedback ? "check_circle" : "cancel"}
            </span>
            <div className="flex flex-col gap-0.5">
              <span className="font-semibold uppercase tracking-wider text-[11px]">
                {isCorrectFeedback ? "Correct Synthesis" : "Misconception Detected"}
              </span>
              <p className="text-on-surface">{lastFeedback}</p>
            </div>
          </div>
        )}

        {/* Hint Box */}
        {showHint && question.hint && (
          <div className="p-3.5 rounded-lg bg-warning/10 border-l-4 border-warning text-xs text-on-surface flex items-start gap-2">
            <span className="material-symbols-outlined text-warning text-[18px] shrink-0">
              lightbulb
            </span>
            <div>
              <span className="font-semibold text-warning uppercase tracking-wider text-[11px] block">
                Targeted Hint
              </span>
              <p className="mt-0.5">{question.hint}</p>
            </div>
          </div>
        )}
      </div>

      {/* Answer Input Console */}
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="p-4 rounded-xl bg-surface-container-low border border-surface-container-high shadow-sm focus-within:border-primary transition-colors space-y-2">
          <label className="block text-xs font-semibold text-outline uppercase tracking-wider">
            Your Response
          </label>
          <input
            type="text"
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            placeholder="Formulate your response..."
            className="w-full bg-transparent text-sm sm:text-base text-on-surface placeholder:text-outline font-sans outline-none disabled:opacity-50"
            disabled={isSubmitting}
            maxLength={500}
            autoFocus
          />

          <div className="flex items-center justify-between pt-2 border-t border-surface-container-high text-xs text-outline">
            <span className="font-mono text-[11px]">{answer.length}/500</span>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowHint(!showHint)}
                disabled={isSubmitting || currentAttemptNumber === 0}
                className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors border ${
                  showHint
                    ? "bg-warning/20 border-warning/40 text-warning"
                    : "bg-surface-container border-outline-variant/30 text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high"
                } disabled:opacity-40 disabled:cursor-not-allowed`}
              >
                {showHint ? "Hide Hint" : "Request Hint"}
              </button>

              {hasSubmitted && currentAttemptNumber >= 1 && (
                <button
                  type="button"
                  onClick={handleReveal}
                  className="px-3 py-1 rounded-lg bg-surface-container hover:bg-surface-container-high border border-outline-variant/30 text-xs font-medium text-on-surface-variant hover:text-on-surface transition-colors"
                >
                  Skip Question
                </button>
              )}

              <button
                type="submit"
                disabled={isSubmitting || !answer.trim()}
                className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-primary text-on-primary text-xs font-semibold hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-sm"
              >
                <span className="material-symbols-outlined text-[16px]">
                  {isSubmitting ? "hourglass_empty" : "send"}
                </span>
                <span>
                  {isSubmitting
                    ? "Evaluating..."
                    : hasSubmitted
                    ? "Retry Answer"
                    : "Submit Answer"}
                </span>
              </button>
            </div>
          </div>
        </div>
      </form>

      {/* Session Footer Controls */}
      <div className="pt-4 border-t border-surface-container-high flex items-center justify-between">
        <button
          onClick={async () => {
            try {
              const response = await fetch(
                `/api/study/sessions/${sessionId}/end`,
                { method: "POST" }
              );
              if (response.ok) {
                onSessionComplete();
              }
            } catch {
              setError("Failed to end session");
            }
          }}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface-container-low hover:bg-surface-container border border-surface-container-high text-xs font-medium text-outline hover:text-error-crimson transition-colors"
        >
          <span className="material-symbols-outlined text-[16px]">
            stop_circle
          </span>
          <span>End Session &amp; Review</span>
        </button>

        <span className="text-[11px] text-outline font-mono">
          Session ID: {sessionId.substring(0, 8)}
        </span>
      </div>
    </div>
  );
}