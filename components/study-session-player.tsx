"use client";

import { useState, useEffect } from "react";

export interface StudySessionPlayerProps {
  sessionId: string;
  onSessionComplete: () => void;
}

export default function StudySessionPlayer({ sessionId, onSessionComplete }: StudySessionPlayerProps) {
  const [session, setSession] = useState<any>(null);
  const [question, setQuestion] = useState<any>(null);
  const [answer, setAnswer] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const [currentAttemptNumber, setCurrentAttemptNumber] = useState(0);
  const [sessionStats, setSessionStats] = useState({ correct: 0, total: 0 });

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
          const attemptsForQuestion = data.attempts?.filter((a: any) => a.question_id === lastQuestion.id) || [];
          setCurrentAttemptNumber(attemptsForQuestion.length);
        }
        
        setSessionStats({
          correct: data.session.correct_attempts || 0,
          total: data.session.total_attempts || 0
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
      const response = await fetch(`/api/study/sessions/${sessionId}/attempts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          questionId: question.id,
          answer: answer.trim()
        })
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to submit answer");
      }

      const result = await response.json();
      
      // Update session stats
      setSessionStats(prev => ({
        correct: prev.correct + (result.attempt.is_correct ? 1 : 0),
        total: prev.total + 1
      }));

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
        setCurrentAttemptNumber(prev => prev + 1);
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
    // After reveal, move to next question if available
    // For MVP, just reset the form
    setAnswer("");
    setShowHint(false);
    setCurrentAttemptNumber(0);
    
    // In a real implementation, this would fetch the next question from the API
    // For now, we'll just allow the user to continue
  };

  if (loading) {
    return <div className="p-6 text-center">Loading question...</div>;
  }

  if (error) {
    return (
      <div className="p-6">
        <h2 className="text-xl font-bold text-red-600">Error</h2>
        <p className="mt-2">{error}</p>
        <button
          onClick={() => window.location.href = "/study"}
          className="px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
        >
          ← Back to Study Hub
        </button>
      </div>
    );
  }

  if (!question) {
    return <div className="p-6 text-center">No question available</div>;
  }

  const hasSubmitted = currentAttemptNumber > 0;

  return (
    <div className="space-y-6">
      {/* Session stats */}
      <div className="flex items-center justify-between">
        <div className="text-sm text-gray-600">
          Progress: {sessionStats.correct} / {sessionStats.total} correct
        </div>
        <div className="text-sm text-gray-600">
          Attempts for this question: {currentAttemptNumber}
        </div>
      </div>

      {/* Question */}
      <div className="bg-gray-50 p-6 rounded-lg">
        <div className="text-xl font-bold mb-4">{question.content}</div>
        {question.explanation && (
          <div className="text-sm text-gray-600 mb-4">{question.explanation}</div>
        )}
        {showHint && question.hint && (
          <div className="mt-4 p-3 bg-blue-50 rounded-lg text-sm">
            <strong>Hint:</strong> {question.hint}
          </div>
        )}
      </div>

      {/* Answer form */}
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-2">Your Answer</label>
          <input
            type="text"
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            placeholder="Type your answer here..."
            className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            disabled={isSubmitting}
            maxLength={500}
          />
          {answer.length > 0 && (
            <div className="mt-1 text-xs text-right text-gray-500">
              {answer.length}/500
            </div>
          )}
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={() => setShowHint(!showHint)}
              disabled={isSubmitting || currentAttemptNumber === 0}
              className={`px-3 py-1 text-sm rounded ${
                showHint ? "bg-blue-100 text-blue-800" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              } disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              {showHint ? "Hide Hint" : "Show Hint"}
            </button>
            {hasSubmitted && currentAttemptNumber >= 1 && (
              <button
                type="button"
                onClick={handleReveal}
                className="px-3 py-1 text-sm rounded bg-gray-100 text-gray-600 hover:bg-gray-200"
              >
                Reveal Answer
              </button>
            )}
          </div>

          <button
            type="submit"
            disabled={isSubmitting || !answer.trim()}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? "Submitting..." : hasSubmitted ? "Try Again" : "Submit Answer"}
          </button>
        </div>
      </form>

      {/* Session controls */}
      <div className="mt-8 pt-4 border-t border-gray-200">
        <div className="flex items-center justify-between">
          <button
            onClick={async () => {
              try {
                const response = await fetch(`/api/study/sessions/${sessionId}/end`, {
                  method: "POST"
                });
                if (response.ok) {
                  onSessionComplete();
                }
              } catch (err) {
                setError("Failed to end session");
              }
            }}
            className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700"
          >
            End Session
          </button>
          <span className="text-sm text-gray-500">
            Session ID: {sessionId.substring(0, 8)}...
          </span>
        </div>
      </div>
    </div>
  );
}