"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { UploadForm } from "@/components/upload-form";
import { NotificationsPopover } from "@/components/notifications-popover";
import { Button, IconButton, Dialog, DialogContent, Icon } from "@/components/ui";

interface BreadcrumbItem {
  label: string;
  href?: string;
}

interface StudyShellProps {
  children: React.ReactNode;
  breadcrumbs?: BreadcrumbItem[];
  activeTopicName?: string;
}

export function StudyShell({
  children,
  breadcrumbs,
  activeTopicName,
}: StudyShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [uploadModalOpen, setUploadModalOpen] = useState(false);

  const supabase = createClient();

  // Close mobile menu on Escape
  React.useEffect(() => {
    if (!mobileMenuOpen) return;
    function onKeydown(e: KeyboardEvent) {
      if (e.key === "Escape") setMobileMenuOpen(false);
    }
    document.addEventListener("keydown", onKeydown);
    return () => document.removeEventListener("keydown", onKeydown);
  }, [mobileMenuOpen]);

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  const navItems = [
    {
      label: "Study Library",
      href: "/library",
      icon: "local_library",
      active: pathname.startsWith("/library") || pathname === "/",
    },
    {
      label: "Subjects & Topics",
      href: "/topics",
      icon: "category",
      active: pathname.startsWith("/topics"),
    },
    {
      label: "Study Sessions",
      href: "/study",
      icon: "timer",
      active: pathname.startsWith("/study"),
    },
    {
      label: "AI Tutor",
      href: "/tutor",
      icon: "smart_toy",
      active: pathname.startsWith("/tutor"),
    },
  ];

  return (
    <div className="min-h-screen bg-surface text-on-surface flex flex-col font-sans">
      {/* Mobile Backdrop */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 bg-surface/80 backdrop-blur-sm z-40 lg:hidden"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar Navigation */}
      <aside
        className={`fixed left-0 top-0 h-full w-64 bg-surface-container-low border-r border-surface-container-high z-50 flex flex-col justify-between py-4 transition-transform duration-200 lg:translate-x-0 ${
          mobileMenuOpen ? "translate-x-0" : "-translate-x-full"
        }`}
        role="dialog"
        aria-modal="true"
        aria-label="Main navigation"
        aria-hidden={!mobileMenuOpen}
      >
        <div className="flex flex-col gap-6">
          {/* Logo & Brand - Academic Styling */}
          <div className="px-6 flex items-center justify-between h-10">
            <Link
              href="/library"
              className="flex items-center gap-2.5 text-on-surface group"
            >
              <div className="w-8 h-8 rounded-lg bg-primary/20 border border-primary/30 flex items-center justify-center text-primary group-hover:scale-105 transition-transform shadow-sm">
                <span className="material-symbols-outlined text-[20px]">
                  psychology
                </span>
              </div>
              <span className="font-semibold text-lg tracking-tight text-on-surface">
                Cognita<span className="text-primary font-bold">.ai</span>
              </span>
            </Link>
            <IconButton
              variant="ghost"
              size="md"
              icon={<Icon name="close" size="md" />}
              label="Close navigation"
              onClick={() => setMobileMenuOpen(false)}
            />
          </div>

          {/* Navigation Items - Academic Layout */}
          <nav className="flex flex-col gap-1 px-3">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileMenuOpen(false)}
                className={`flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                  item.active
                    ? "bg-primary/10 text-primary border border-primary/20 shadow-sm"
                    : "text-on-surface-variant hover:bg-surface-container hover:text-on-surface"
                }`}
              >
                <span
                  className={`material-symbols-outlined text-[20px] ${item.active ? "text-primary" : "text-on-surface-variant"}`}
                >
                  {item.icon}
                </span>
                <span className={item.active ? "font-semibold" : "font-medium"}>
                  {item.label}
                </span>
              </Link>
            ))}
          </nav>
        </div>

        {/* Sidebar Footer - Academic Status Panel */}
        <div className="px-3 flex flex-col gap-3">
          {/* Active Synthesis Status - Academic Theme */}
          <div className="mx-1 p-3 rounded-lg bg-surface-container border border-surface-container-high flex flex-col gap-2">
            <div className="flex items-center justify-between text-xs font-medium text-on-surface-variant">
              <span>Active Synthesis</span>
              <span className="text-secondary font-mono">Optimal</span>
            </div>
            <div className="w-full h-1.5 rounded-full bg-surface-container-high overflow-hidden">
              <div className="w-4/5 h-full bg-secondary rounded-full"></div>
            </div>
          </div>

          {/* Sign Out Button - Academic Styling */}
          <button
            onClick={handleSignOut}
            className="flex items-center gap-3 px-3.5 py-2 rounded-lg text-sm font-medium text-on-surface-variant hover:bg-surface-container hover:text-on-surface transition-colors w-full text-left border border-transparent hover:border-outline-variant/30"
          >
            <span className="material-symbols-outlined text-[20px]">
              logout
            </span>
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      {/* Main Viewport Container */}
      <div className="lg:pl-64 flex-1 flex flex-col min-w-0">
        {/* Top Header - Academic Style */}
        <header className="sticky top-0 h-16 bg-surface/95 backdrop-blur-xl border-b border-surface-container-high z-30 px-4 sm:px-6 flex items-center justify-between gap-4 shadow-sm">
          <div className="flex items-center gap-3 min-w-0">
            {/* Hamburger for mobile */}
            <IconButton
              variant="ghost"
              size="md"
              icon={<Icon name="menu" size="md" />}
              label="Open navigation"
              onClick={() => setMobileMenuOpen(true)}
            />

            {/* Context breadcrumb & active topic indicator - Academic Hierarchy */}
            <div className="flex items-center gap-2 text-sm text-on-surface-variant truncate">
              <span className="flex items-center gap-1 font-medium text-on-surface">
                <span className="material-symbols-outlined text-[18px] text-primary">
                  school
                </span>
                <span className="hidden sm:inline font-semibold">
                  Workspace
                </span>
              </span>
              <span className="material-symbols-outlined text-[16px] text-outline">
                chevron_right
              </span>
              <span className="text-on-surface font-semibold truncate">
                {breadcrumbs && breadcrumbs.length > 0
                  ? breadcrumbs[breadcrumbs.length - 1].label
                  : "Studio"}
              </span>

              {activeTopicName && (
                <div className="hidden md:flex items-center gap-1.5 ml-2 px-2.5 py-0.5 rounded-md bg-primary/10 border border-primary/20 text-xs font-medium text-primary truncate">
                  <span className="w-1.5 h-1.5 rounded-full bg-primary"></span>
                  <span className="truncate">{activeTopicName}</span>
                </div>
              )}
            </div>
          </div>

          {/* Right Header Actions - Academic Theme */}
          <div className="flex items-center gap-2 sm:gap-3">
            <Button
              variant="primary"
              size="md"
              icon={<Icon name="cloud_upload" size="md" />}
              onClick={() => setUploadModalOpen(true)}
            >
              Upload Material
            </Button>

            <Link
              href="/tutor"
              className="w-8 h-8 rounded-lg bg-surface-container-low border border-surface-container-high text-on-surface-variant hover:text-on-surface hover:bg-surface-container flex items-center justify-center transition-colors relative"
              title="Open AI Tutor"
            >
              <span className="material-symbols-outlined text-[18px] text-tertiary">
                smart_toy
              </span>
            </Link>

            <Link
              href="/settings"
              className="w-8 h-8 rounded-lg bg-surface-container-low border border-surface-container-high text-on-surface-variant hover:text-on-surface hover:bg-surface-container flex items-center justify-center transition-colors"
              title="Settings"
              aria-label="Settings"
            >
              <span className="material-symbols-outlined text-[18px]">
                settings
              </span>
            </Link>

            <NotificationsPopover />

            <div className="w-8 h-8 rounded-full bg-primary/10 border border-primary/30 flex items-center justify-center text-primary text-xs font-semibold">
              <span className="material-symbols-outlined text-[18px]">
                person
              </span>
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 bg-surface min-w-0">
          {children}
        </main>
      </div>

      {/* Upload Material Modal - Academic Styling */}
      <Dialog
        open={uploadModalOpen}
        onOpenChange={setUploadModalOpen}
        title="Upload Academic Material"
      >
        <DialogContent className="max-w-lg">
          <p className="text-sm text-on-surface-variant mb-4">
            Upload PDF notes, problem sets, or slides. Scanned documents will
            automatically undergo high-precision OCR processing.
          </p>
          <UploadForm />
        </DialogContent>
      </Dialog>
    </div>
  );
}
