"use client";

import { useId, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { useTranslations } from "next-intl";

/** Nested dialogs (a confirm opened from a lightbox) share one scroll lock. */
let scrollLocks = 0;
let savedOverflow = "";

function lockScroll() {
  if (scrollLocks++ === 0) {
    savedOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
  }
}

function unlockScroll() {
  if (--scrollLocks === 0) document.documentElement.style.overflow = savedOverflow;
}

export interface DialogProps {
  open: boolean;
  /** Called on Escape, a backdrop click or the close button. The parent decides whether to close. */
  onClose: () => void;
  /** The dialog's accessible name (aria-labelledby). Rendered as its heading unless `hideTitle`. */
  title: ReactNode;
  hideTitle?: boolean;
  /** Rendered under the title and wired up as aria-describedby. */
  description?: ReactNode;
  /** When false, Escape and backdrop clicks do nothing (e.g. while an action is running). */
  dismissible?: boolean;
  closeOnBackdrop?: boolean;
  /** Adds a "Close" button next to the title. */
  showCloseButton?: boolean;
  /** Focused after opening instead of the first focusable element. */
  initialFocusRef?: RefObject<HTMLElement | null>;
  placement?: "center" | "top";
  /** Width and padding of the panel; defaults to "max-w-md p-5". */
  panelClassName?: string;
  children?: ReactNode;
}

/**
 * Modal dialog on the native <dialog> element opened with showModal(): the browser puts it in the
 * top layer, makes the rest of the page inert (so focus stays inside) and moves focus in. On top of
 * that this closes on Escape and backdrop click, locks page scroll and returns focus to whatever
 * had it before opening. Children are only mounted while open, so their state resets each time.
 */
export function Dialog(props: DialogProps) {
  if (!props.open) return null;
  return <OpenDialog {...props} />;
}

function OpenDialog({
  onClose,
  title,
  hideTitle = false,
  description,
  dismissible = true,
  closeOnBackdrop = true,
  showCloseButton = false,
  initialFocusRef,
  placement = "center",
  panelClassName = "max-w-md p-5",
  children,
}: DialogProps) {
  const tc = useTranslations("common");
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  // Captured during render, before anything inside the dialog can take focus.
  const [opener] = useState(() => (typeof document === "undefined" ? null : document.activeElement));
  const pointerDownOnBackdrop = useRef(false);

  // Latest props for the native event handlers, without re-running the open/close effect.
  const latest = useRef({ onClose, dismissible });
  useLayoutEffect(() => {
    latest.current = { onClose, dismissible };
  });

  useLayoutEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    let closingOurselves = false;

    function onCancel(e: Event) {
      // Escape: keep the dialog controlled by the parent.
      e.preventDefault();
      if (latest.current.dismissible) latest.current.onClose();
    }
    function onNativeClose() {
      if (closingOurselves) return;
      // Browsers may force-close after repeated Escape presses; respect `dismissible`.
      if (latest.current.dismissible) latest.current.onClose();
      else if (dialog?.isConnected) dialog.showModal();
    }

    dialog.addEventListener("cancel", onCancel);
    dialog.addEventListener("close", onNativeClose);
    dialog.showModal();
    initialFocusRef?.current?.focus();
    lockScroll();

    return () => {
      closingOurselves = true;
      dialog.removeEventListener("cancel", onCancel);
      dialog.removeEventListener("close", onNativeClose);
      if (dialog.open) dialog.close();
      unlockScroll();
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus({ preventScroll: true });
    };
    // Runs once per opening; initialFocusRef and opener are read at that moment on purpose.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      className={`fixed inset-0 m-0 size-full max-h-none max-w-none overflow-y-auto bg-transparent p-4 text-fg backdrop:bg-gray-950/50 open:flex open:justify-center ${
        placement === "top" ? "open:items-start pt-[12vh]" : "open:items-center"
      }`}
      // The dialog element spans the viewport and the panel sits inside it, so a click whose target
      // is the dialog itself landed outside the panel. Both ends must be outside, so selecting text
      // in the panel and releasing over the backdrop doesn't close it.
      onPointerDown={(e) => {
        pointerDownOnBackdrop.current = e.target === e.currentTarget;
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && pointerDownOnBackdrop.current && closeOnBackdrop && dismissible) onClose();
      }}
    >
      <div className={`relative w-full rounded-2xl border border-border bg-surface text-fg shadow-theme-lg ${panelClassName}`}>
        {hideTitle ? (
          <h2 id={titleId} className="sr-only">
            {title}
          </h2>
        ) : (
          <div className="flex items-start justify-between gap-4">
            <h2 id={titleId} className="text-base font-semibold text-fg">
              {title}
            </h2>
            {showCloseButton && (
              <button
                type="button"
                onClick={onClose}
                disabled={!dismissible}
                className="shrink-0 rounded text-sm text-fg-subtle hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
              >
                {tc("close")}
              </button>
            )}
          </div>
        )}
        {description != null && (
          <div id={descriptionId} className="mt-2 text-sm text-fg-muted">
            {description}
          </div>
        )}
        {children}
      </div>
    </dialog>
  );
}
