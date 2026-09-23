'use client';

import { useState } from "react";
import PhotoLightbox from "@/components/dashboard/PhotoLightbox";

export type ServicePhoto = { id: string; image_url: string; photo_type: string | null };

type Category = "before" | "after";

const CATEGORY_STYLE: Record<Category, { label: string; border: string; text: string; dot: string }> = {
    before: { label: "Before", border: "border-sky-400/25", text: "text-sky-300", dot: "bg-sky-400" },
    after: { label: "After", border: "border-emerald-400/25", text: "text-emerald-300", dot: "bg-emerald-400" },
};

// Before and after photos for one service day, clearly separated, with a
// full-screen preview you can step through.
export default function ServicePhotos({ photos, heading }: { photos: ServicePhoto[]; heading?: string }) {
    const before = photos.filter((p) => p.photo_type === "before");
    const after = photos.filter((p) => p.photo_type === "after");
    const ordered = [...before, ...after];

    const [openIndex, setOpenIndex] = useState<number | null>(null);

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

    return (
        <>
            <div className="grid gap-3 md:grid-cols-2">
                {renderColumn("before", before)}
                {renderColumn("after", after)}
            </div>

            <PhotoLightbox photos={ordered} index={openIndex} onChange={setOpenIndex} heading={heading} />
        </>
    );
}
