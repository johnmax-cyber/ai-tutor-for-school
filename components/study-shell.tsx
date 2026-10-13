"use client";

import { FC, ReactNode } from "react";

export interface StudyShellProps {
  breadcrumbs?: { label: string; href?: string }[];
  activeTopicName?: string;
  children: ReactNode;
}

export const StudyShell: FC<StudyShellProps> = ({ breadcrumbs = [], children }) => {
  return (
    <div className="space-y-6">
      {breadcrumbs.length > 0 && (
        <nav className="flex items-center gap-2 text-sm">
          {breadcrumbs.map((crumb, index) => {
            const isLast = index === breadcrumbs.length - 1;
            return (
              <div key={crumb.href ?? index} className="flex items-center gap-1.5">
                {index > 0 && (
                  <span className="material-symbols-outlined text-[14px] text-outline">
                    chevron_right
                  </span>
                )}
                {crumb.href && !isLast ? (
                  <a
                    href={crumb.href}
                    className="text-primary hover:underline"
                  >
                    {crumb.label}
                  </a>
                ) : (
                  <span className="text-on-surface">{crumb.label}</span>
                )}
              </div>
            );
          })}
        </nav>
      )}
      {children}
    </div>
  );
};