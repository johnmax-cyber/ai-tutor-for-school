import { StudyShell } from "@/components/study-shell";
import Link from "next/link";

export default function ReviewPage() {
  return (
    <StudyShell
      breadcrumbs={[
        { label: "Mistakes / Review", href: "/review" },
      ]}
    >
      <div className="max-w-2xl mx-auto space-y-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 py-8 px-4 bg-surface-container-low rounded-xl border border-surface-container-high shadow-sm">
          <div>
            <span className="material-symbols-outlined text-primary text-[48px]">
              build
            </span>
          </div>
          <div className="flex-1">
            <h1 className="text-2xl sm:text-3xl font-bold text-on-surface flex items-center gap-3">
              <span className="material-symbols-outlined text-[28px]">psychology_alt</span>
              <span>Mistakes &amp; Review</span>
            </h1>
            <p className="text-sm text-on-surface-variant mt-2">
              Review your mistakes, strengthen weak areas, and optimize your study sessions
              with targeted practice based on your learning patterns.
            </p>
          </div>
        </div>

        <div className="p-6 rounded-xl bg-surface-container-low border border-surface-container-high">
          <h2 className="text-lg font-semibold text-on-surface mb-4 flex items-center gap-2">
            <span className="material-symbols-outlined text-primary text-[20px]">
              info
            </span>
            <span>Coming Soon</span>
          </div>
          <p className="text-on-surface-variant">
            The Review system will help you identify patterns in your mistakes, track which
            concepts need more attention, and create personalized review sessions to
            maximize retention and understanding.
          </p>
          <div className="mt-6 flex items-center gap-3">
            <Link
              href="/study"
              className="px-4 py-2 rounded-lg bg-primary text-on-primary text-sm font-medium hover:opacity-90 transition-opacity"
            >
              Start Reviewing Now
            </Link>
          </div>
        </div>
      </div>
    </StudyShell>
  );
}