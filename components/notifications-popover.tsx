"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Notification } from "@/lib/notifications/types";

interface ApiResponse {
  notifications: Notification[];
  unreadCount: number;
}

const TYPE_ICON: Record<Notification["type"], string> = {
  reminder: "schedule",
  mission: "task",
  summary: "insights",
  processing_complete: "description",
};

function timeAgo(date: string): string {
  const then = new Date(date).getTime();
  if (Number.isNaN(then)) return "";
  const diff = Math.floor((Date.now() - then) / 1000);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function classNames(...classes: (string | false | undefined | null)[]) {
  return classes.filter(Boolean).join(" ");
}

async function fetchNotifications(): Promise<ApiResponse> {
  const res = await fetch("/api/notifications", { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to load notifications");
  return res.json();
}

export function NotificationsPopover() {
  const router = useRouter();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  async function refresh() {
    try {
      const data = await fetchNotifications();
      setNotifications(data.notifications);
      setUnreadCount(data.unreadCount);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  useEffect(() => {
    async function tick() {
      await refresh();
    }
    tick();
    const id = setInterval(tick, 30000);
    return () => clearInterval(id);
  }, []);

  // Close on Escape / outside click while open.
  useEffect(() => {
    if (!open) return;

    function onKeydown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }

    function onPointer(e: MouseEvent) {
      const target = e.target as Node;
      const btn = buttonRef.current;
      const panel = panelRef.current;
      if (btn && !btn.contains(target) && panel && !panel.contains(target)) {
        setOpen(false);
      }
    }

    document.addEventListener("keydown", onKeydown);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKeydown);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [open]);

  async function markRead(id: string) {
    const wasUnread = !!notifications.find((n) => n.id === id && n.read_at === null);
    setNotifications((n) => n.filter((x) => x.id !== id));
    if (wasUnread) setUnreadCount((c) => Math.max(0, c - 1));

    try {
      const res = await fetch(`/api/notifications/${id}/read`, {
        method: "POST",
        cache: "no-store",
      });
      if (!res.ok) throw new Error("Failed to mark notification read");
    } catch (err) {
      console.error((err as Error).message);
      refresh();
    }
  }

  async function markAllRead() {
    const unreadVisible = notifications.filter((n) => n.read_at === null);
    setNotifications((n) =>
      n.map((x) => (x.read_at === null ? { ...x, read_at: "1970-01-01T00:00:00Z" } : x)),
    );
    setUnreadCount(0);

    try {
      await Promise.all(
        unreadVisible.map((n) =>
          fetch(`/api/notifications/${n.id}/read`, {
            method: "POST",
            cache: "no-store",
          }),
        ),
      );
    } catch (err) {
      console.error((err as Error).message);
    }
    refresh();
  }

  async function handleNotificationClick(notification: Notification) {
    if (notification.read_at === null) {
      await markRead(notification.id);
    }
    if (notification.link) {
      router.push(notification.link);
    } else {
      setOpen(false);
    }
  }

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={
          unreadCount > 0
            ? `${unreadCount} unread notifications. Open notifications`
            : "Notifications. Open notifications"
        }
        aria-haspopup="menu"
        aria-expanded={open}
        className="relative w-8 h-8 rounded-lg bg-surface-container-low border border-surface-container-high text-on-surface-variant hover:text-on-surface hover:bg-surface-container flex items-center justify-center transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-surface-container-low"
      >
        <span className="material-symbols-outlined text-[18px]">
          notifications
        </span>
        {unreadCount > 0 && (
          <span
            className="absolute -top-0.5 -right-0.5 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-error-crimson text-[10px] font-bold text-on-error px-0.5 leading-none"
            aria-label={`${unreadCount} unread`}
          >
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          ref={panelRef}
          role="menu"
          aria-label="Notifications menu"
          aria-orientation="vertical"
          className="absolute right-0 top-full mt-2 w-80 max-w-[calc(100vw-1rem)] z-[var(--z-popover)] bg-surface-container border border-surface-container-high rounded-xl shadow-2xl flex flex-col max-h-[60vh] outline-none"
        >
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-surface-container-high">
            <h3 className="text-sm font-semibold text-on-surface">
              Notifications
            </h3>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={markAllRead}
                aria-label="Mark all notifications as read"
                className="text-xs font-medium text-primary hover:opacity-80 transition-opacity"
              >
                Mark all read
              </button>
            )}
          </div>

          {error && (
            <div className="px-4 py-2 text-xs text-error-crimson flex items-center gap-1.5">
              <span className="material-symbols-outlined text-[16px]">
                error
              </span>
              <span>{error}</span>
            </div>
          )}

          <div className="flex-1 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="px-4 py-6 text-center text-xs text-on-surface-variant">
                <span className="material-symbols-outlined text-[24px] text-outline mb-1 block">
                  notifications_none
                </span>
                <p>No notifications yet.</p>
              </div>
            ) : (
              <ul className="py-1">
                {notifications.map((notification) => (
                  <li key={notification.id}>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => handleNotificationClick(notification)}
                      aria-label={
                        notification.read_at
                          ? `${notification.title}, read`
                          : `${notification.title}, unread. Mark as read`
                      }
                      className={classNames(
                        "w-full flex items-start gap-2.5 px-4 py-2.5 text-left rounded-none focus:outline-none focus:bg-surface-container-high/40",
                        notification.read_at
                          ? "text-on-surface-variant"
                          : "text-on-surface bg-surface-container-low/40",
                      )}
                    >
                      <span
                        className="material-symbols-outlined text-[18px] text-outline mt-0.5 flex-shrink-0"
                        aria-hidden="true"
                      >
                        {TYPE_ICON[notification.type]}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <span
                            className={classNames(
                              "text-sm font-medium truncate",
                              notification.read_at
                                ? "text-on-surface-variant"
                                : "text-on-surface",
                            )}
                          >
                            {notification.title}
                          </span>
                          <span className="text-[10px] text-outline font-mono">
                            {timeAgo(notification.created_at)}
                          </span>
                        </div>
                        <p className="mt-0.5 text-xs text-on-surface-variant line-clamp-2">
                          {notification.message}
                        </p>
                      </div>
                      {notification.read_at === null && (
                        <span
                          className="mt-0.5 flex-shrink-0 w-1.5 h-1.5 rounded-full bg-primary"
                          aria-hidden="true"
                        />
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <button
            type="button"
            role="menuitem"
            onClick={() => router.push("/study")}
            className="flex items-center justify-center gap-1.5 px-4 py-2.5 border-t border-surface-container-high text-xs font-medium text-on-surface-variant hover:bg-surface-container hover:text-on-surface transition-colors"
          >
            <span>Go to Study Hub</span>
            <span className="material-symbols-outlined text-[14px]">
              arrow_forward
            </span>
          </button>
        </div>
      )}
    </div>
  );
}
