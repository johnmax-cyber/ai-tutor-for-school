"use client";

import React from "react";
import { cn } from "./cn";

export interface TabsProps {
  defaultValue?: string;
  value?: string;
  onValueChange?: (value: string) => void;
  children: React.ReactNode;
  className?: string;
}

export interface TabsListProps {
  children: React.ReactNode;
  className?: string;
}

export interface TabsTriggerProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  value: string;
  children: React.ReactNode;
}

export interface TabsContentProps extends React.HTMLAttributes<HTMLDivElement> {
  value: string;
  children: React.ReactNode;
}

const TabsContext = React.createContext<{
  value: string;
  onValueChange: (v: string) => void;
} | null>(null);

export function Tabs({ defaultValue, value, onValueChange, children, className }: TabsProps) {
  const isControlled = value !== undefined;
  const [internalValue, setInternalValue] = React.useState(defaultValue ?? "");
  const currentValue = isControlled ? value! : internalValue;

  const ctx = React.useMemo(
    () => ({
      value: currentValue,
      onValueChange: (v: string) => {
        if (!isControlled) setInternalValue(v);
        onValueChange?.(v);
      },
    }),
    [currentValue, isControlled, onValueChange],
  );

  return (
    <TabsContext.Provider value={ctx}>
      <div className={cn("w-full", className)}>{children}</div>
    </TabsContext.Provider>
  );
}

export function TabsList({ children, className }: TabsListProps) {
  return (
    <div
      className={cn(
        "inline-flex items-center gap-1 rounded-lg bg-surface-container p-1 text-foreground-secondary",
        className,
      )}
      role="tablist"
    >
      {children}
    </div>
  );
}

export function TabsTrigger({ value, children, className, ...props }: TabsTriggerProps) {
  const ctx = React.useContext(TabsContext);
  if (!ctx) throw new Error("TabsTrigger must be used within Tabs");
  const active = ctx.value === value;

  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      aria-controls={undefined}
      id={`tab-${value}`}
      onClick={() => ctx.onValueChange(value)}
      className={cn(
        "flex-1 whitespace-nowrap px-3 py-1.5 text-sm font-medium transition-all rounded-md focus:outline-none focus:ring-2 focus:ring-(color: var(--focus-ring))",
        active
          ? "bg-surface-container-low text-foreground shadow-sm"
          : "hover:bg-surface-container/50",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export function TabsContent({ value, children, className, ...props }: TabsContentProps) {
  const ctx = React.useContext(TabsContext);
  if (!ctx) throw new Error("TabsContent must be used within Tabs");
  if (ctx.value !== value) return null;

  return (
    <div
      role="tabpanel"
      id={`panel-${value}`}
      aria-labelledby={`tab-${value}`}
      className={cn("pt-4", className)}
      {...props}
    >
      {children}
    </div>
  );
}
