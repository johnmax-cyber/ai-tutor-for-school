"use client";

import { ReactNode, useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Navigation } from "@/components/ui/nav";

interface AuthenticatedLayoutProps {
  children: ReactNode;
  breadcrumbs?: { label: string; href?: string }[];
  _activeTopicName?: string;
}

export function AuthenticatedLayout({
  children,
  breadcrumbs = [],
}: AuthenticatedLayoutProps) {
  const [loading, setLoading] = useState(true);
  const [isSidebarExpanded, setIsSidebarExpanded] = useState(false);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const checkAuth = async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push("/login");
      } else {
        setLoading(false);
      }
    };
    checkAuth();
  }, [router]);

  if (loading) {
    return (
      <div className="flex min-h-screen bg-background text-on-surface items-center justify-center">
        <span className="material-symbols-outlined text-[36px] text-primary animate-spin">
          progress_activity
        </span>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-background text-on-surface">
      {/* Desktop Sidebar */}
      <nav className="hidden md:flex md:flex-col md:fixed md:inset-y-0 md:z-40 bg-surface-container-low border-r border-border">
        <Navigation 
          isExpanded={isSidebarExpanded} 
          onToggleExpanded={() => setIsSidebarExpanded(!isSidebarExpanded)}
          pathname={pathname} 
        />
      </nav>

      {/* Mobile Bottom Navigation */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-background/95 backdrop-blur-sm border-t border-surface-container-high z-50">
        <div className="grid grid-cols-5">
          <Link
            href="/dashboard"
            className={`flex flex-col items-center gap-1 px-2 py-2 text-xs transition-colors ${
              pathname === "/dashboard"
                ? "text-primary"
                : "text-on-surface-variant hover:text-primary"
            }`}
          >
            <span className="material-symbols-outlined text-[22px]">dashboard</span>
            <span className="text-[10px]">Dashboard</span>
          </Link>
          <Link
            href="/library"
            className={`flex flex-col items-center gap-1 px-2 py-2 text-xs transition-colors ${
              pathname === "/library"
                ? "text-primary"
                : "text-on-surface-variant hover:text-primary"
            }`}
          >
            <span className="material-symbols-outlined text-[22px]">library_books</span>
            <span className="text-[10px]">Library</span>
          </Link>
          <Link
            href="/study"
            className={`flex flex-col items-center gap-1 px-2 py-2 text-xs transition-colors ${
              pathname === "/study"
                ? "text-primary"
                : "text-on-surface-variant hover:text-primary"
            }`}
          >
            <span className="material-symbols-outlined text-[22px]">flash_on</span>
            <span className="text-[10px]">Study</span>
          </Link>
          <Link
            href="/tutor"
            className={`flex flex-col items-center gap-1 px-2 py-2 text-xs transition-colors ${
              pathname === "/tutor"
                ? "text-primary"
                : "text-on-surface-variant hover:text-primary"
            }`}
          >
            <span className="material-symbols-outlined text-[22px]">smart_toy</span>
            <span className="text-[10px]">Tutor</span>
          </Link>
          <Link
            href="/settings"
            className={`flex flex-col items-center gap-1 px-2 py-2 text-xs transition-colors ${
              pathname === "/settings"
                ? "text-primary"
                : "text-on-surface-variant hover:text-primary"
            }`}
          >
            <span className="material-symbols-outlined text-[22px]">settings</span>
            <span className="text-[10px]">Settings</span>
          </Link>
        </div>
      </nav>

      <div className={`flex-1 flex flex-col md:ml-[${isSidebarExpanded ? 240 : 64}px] pb-16 md:pb-0`}>
        {breadcrumbs.length > 0 && (
          <nav className="flex items-center gap-2 px-4 py-3 border-b border-border bg-surface-container-low text-sm overflow-x-auto">
            {breadcrumbs.map((crumb, index) => {
              const isLast = index === breadcrumbs.length - 1;
              return (
                <div key={crumb.href ?? index} className="flex items-center gap-1.5 flex-shrink-0">
                  {index > 0 && (
                    <span className="material-symbols-outlined text-[14px] text-outline">
                      chevron_right
                    </span>
                  )}
                  {crumb.href && !isLast ? (
                    <Link
                      href={crumb.href}
                      className="text-primary hover:underline"
                    >
                      {crumb.label}
                    </Link>
                  ) : (
                    <span className="text-on-surface font-medium">{crumb.label}</span>
                  )}
                </div>
              );
            })}
          </nav>
        )}

        <main className="flex-1 overflow-y-auto">
          <div className="max-w-7xl mx-auto p-3 sm:p-4 md:p-6">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}