"use client";

import React from "react";
import { createPortal } from "react-dom";
import { cn } from "./cn";
import { Icon } from "./icon";

interface DialogContext {
  open: boolean;
  setOpen: (open: boolean) => void;
  titleId: string;
}

const DialogCtx = React.createContext<DialogContext | null>(null);

export interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  children: React.ReactNode;
  className?: string;
}

export function Dialog({ open, onOpenChange, title, children, className }: DialogProps) {
  const titleId = React.useId();
  const ctx: DialogContext = { open, setOpen: onOpenChange, titleId };
  const dialogRef = React.useRef<HTMLDialogElement>(null);

  React.useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open) {
      dialog.showModal();
    } else {
      dialog.close();
    }
  }, [open]);

  if (!open) return null;

  return (
    <DialogCtx.Provider value={ctx}>
      {createPortal(
        <dialog
          ref={dialogRef}
          aria-modal="true"
          aria-labelledby={title ? titleId : undefined}
          className={cn(
            "p-0 m-0 max-w-2xl w-[90vw] max-h-[90vh] border-none bg-surface-container rounded-xl shadow-2xl text-foreground",
            className,
          )}
        >
          <div className="p-6 overflow-y-auto">
            {title ? (
              <h2 id={titleId} className="text-lg font-semibold text-foreground mb-4">
                {title}
              </h2>
            ) : null}
            {children}
          </div>
        </dialog>,
        document.body,
      )}
    </DialogCtx.Provider>
  );
}

export interface DialogContentProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

export function DialogContent({ children, className, ...props }: DialogContentProps) {
  return (
    <div className={cn("space-y-4", className)} {...props}>
      {children}
    </div>
  );
}

export interface DialogFooterProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

export function DialogFooter({ className, children, ...props }: DialogFooterProps) {
  return (
    <div
      className={cn("flex justify-end gap-2 pt-4 border-t border-border", className)}
      {...props}
    >
      {children}
    </div>
  );
}

export interface DialogCloseProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  label?: string;
}

export function DialogClose({ label = "Close", className, ...props }: DialogCloseProps) {
  const ctx = React.useContext(DialogCtx);
  const handleClose = ctx ? () => ctx.setOpen(false) : undefined;

  return (
    <button
      type="button"
      onClick={handleClose}
      className={cn(
        "absolute top-4 right-4 text-foreground-tertiary hover:text-foreground rounded-lg p-1 hover:bg-surface-container transition-colors focus:outline-none focus:ring-2 focus:ring-(color: var(--focus-ring))",
        className,
      )}
      aria-label={label}
      {...props}
    >
      <Icon name="close" />
    </button>
  );
}
