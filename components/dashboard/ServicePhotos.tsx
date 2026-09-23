export type ServicePhoto = { id: string; image_url: string; photo_type: string | null };

function PhotoColumn({
                         label,
                         accent,
                         photos,
                     }: {
    label: string;
    accent: "sky" | "emerald";
    photos: ServicePhoto[];
}) {
    const tone =
        accent === "sky"
            ? { border: "border-sky-400/20", text: "text-sky-300", dot: "bg-sky-400" }
            : { border: "border-emerald-400/20", text: "text-emerald-300", dot: "bg-emerald-400" };

    return (
        <div className={`rounded-xl border ${tone.border} bg-black/20 p-3`}>
            <p className={`mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.15em] ${tone.text}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${tone.dot}`} />
                {label} ({photos.length})
            </p>

            {photos.length === 0 ? (
                <p className="rounded-lg border border-dashed border-white/10 px-3 py-6 text-center text-xs text-white/35">
                    No {label.toLowerCase()} photos uploaded
                </p>
            ) : (
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {photos.map((photo) => (
                        <a
                            key={photo.id}
                            href={photo.image_url}
                            target="_blank"
                            rel="noreferrer"
                            className="block aspect-square overflow-hidden rounded-lg border border-white/10"
                        >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                                src={photo.image_url}
                                alt={`${label} service photo`}
                                loading="lazy"
                                className="h-full w-full object-cover transition hover:scale-105"
                            />
                        </a>
                    ))}
                </div>
            )}
        </div>
    );
}

export default function ServicePhotos({ photos }: { photos: ServicePhoto[] }) {
    return (
        <div className="grid gap-3 md:grid-cols-2">
            <PhotoColumn label="Before" accent="sky" photos={photos.filter((p) => p.photo_type === "before")} />
            <PhotoColumn label="After" accent="emerald" photos={photos.filter((p) => p.photo_type === "after")} />
        </div>
    );
}
