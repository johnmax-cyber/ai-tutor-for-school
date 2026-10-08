import React from "react";
import { createPortal } from "react-dom";
import { cn } from "./cn";

export interface DropdownItem {
  label: string;
  icon?: string;
  onClick?: () => void;
  disabled?: boolean;
  destructive?: boolean;
}

export interface DropdownProps {
  trigger: React.ReactElement<React.ButtonHTMLAttributes<HTMLElement>>;
  items: DropdownItem[];
  align?: "start" | "center" | "end";
  className?: string;
}

export function Dropdown({ trigger, items, align = "end", className }: DropdownProps) {
  const [open, setOpen] = React.useState(false);
  const triggerRef = React.useRef<HTMLElement | null>(null);
  const menuRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    function onKeydown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    function onClick(e: MouseEvent) {
      const target = e.target as Node;
      if (
        open &&
        triggerRef.current &&
        menuRef.current &&
        !triggerRef.current.contains(target) &&
        !menuRef.current.contains(target)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("keydown", onKeydown);
    document.addEventListener("mousedown", onClick);
    return () => {
      document.removeEventListener("keydown", onKeydown);
      document.removeEventListener("mousedown", onClick);
    };
  }, [open]);

  const triggerWithProps = React.cloneElement(trigger, {
    ref: triggerRef,
    onClick: (e: React.MouseEvent<HTMLElement>) => {
      trigger.props.onClick?.(e);
      setOpen((o) => !o);
    },
    "aria-haspopup": "menu",
    "aria-expanded": open,
  } as React.RefAttributes<HTMLElement> & React.HTMLAttributes<HTMLElement>);

  return (
    <>
      {triggerWithProps}
      {open &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            className={cn(
              "fixed z-[var(--ds-z-dropdown)] min-w-48 rounded-lg border border-border bg-surface-container-high py-1 shadow-lg",
              align === "start" && "origin-top-left",
              align === "center" && "origin-top",
              align === "end" && "origin-top-right",
              className,
            )}
          >
            {items.map((item) => (
              <button
                key={item.label}
                role="menuitem"
                disabled={item.disabled}
                onClick={() => {
                  item.onClick?.();
                  setOpen(false);
                }}
                className={cn(
                  "w-full flex items-center gap-2 px-3 py-1.5 text-sm text-left hover:bg-surface-container focus:outline-none focus:bg-surface-container",
                  item.destructive &&
                    "text-error hover:bg-error/10 focus:bg-error/10",
                  item.disabled && "opacity-50 cursor-not-allowed",
                )}
              >
                {item.icon && (
                  <span className="material-symbols-outlined text-sm" aria-hidden="true">
                    {item.icon}
                  </span>
                )}
                {item.label}
              </button>
            ))}
          </div>,
          document.body,
        )}
    </>
  );
}
