'use client';

import { useCallback, useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, ExternalLink, X } from "lucide-react";

export type ServicePhoto = { id: string; image_url: string; photo_type: string | null };

type Category = "before" | "after";

const CATEGORY_STYLE: Record<Category, { label: string; border: string; text: string; dot: string; chip: string }> = {
    before: {
        label: "Before",
        border: "border-sky-400/25",
        text: "text-sky-300",
        dot: "bg-sky-400",
        chip: "bg-sky-500 text-white",
    },
    after: {
        label: "After",
        border: "border-emerald-400/25",
        text: "text-emerald-300",
        dot: "bg-emerald-400",
        chip: "bg-emerald-500 text-white",
    },
};

// Before and after photos for one service day, clearly separated, with a
// full-screen preview you can step through.
export default function ServicePhotos({ photos, heading }: { photos: ServicePhoto[]; heading?: string }) {
    const before = photos.filter((p) => p.photo_type === "before");
    const after = photos.filter((p) => p.photo_type === "after");
    const ordered = [...before, ...after];

    const [openIndex, setOpenIndex] = useState<number | null>(null);

    const close = useCallback(() => setOpenIndex(null), []);
    const step = useCallback(
        (direction: 1 | -1) =>
            setOpenIndex((current) =>
                current === null ? null : (current + direction + ordered.length) % ordered.length
            ),
        [ordered.length]
    );

    useEffect(() => {
        if (openIndex === null) return;

        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") close();
            if (e.key === "ArrowRight") step(1);
            if (e.key === "ArrowLeft") step(-1);
        };

        document.addEventListener("keydown", onKey);
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";

        return () => {
            document.removeEventListener("keydown", onKey);
            document.body.style.overflow = previousOverflow;
        };
    }, [openIndex, close, step]);

    const renderColumn = (category: Category, list: ServicePhoto[]) => {
        const style = CATEGORY_STYLE[category];

        return (
            <div className={`rounded-xl border ${style.border} bg-black/20 p-3`}>
                <p className={`mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.15em] ${style.text}`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} />
                    {style.label} ({list.length})
                </p>

                {list.length === 0 ? (
                    <p className="rounded-lg border border-dashed border-white/10 px-3 py-6 text-center text-xs text-white/35">
                        No {style.label.toLowerCase()} photos uploaded
                    </p>
                ) : (
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                        {list.map((photo) => (
                            <button
                                key={photo.id}
                                type="button"
                                onClick={() => setOpenIndex(ordered.findIndex((p) => p.id === photo.id))}
                                aria-label={`Preview ${style.label.toLowerCase()} photo`}
                                className="group relative block aspect-square overflow-hidden rounded-lg border border-white/10"
                            >
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                    src={photo.image_url}
                                    alt={`${style.label} service photo`}
                                    loading="lazy"
                                    className="h-full w-full object-cover transition group-hover:scale-105"
                                />
                            </button>
                        ))}
                    </div>
                )}
            </div>
        );
    };

    const current = openIndex === null ? null : ordered[openIndex];
    const currentCategory: Category = current?.photo_type === "after" ? "after" : "before";

    return (
        <>
            <div className="grid gap-3 md:grid-cols-2">
                {renderColumn("before", before)}
                {renderColumn("after", after)}
            </div>

            {current && (
                <div
                    role="dialog"
                    aria-modal="true"
                    aria-label={heading ? `${heading} photo preview` : "Photo preview"}
                    className="fixed inset-0 z-[100] flex flex-col bg-black/95"
                    onClick={close}
                >
                    <div className="flex items-center justify-between gap-3 px-4 py-3" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center gap-3">
                            <span className={`rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wide ${CATEGORY_STYLE[currentCategory].chip}`}>
                                {CATEGORY_STYLE[currentCategory].label}
                            </span>
                            <span className="text-sm text-white/70">
                                {heading ? `${heading} · ` : ""}
                                {(openIndex ?? 0) + 1} of {ordered.length}
                            </span>
                        </div>
                        <div className="flex items-center gap-2">
                            <a
                                href={current.image_url}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 px-3 py-2 text-xs font-semibold text-white/80 transition hover:bg-white/10"
                            >
                                <ExternalLink className="h-3.5 w-3.5" />
                                Open original
                            </a>
                            <button
                                type="button"
                                onClick={close}
                                aria-label="Close preview"
                                className="flex h-10 w-10 items-center justify-center rounded-lg border border-white/15 text-white transition hover:bg-white/10"
                            >
                                <X className="h-5 w-5" />
                            </button>
                        </div>
                    </div>

                    <div className="relative flex min-h-0 flex-1 items-center justify-center px-2 pb-4 sm:px-14" onClick={(e) => e.stopPropagation()}>
                        {ordered.length > 1 && (
                            <button
                                type="button"
                                onClick={() => step(-1)}
                                aria-label="Previous photo"
                                className="absolute left-2 z-10 flex h-11 w-11 items-center justify-center rounded-full bg-black/60 text-white transition hover:bg-black/80 sm:left-3"
                            >
                                <ChevronLeft className="h-6 w-6" />
                            </button>
                        )}

                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                            src={current.image_url}
                            alt={`${CATEGORY_STYLE[currentCategory].label} service photo`}
                            className="max-h-full max-w-full rounded-lg object-contain"
                        />

                        {ordered.length > 1 && (
                            <button
                                type="button"
                                onClick={() => step(1)}
                                aria-label="Next photo"
                                className="absolute right-2 z-10 flex h-11 w-11 items-center justify-center rounded-full bg-black/60 text-white transition hover:bg-black/80 sm:right-3"
                            >
                                <ChevronRight className="h-6 w-6" />
                            </button>
                        )}
                    </div>
                </div>
            )}
        </>
    );
}
