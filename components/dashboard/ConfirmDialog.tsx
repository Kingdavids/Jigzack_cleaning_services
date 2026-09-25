'use client';

import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";

// An in-page "are you sure". The browser's own confirm box is unreliable on
// phones (it can be suppressed, and installed apps often skip it), so anything
// that moves money or changes a price asks with this instead. On a phone it
// slides up from the bottom with large buttons.
export default function ConfirmDialog({
                                          open,
                                          title,
                                          children,
                                          confirmLabel,
                                          cancelLabel = "Cancel",
                                          tone = "default",
                                          busy = false,
                                          onConfirm,
                                          onCancel,
                                      }: {
    open: boolean;
    title: string;
    children: ReactNode;
    confirmLabel: string;
    cancelLabel?: string;
    tone?: "default" | "danger";
    busy?: boolean;
    onConfirm: () => void;
    onCancel: () => void;
}) {
    useEffect(() => {
        if (!open) return;

        const onKey = (event: KeyboardEvent) => {
            if (event.key === "Escape" && !busy) onCancel();
        };

        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [open, busy, onCancel]);

    if (!open || typeof document === "undefined") return null;

    return createPortal(
        <div className="fixed inset-0 z-[100] flex items-end justify-center sm:items-center sm:p-4" role="presentation">
            <div className="absolute inset-0 bg-black/70" onClick={busy ? undefined : onCancel} aria-hidden="true" />

            <div
                role="alertdialog"
                aria-modal="true"
                aria-labelledby="confirm-title"
                className="relative w-full max-w-md rounded-t-3xl border border-white/10 bg-[#141518] p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] text-white shadow-2xl sm:rounded-3xl sm:pb-5"
            >
                <h2 id="confirm-title" className="text-lg font-bold">
                    {title}
                </h2>
                <div className="mt-2 text-sm leading-relaxed text-white/75">{children}</div>

                <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                    <button
                        type="button"
                        onClick={onCancel}
                        disabled={busy}
                        className="h-12 rounded-xl border border-white/15 px-5 text-sm font-semibold text-white/80 transition hover:bg-white/10 disabled:opacity-50 sm:h-11"
                    >
                        {cancelLabel}
                    </button>
                    <button
                        type="button"
                        onClick={onConfirm}
                        disabled={busy}
                        className={`h-12 rounded-xl px-5 text-sm font-bold transition disabled:opacity-60 sm:h-11 ${
                            tone === "danger" ? "bg-red-500 text-white hover:bg-red-400" : "bg-emerald-500 text-black hover:bg-emerald-400"
                        }`}
                    >
                        {busy ? "Working…" : confirmLabel}
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
}
