'use client';

import { useCallback, useEffect, useRef } from "react";
import { ChevronLeft, ChevronRight, ExternalLink, X } from "lucide-react";

export type LightboxPhoto = {
    id: string;
    image_url: string;
    photo_type?: string | null;
    caption?: string | null;
};

const CHIP: Record<string, { label: string; className: string }> = {
    before: { label: "Before", className: "bg-sky-500 text-white" },
    after: { label: "After", className: "bg-emerald-500 text-white" },
};

// Full-screen viewer that always shows the whole photo (never cropped), with
// next/previous buttons, arrow keys, swipe, and Esc to close. The parent owns
// which photo is open: `index` is its position in `photos`, or null for closed.
export default function PhotoLightbox({
                                           photos,
                                           index,
                                           onChange,
                                           heading,
                                       }: {
    photos: LightboxPhoto[];
    index: number | null;
    onChange: (index: number | null) => void;
    heading?: string;
}) {
    const touchStartX = useRef<number | null>(null);
    const count = photos.length;

    const close = useCallback(() => onChange(null), [onChange]);
    const step = useCallback(
        (direction: 1 | -1) => {
            if (index === null || count === 0) return;
            onChange((index + direction + count) % count);
        },
        [index, count, onChange]
    );

    useEffect(() => {
        if (index === null) return;

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
    }, [index, close, step]);

    const photo = index === null ? null : photos[index];
    if (!photo) return null;

    const chip = photo.photo_type ? CHIP[photo.photo_type] : undefined;

    return (
        <div
            role="dialog"
            aria-modal="true"
            aria-label={heading ? `${heading} photo preview` : "Photo preview"}
            className="fixed inset-0 z-[100] flex flex-col bg-black/95"
            onClick={close}
        >
            <div className="flex items-center justify-between gap-3 px-4 py-3" onClick={(e) => e.stopPropagation()}>
                <div className="flex min-w-0 items-center gap-3">
                    {chip && (
                        <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wide ${chip.className}`}>
                            {chip.label}
                        </span>
                    )}
                    <span className="truncate text-sm text-white/70">
                        {[heading, photo.caption].filter(Boolean).join(" · ")}
                        {(heading || photo.caption) && count > 1 ? " · " : ""}
                        {count > 1 ? `${(index ?? 0) + 1} of ${count}` : ""}
                    </span>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                    <a
                        href={photo.image_url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 px-3 py-2 text-xs font-semibold text-white/80 transition hover:bg-white/10"
                    >
                        <ExternalLink className="h-3.5 w-3.5" />
                        <span className="hidden sm:inline">Open original</span>
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

            <div
                className="relative flex min-h-0 flex-1 items-center justify-center px-2 pb-4 sm:px-14"
                onClick={(e) => e.stopPropagation()}
                onTouchStart={(e) => {
                    touchStartX.current = e.touches[0].clientX;
                }}
                onTouchEnd={(e) => {
                    if (touchStartX.current === null) return;
                    const dx = e.changedTouches[0].clientX - touchStartX.current;
                    touchStartX.current = null;
                    if (Math.abs(dx) > 50) step(dx < 0 ? 1 : -1);
                }}
            >
                {count > 1 && (
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
                    src={photo.image_url}
                    alt={photo.caption ?? (chip ? `${chip.label} photo` : "Uploaded photo")}
                    className="max-h-full max-w-full rounded-lg object-contain"
                />

                {count > 1 && (
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
    );
}
