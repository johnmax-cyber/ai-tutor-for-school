"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { SignOutButton } from "@/components/sign-out-button";
import { cn } from "./cn";

const navigationItems = [
  { name: "Dashboard", href: "/dashboard", icon: "dashboard", iconOutline: "dashboard_outline" },
  { name: "Library", href: "/library", icon: "library_books", iconOutline: "library_books_outline" },
  { name: "Topics", href: "/topics", icon: "category", iconOutline: "category_outline" },
  { name: "AI Tutor", href: "/tutor", icon: "psychology", iconOutline: "psychology_outline" },
  { name: "Study", href: "/study", icon: "school", iconOutline: "school_outline" },
  { name: "Progress", href: "/progress", icon: "tracking", iconOutline: "tracking_outline" },
];

interface NavigationProps {
  isExpanded: boolean;
  onToggleExpanded: () => void;
  pathname: string;
}

export function Navigation({ 
  isExpanded, 
  onToggleExpanded, 
  pathname 
}: NavigationProps) {
  return (
    <nav className={`flex flex-col h-full bg-surface-container-low border-r border-border w-[${isExpanded ? 240 : 64}px]`}>
      <div className="flex-1 overflow-y-auto">
        <div className="p-4">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-xl font-bold text-on-surface flex items-center gap-2">
              <span className="material-symbols-outlined text-primary text-[24px]">
                psychology
              </span>
              <span className="hidden sm:inline">Cognita.ai</span>
            </h1>
            <button
              onClick={onToggleExpanded}
              className={cn(
                "p-1 rounded hover:bg-surface-container/30 transition-colors",
                isExpanded
                  ? "text-primary"
                  : "text-on-surface-variant hover:text-on-surface"
              )}
              aria-label={isExpanded ? "Collapse navigation" : "Expand navigation"}
            >
              <span className="material-symbols-outlined text-[20px]">
                {isExpanded ? "menu" : "menu_open"}
              </span>
            </button>
          </div>

          <ul className="space-y-1.5">
            {navigationItems.map((item) => {
              const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className={cn(
                      "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all",
                      isActive
                        ? "bg-primary/10 text-primary"
                        : "text-on-surface-variant hover:text-on-surface hover:bg-surface-container"
                    )}
                  >
                    <span className={`material-symbols-outlined text-[20px] shrink-0 ${
                      isActive 
                        ? "text-primary" 
                        : "text-on-surface-variant"
                    }`}>
                      {isActive ? item.icon : item.iconOutline}
                    </span>
                    <span className="hidden sm:inline">
                      {isExpanded ? item.name : null}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      </div>

      <div className="p-4 border-t border-border">
        <SignOutButton />
      </div>
    </nav>
  );
}

export function MobileNav({ open, onClose }: { open: boolean; onClose: () => void }) {
  const pathname = usePathname();

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 md:hidden">
      <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" onClick={onClose} />
      <div className="absolute left-0 top-0 h-full w-64 bg-surface-container-low border-r border-border p-4">
        <div className="mb-6">
          <h1 className="text-xl font-bold text-on-surface flex items-center gap-2">
            <span className="material-symbols-outlined text-primary text-[24px]">
              psychology
            </span>
            Cognita.ai
          </h1>
        </div>

        <nav className="space-y-1.5">
          {navigationItems.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onClose}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all",
                  isActive
                    ? "bg-primary/10 text-primary"
                    : "text-on-surface-variant hover:text-on-surface hover:bg-surface-container"
                )}
              >
                <span className={`material-symbols-outlined text-[20px] shrink-0 ${
                  isActive 
                    ? "text-primary" 
                    : "text-on-surface-variant"
                }`}>
                  {isActive ? item.icon : item.iconOutline}
                </span>
                <span>{item.name}</span>
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
