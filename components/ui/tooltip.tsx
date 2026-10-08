import React from "react";
import { createPortal } from "react-dom";
import { cn } from "./cn";

export interface TooltipHandlerProps {
  onMouseEnter?: (e: React.MouseEvent) => void;
  onMouseLeave?: (e: React.MouseEvent) => void;
  onFocus?: (e: React.FocusEvent) => void;
  onBlur?: (e: React.FocusEvent) => void;
  onClick?: (e: React.MouseEvent) => void;
  ref?: React.Ref<HTMLElement>;
}

export interface TooltipProps {
  content: React.ReactNode;
  children: React.ReactElement<TooltipHandlerProps>;
  placement?: "top" | "bottom" | "left" | "right";
  className?: string;
}

export function Tooltip({ content, children, placement = "top", className }: TooltipProps) {
  const triggerRef = React.useRef<HTMLElement>(null);
  const [open, setOpen] = React.useState(false);
  const [coords, setCoords] = React.useState<{ top: number; left: number } | null>(null);

  function position() {
    const el = triggerRef.current;
    if (!el) {
      setCoords(null);
      return;
    }
    const rect = el.getBoundingClientRect();
    const offset = 8;
    let top = 0;
    let left = 0;
    switch (placement) {
      case "top":
        top = rect.top - offset;
        left = rect.left + rect.width / 2;
        break;
      case "bottom":
        top = rect.bottom + offset;
        left = rect.left + rect.width / 2;
        break;
      case "left":
        top = rect.top + rect.height / 2;
        left = rect.left - offset;
        break;
      case "right":
        top = rect.top + rect.height / 2;
        left = rect.right + offset;
        break;
    }
    setCoords({ top, left });
  }

  React.useEffect(() => {
    if (!open) return;
    position();
    const onMove = () => position();
    window.addEventListener("scroll", onMove, true);
    return () => window.removeEventListener("scroll", onMove, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, placement]);

  const child = React.Children.only(children);
  const cloned = React.cloneElement(child, {
    ref: triggerRef,
    onMouseEnter: (e: React.MouseEvent) => {
      child.props.onMouseEnter?.(e);
      setOpen(true);
    },
    onMouseLeave: (e: React.MouseEvent) => {
      child.props.onMouseLeave?.(e);
      setOpen(false);
    },
    onFocus: (e: React.FocusEvent) => {
      child.props.onFocus?.(e);
      setOpen(true);
    },
    onBlur: (e: React.FocusEvent) => {
      child.props.onBlur?.(e);
      setOpen(false);
    },
  });

  return (
    <>
      {cloned}
      {open && coords &&
        createPortal(
          <div
            className={cn(
              "fixed z-[var(--ds-z-tooltip)] pointer-events-none rounded-md bg-foreground text-background px-2.5 py-1.5 text-xs font-medium shadow-lg opacity-100 transition-opacity",
              "-translate-x-1/2 -translate-y-1/2",
              className,
            )}
            style={{ top: coords.top, left: coords.left }}
            role="tooltip"
          >
            {content}
          </div>,
          document.body,
        )}
    </>
  );
}
