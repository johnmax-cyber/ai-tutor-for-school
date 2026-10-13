import { Suspense } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { StudyShell } from "@/components/study-shell";
import { Card, Icon, Alert, Skeleton, EmptyState, ErrorState } from "@/components/ui";
import type { EmbeddingUsageReport } from "@/lib/usage/analytics";

export const dynamic = "force-dynamic";

const numberFormat = (n: number) => n.toLocaleString("en-US");

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <Card variant="default" padding="sm" className="text-center">
      <div className="text-xs text-foreground-secondary font-mono">{label}</div>
      <div className="text-2xl font-bold text-on-surface mt-1">
        {numberFormat(value)}
      </div>
    </Card>
  );
}

function UsageBars({ report }: { report: EmbeddingUsageReport }) {
  const max = Math.max(0, ...report.series.map((d) => d.tokens));
  return (
    <div className="space-y-2">
      {report.series.map((day) => {
        const width = max > 0 ? Math.round((day.tokens / max) * 100) : 0;
        return (
          <div key={day.date} className="flex items-center gap-3 text-xs font-mono">
            <span className="w-20 text-outline shrink-0">{day.date}</span>
            <div className="flex-1 h-3 rounded bg-surface-container-high overflow-hidden">
              <div
                className="h-full bg-primary"
                style={{ width: `${width}%` }}
              />
            </div>
            <span className="w-40 text-on-surface-variant text-right shrink-0">
              {numberFormat(day.tokens)} tok · {numberFormat(day.chunks)} chunks · {numberFormat(day.requests)} req
            </span>
          </div>
        );
      })}
    </div>
  );
}

function DashboardContent({ userId }: { userId: string }) {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <DashboardData userId={userId} />
    </Suspense>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-8">
      <div className="pb-4 border-b border-surface-container-high">
        <Skeleton variant="text" className="h-8 w-48 mb-2" />
        <Skeleton variant="text" className="h-4 w-64" />
      </div>
      <Card padding="md">
        <Skeleton variant="text" className="h-4 w-16 mb-4" />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      </Card>
    </div>
  );
}

async function DashboardData({ userId }: { userId: string }) {
  const supabase = await createClient();

  let report: EmbeddingUsageReport | null = null;
  let loadFailed = false;

  try {
    const { getEmbeddingUsageSummary } = await import("@/lib/usage/analytics");
    report = await getEmbeddingUsageSummary(supabase, userId);
  } catch (err) {
    loadFailed = true;
    console.error("[dashboard] embedding usage load failed", err);
  }

  if (loadFailed) {
    return (
      <ErrorState
        title="Could not load usage data"
        description="Try again later."
      />
    );
  }

  if (!report || report.totalRequests === 0) {
    return (
      <EmptyState
        title="No embedding usage yet"
        description="Usage appears after resources are embedded."
        icon="analytics"
      />
    );
  }

  return (
    <>
      {report.truncated && (
        <Alert variant="info" icon={false}>
          Showing most recent data only.
        </Alert>
      )}

      <Card variant="default" padding="md" className="space-y-4">
        <h2 className="text-base font-semibold text-on-surface">
          Totals (30 days)
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <StatCard label="Tokens" value={report.totalTokens} />
          <StatCard label="Chunks" value={report.totalChunks} />
          <StatCard label="Requests" value={report.totalRequests} />
          <StatCard
            label="Errors"
            value={report.byStatus.find((s) => s.status === "error")?.count ?? 0}
          />
        </div>
      </Card>

      <Card variant="default" padding="md" className="space-y-4">
        <h2 className="text-base font-semibold text-on-surface">By model</h2>
        <div className="divide-y divide-surface-container-high">
          {report.byModel.map((m) => (
            <div
              key={m.model}
              className="py-2 flex flex-wrap justify-between gap-2 text-sm"
            >
              <span className="font-mono text-on-surface truncate">{m.model}</span>
              <span className="text-outline font-mono">
                {numberFormat(m.tokens)} tok · {numberFormat(m.chunks)} chunks · {numberFormat(m.requests)} req
              </span>
            </div>
          ))}
        </div>
      </Card>

      <Card variant="default" padding="md" className="space-y-4">
        <h2 className="text-base font-semibold text-on-surface">
          Last 7 days (UTC)
        </h2>
        <UsageBars report={report} />
      </Card>
    </>
  );
}

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <StudyShell>
      <div className="space-y-8">
        <div className="pb-4 border-b border-surface-container-high">
          <h1 className="text-2xl sm:text-3xl font-bold text-on-surface flex items-center gap-2.5">
            <Icon name="dashboard" size="xl" />
            <span>Dashboard</span>
          </h1>
          <p className="text-xs sm:text-sm text-on-surface-variant mt-1">
            Embedding usage over the last 30 days.
          </p>
        </div>

        <DashboardContent userId={user.id} />
      </div>
    </StudyShell>
  );
}