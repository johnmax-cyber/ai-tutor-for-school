"use client";

import { FC, ReactNode } from "react";

export interface StudyShellProps {
  breadcrumbs?: { label: string; href?: string }[];
  children: ReactNode;
}

export const StudyShell: FC<StudyShellProps> = ({ breadcrumbs, children }) => {
  return (
    <div className="min-h-screen bg-background p-4">
      {breadcrumbs?.length > 0 && (
        <nav className="mb-6">
          <ul className="flex space-x-2 flex-wrap">
            {breadcrumbs.map((crumb) => {
              return (
                <li className="flex items-center gap-1.5 text-sm">
                  <a
                    href={crumb.href ?? "/"}
                    className="text-primary hover:underline"
                  >
                    {crumb.label}
                  </a>
                </li>
              );
            })}
          </ul>
        </nav>
      )}
      <div className="prose max-w-none">{children}</div>
    </div>
  );
};