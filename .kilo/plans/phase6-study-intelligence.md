# Phase 6 — Study Intelligence & Analytics

> **Status:** Planning
> **Builds on:** Phase 5 (Learning Memory: topics, study sessions, mastery, mistakes, handoff)
> **Goal:** *The system learns from study patterns and provides actionable insights into learning effectiveness.*

---

## Resolved Decisions

| # | Decision | Choice | Rationale |
|---|---|---|---|
| 1 | Scope | Study intelligence + basic spaced repetition + session analytics | Builds directly on Phase 5 data; highest ROI before full spaced repetition engine |
| 2 | Spaced repetition | Lightweight SM-2 variant stored in `topics.next_review_at` | No new tables; uses existing `topics` mastery fields |
| 3 | Analytics | Aggregated in API responses; no new analytics tables | Keeps schema changes minimal; dashboard can compute from existing data |
| 4 | Insights | Server-generated "study tips" in session handoff | Reuses existing `generateHandoff()` pattern; no client changes required |
| 5 | Performance metrics | Stored in `study_sessions` + derived from `attempts` | Enables per-session and per-topic analytics without new tables |

---

## Quick Reference: Ordered Task List

1. **Study analytics types** — `lib/study/types.ts` add `SessionAnalytics`, `TopicInsights`, `StudyTip`
2. **Analytics service** — `lib/study/analytics.ts` (pure functions for computing insights from session/attempt data)
3. **Mastery enhancement** — `lib/study/mastery.ts` add SM-2-based `calculateNextReview()` 
4. **Mistakes enhancement** — `lib/study/mistakes.ts` add `getMistakePatterns()` for recurring misconception detection
5. **Handoff enhancement** — `lib/study/handoff.ts` add study tips and performance insights
6. **Study service extension** — `lib/study/service.ts` add `getSessionAnalytics()`, `getTopicInsights()`
7. **Study API routes** — `app/api/study/analytics/route.ts` (GET topic insights, session analytics)
8. **Study UI analytics** — `app/study/[id]/page.tsx` add analytics panel (performance breakdown, tips)
9. **Topics UI enhancement** — `app/topics/page.tsx` add mastery progress bars, review date indicators
10. **Tests** — analytics tests, mastery enhancement tests, handoff enhancement tests
11. **Verify** — typecheck, lint, build, all tests (new + existing)

---

## Architecture

```
Browser (study UI)
  │ HTTPS GET /api/study/analytics?topicId=...
  │ HTTPS POST /api/study/sessions/:id/end  (now includes analytics)
  │
  ▼
Route handler  app/api/study/analytics/route.ts
  │
  ├─ 1. getUser() → 401
  ├─ 2. Verify ownership (topic belongs to user)
  ├─ 3. Call StudySessionService.getTopicInsights(topicId)
  │     ├─ Fetch sessions + attempts for topic
  │     ├─ Compute analytics via analytics.ts
  │     └─ Return TopicInsights
  ▼
Response: { masteryState, totalSessions, avgAccuracy, commonMistakes, studyTips, nextReviewAt }
```

---

## Data Model Additions

### No new tables required.

All analytics computed from existing tables:
- `study_sessions` — session count, duration, timestamps
- `attempts` — accuracy, hints used, retry patterns
- `mistakes` — recurring misconception detection
- `topics` — mastery state, next_review_at

---

## API Additions

### New route: `GET /api/study/analytics`

**Query params:**
- `topicId` (uuid, required) — topic to analyze

**Response:**
```typescript
{
  topicId: string;
  topicName: string;
  masteryState: "not_started" | "learning" | "developing" | "strong" | "review_needed";
  nextReviewAt: string | null;
  totalSessions: number;
  totalAttempts: number;
  correctAttempts: number;
  accuracy: number; // 0-1
  avgHintsPerQuestion: number;
  commonMistakes: Array<{
    description: string;
    occurrenceCount: number;
    lastSeen: string;
  }>;
  studyTips: string[];
  performanceTrend: "improving" | "stable" | "declining" | "insufficient_data";
}
```

**Auth:** Same as existing study routes — `getUser()` + ownership verification.

---

## UI Additions

### 1. Topic insights panel (`app/topics/page.tsx`)
- Mastery progress bar with state label
- Next review date countdown
- Accuracy percentage
- Session count
- Quick study tip

### 2. Session analytics panel (`app/study/[id]/page.tsx`)
- Performance breakdown (correct/incorrect/hints)
- Time per question (if tracked)
- Study tips specific to this session
- Comparison to topic average

### 3. Study hub analytics (`app/study/page.tsx`)
- Overall progress across all topics
- Topics needing review
- Recent performance trend

---

## Key Algorithms

### 1. SM-2-based next review date
```
if attempt.correct && !attempt.hint_used:
    interval = interval * 2  // or ease factor
else:
    interval = 1  // reset
next_review_at = now() + interval_days
```

### 2. Performance trend
```
sessions = last 5 sessions for topic
if sessions.length < 2:
    return "insufficient_data"
accuracy_trend = linear_regression(session.accuracy over sessions)
if slope > threshold: return "improving"
if slope < -threshold: return "declining"
return "stable"
```

### 3. Study tip generation
```
tips = []
if accuracy < 0.5:
    tips.push("Consider reviewing the foundational concepts before continuing.")
if hints_used > avg_hints:
    tips.push("You're using hints more than average. Try to recall before hinting.")
if recurring_mistakes.length > 0:
    tips.push("Focus on: " + join(recurring_mistakes[:2], ", "))
return tips
```

---

## Dependencies

- Phase 5: Learning Memory (topics, study sessions, mastery, mistakes, handoff)
- Phase 4: AI Tutor (retrieval, grounding)
- Phase 3: Document Library (resources, chunks)

---

## Out of Scope

- Full spaced repetition engine (Phase 10)
- Dashboard analytics with charts (Phase 10)
- Mobile app
- Voice interface
- Local models
- Social/competitive features

---

## Verification Checklist

- [ ] `npm run typecheck` passes with all new files
- [ ] `npm run lint` passes with all new files
- [ ] `npm run build` succeeds
- [ ] `npm run test:study-mastery` still passes (enhanced, not broken)
- [ ] `npm run test:study-service` still passes
- [ ] New analytics tests pass
- [ ] Existing tests still pass
- [ ] Browser: topic page shows mastery progress + next review
- [ ] Browser: session end shows analytics + study tips
- [ ] Browser: study hub shows overall progress
