'use client';

import { useState } from "react";
import { Maximize2 } from "lucide-react";
import PhotoLightbox from "@/components/dashboard/PhotoLightbox";
import PhotoTypeBadge from "@/components/dashboard/PhotoTypeBadge";

export type UploadCard = {
    id: string;
    image_url: string | null;
    photo_type: string | null;
    title: string;
    subtitle: string;
};

// Cards show a cropped thumbnail; tapping one opens the whole photo.
export default function UploadsGrid({
                                         uploads,
                                         className = "grid gap-4 md:grid-cols-2",
                                     }: {
    uploads: UploadCard[];
    className?: string;
}) {
    const [openIndex, setOpenIndex] = useState<number | null>(null);

    const viewable = uploads.filter((u) => u.image_url);
    const lightboxPhotos = viewable.map((u) => ({
        id: u.id,
        image_url: u.image_url as string,
        photo_type: u.photo_type,
        caption: u.title,
    }));

    return (
        <>
            <div className={className}>
                {uploads.map((upload) => {
                    const viewIndex = viewable.findIndex((u) => u.id === upload.id);

                    return (
                        <div
                            key={upload.id}
                            className={`overflow-hidden rounded-2xl border bg-white/[0.03] transition hover:border-white/20 ${
                                upload.photo_type === "after"
                                    ? "border-emerald-400/25"
                                    : upload.photo_type === "before"
                                        ? "border-sky-400/25"
                                        : "border-white/10"
                            }`}
                        >
                            <div className="relative">
                                {upload.image_url ? (
                                    <button
                                        type="button"
                                        onClick={() => setOpenIndex(viewIndex)}
                                        aria-label={`View full photo: ${upload.title}`}
                                        className="group relative block h-44 w-full overflow-hidden"
                                    >
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        <img
                                            src={upload.image_url}
                                            alt={upload.title}
                                            loading="lazy"
                                            className="h-full w-full object-cover transition duration-700 group-hover:scale-105"
                                        />
                                        <span className="absolute bottom-2 right-2 inline-flex items-center gap-1 rounded-full bg-black/65 px-2.5 py-1 text-[11px] font-semibold text-white">
                                            <Maximize2 className="h-3 w-3" />
                                            View
                                        </span>
                                    </button>
                                ) : (
                                    <div className="flex h-44 items-center justify-center bg-black/20 text-sm text-white/40">
                                        No image
                                    </div>
                                )}
                                <div className="pointer-events-none absolute left-3 top-3">
                                    <PhotoTypeBadge type={upload.photo_type} />
                                </div>
                            </div>

                            <div className="p-4">
                                <p className="font-bold">{upload.title}</p>
                                <p className="text-sm text-white/55">{upload.subtitle}</p>
                            </div>
                        </div>
                    );
                })}
            </div>

            <PhotoLightbox photos={lightboxPhotos} index={openIndex} onChange={setOpenIndex} heading="Task uploads" />
        </>
    );
}
