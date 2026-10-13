"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

interface Preferences {
  user_id: string;
  study_reminders_enabled: boolean;
  reminder_time: string;
  daily_mission_enabled: boolean;
  weekly_summary_enabled: boolean;
  processing_retry_enabled: boolean;
  updated_at: string;
}

const TOGGLE_FIELDS = [
  {
    key: "study_reminders_enabled",
    label: "Study Reminders",
    description: "Get reminded to review topics on schedule.",
    icon: "schedule",
  },
  {
    key: "daily_mission_enabled",
    label: "Daily Mission",
    description: "Receive a focused review mission each day.",
    icon: "task",
  },
  {
    key: "weekly_summary_enabled",
    label: "Weekly Summary",
    description: "Receive a recap of your study week.",
    icon: "insights",
  },
  {
    key: "processing_retry_enabled",
    label: "Processing Retry",
    description: "Automatically retry failed PDF processing.",
    icon: "autore_refresh",
  },
] as const;

function normalizeTime(value: string): string {
  if (/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) return value;
  const m = value.match(/^([01]\d|2[0-3]):[0-5]\d:[0-5]\d$/);
  return m ? value.slice(0, 5) : value;
}

export default function SettingsPage() {
  const router = useRouter();
  const [authenticated, setAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [prefs, setPrefs] = useState<Preferences | null>(null);
  const [form, setForm] = useState<Record<string, boolean>>({});
  const [reminderTime, setReminderTime] = useState("09:00");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<"success" | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    async function checkAuth() {
      try {
        const supabase = createClient();
        const { data: { user }, error } = await supabase.auth.getUser();
        if (error || !user) {
          router.replace("/login");
          return;
        }
        setAuthenticated(true);
        setLoading(false);
       } catch (_e) {
         router.replace("/login");
       }
    }
    checkAuth();
  }, [router]);

  useEffect(() => {
    async function loadPrefs() {
      if (!authenticated) return;
      try {
        const supabase = createClient();
        const { data: { user }, error } = await supabase.auth.getUser();
        if (error || !user) {
          router.replace("/login");
          return;
        }
        const res = await fetch("/api/preferences", { cache: "no-store" });
        if (!res.ok) throw new Error("Failed to load preferences");
        const data = await res.json();
        setPrefs(data.preferences);
        setReminderTime(normalizeTime(data.preferences.reminder_time));
        setForm({
          study_reminders_enabled: data.preferences.study_reminders_enabled,
          daily_mission_enabled: data.preferences.daily_mission_enabled,
          weekly_summary_enabled: data.preferences.weekly_summary_enabled,
          processing_retry_enabled: data.preferences.processing_retry_enabled,
        });
      } catch (err) {
        setErrorMsg((err as Error).message);
      }
    }
     loadPrefs();
   }, [authenticated, router]);

  async function save() {
    if (!prefs) return;
    setSaving(true);
    setMessage(null);
    setErrorMsg(null);

    const body: Record<string, unknown> = {
      study_reminders_enabled:
        form.study_reminders_enabled ?? prefs.study_reminders_enabled,
      daily_mission_enabled:
        form.daily_mission_enabled ?? prefs.daily_mission_enabled,
      weekly_summary_enabled:
        form.weekly_summary_enabled ?? prefs.weekly_summary_enabled,
      processing_retry_enabled:
        form.processing_retry_enabled ?? prefs.processing_retry_enabled,
      reminder_time: reminderTime,
    };

    try {
      const res = await fetch("/api/preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        cache: "no-store",
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error((json && json.error) || "Failed to save preferences");
      }
      setPrefs(json.preferences);
      setForm({
        study_reminders_enabled: json.preferences.study_reminders_enabled,
        daily_mission_enabled: json.preferences.daily_mission_enabled,
        weekly_summary_enabled: json.preferences.weekly_summary_enabled,
        processing_retry_enabled: json.preferences.processing_retry_enabled,
      });
      setReminderTime(normalizeTime(json.preferences.reminder_time));
      setMessage("success");
    } catch (err) {
      setErrorMsg((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-surface text-on-surface flex items-center justify-center">
        <span className="material-symbols-outlined text-[32px] text-primary animate-spin">
          progress_activity
        </span>
      </div>
    );
  }

  if (!authenticated) {
    return null;
  }

  return (
    <div className="min-h-screen bg-surface text-on-surface flex flex-col font-sans">
      <div className="max-w-3xl mx-auto w-full p-4 sm:p-6 lg:p-8">
        <header className="flex items-center gap-3 pb-4 mb-6 border-b border-surface-container-high">
          <Link
            href="/study"
            className="w-8 h-8 rounded-lg bg-surface-container-low border border-surface-container-high text-on-surface-variant hover:text-on-surface hover:bg-surface-container flex items-center justify-center transition-colors"
            aria-label="Back to Study"
          >
            <span className="material-symbols-outlined text-[18px]">
              arrow_back
            </span>
          </Link>
          <h1 className="text-2xl font-bold text-on-surface flex items-center gap-2">
            <span className="material-symbols-outlined text-[24px] text-primary">
              settings
            </span>
            <span>Settings</span>
          </h1>
        </header>

        {errorMsg && (
          <div
            className="mb-4 p-3 rounded-lg bg-error-container/20 border border-error-crimson/30 text-error-crimson text-sm flex items-center gap-2"
            role="alert"
          >
            <span className="material-symbols-outlined text-[18px]">
              error
            </span>
            <span>{errorMsg}</span>
          </div>
        )}

        {message === "success" && (
          <div className="mb-4 p-3 rounded-lg bg-secondary-container/20 border border-secondary/30 text-on-secondary font-medium text-sm flex items-center gap-2">
            <span className="material-symbols-outlined text-[18px]">
              check_circle
            </span>
            <span>Preferences saved.</span>
          </div>
        )}

        <div className="space-y-6">
          <div className="p-5 rounded-xl bg-surface-container-low border border-surface-container-high space-y-4">
            <h2 className="text-base font-semibold text-on-surface flex items-center gap-2">
              <span className="material-symbols-outlined text-[20px] text-primary">
                notifications
              </span>
              <span>Automation Features</span>
            </h2>
            <p className="text-xs text-on-surface-variant">
              Features powered by the n8n automation workflows. Toggling these
              controls which background jobs run on your behalf.
            </p>

            <div className="flex flex-col gap-3 pt-1">
              {TOGGLE_FIELDS.map((field) => {
                const enabled = !!form[field.key];
                return (
                  <div
                    key={field.key}
                    className="flex items-start justify-between gap-3"
                  >
                    <div className="flex items-start gap-2.5">
                      <span
                        className="material-symbols-outlined text-[20px] text-outline"
                        aria-hidden="true"
                      >
                        {field.icon}
                      </span>
                      <div>
                        <label className="text-sm font-medium text-on-surface">
                          {field.label}
                        </label>
                        <p className="text-xs text-on-surface-variant mt-0.5">
                          {field.description}
                        </p>
                      </div>
                    </div>
                    <label className="inline-flex h-6 w-11 items-center rounded-full transition-colors relative flex-shrink-0">
                      <input
                        type="checkbox"
                        checked={enabled}
                        onChange={() => {
                          setForm((prev) => ({
                            ...prev,
                            [field.key]: !prev[field.key],
                          }));
                          setMessage(null);
                          setErrorMsg(null);
                        }}
                        aria-label={enabled ? `Disable ${field.label}` : `Enable ${field.label}`}
                        className="sr-only"
                      />
                      <span
                        className={
                          enabled
                            ? "bg-secondary"
                            : "bg-surface-container-high"
                        }
                      >
                        <span
                          className={
                            "inline-block h-5 w-5 transform rounded-full bg-surface shadow ring-0 transition-transform duration-200 " +
                            (enabled ? "translate-x-5" : "translate-x-0.5")
                        }
                        />
                      </span>
                    </label>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="p-5 rounded-xl bg-surface-container-low border border-surface-container-high space-y-4">
            <h2 className="text-base font-semibold text-on-surface flex items-center gap-2">
              <span className="material-symbols-outlined text-[20px] text-primary">
                schedule
              </span>
              <span>Reminder Time</span>
            </h2>
            <div className="flex items-end gap-3">
              <div className="flex flex-col gap-1">
                <label
                  htmlFor="reminder-time"
                  className="text-xs text-on-surface-variant"
                >
                  Daily reminder at
                </label>
                <input
                  id="reminder-time"
                  type="time"
                  value={reminderTime}
                  onChange={(e) => {
                    setReminderTime(e.target.value ?? "09:00");
                    setMessage(null);
                    setErrorMsg(null);
                  }}
                  className="bg-surface-container border border-surface-container-high rounded-lg px-3 py-1.5 text-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>
              <span className="text-xs text-on-surface-variant mb-0.5">
                (your local time)
              </span>
            </div>
          </div>

          <div className="flex items-center justify-between pt-2">
            <span className="text-xs text-on-surface-variant">
              Changes are local until you save.
            </span>
            <div className="flex items-center gap-2">
              <Link
                href="/study"
                className="px-4 py-2 rounded-lg text-sm font-medium text-on-surface-variant hover:bg-surface-container hover:text-on-surface transition-colors"
              >
                Cancel
              </Link>
              <button
                type="button"
                onClick={save}
                disabled={saving}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary text-on-primary font-medium text-sm hover:opacity-90 transition-opacity disabled:opacity-60"
                aria-busy={saving}
              >
                {saving && (
                  <span className="material-symbols-outlined text-[16px] animate-spin">
                    progress_activity
                  </span>
                )}
                <span>{saving ? "Saving…" : "Save"}</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}