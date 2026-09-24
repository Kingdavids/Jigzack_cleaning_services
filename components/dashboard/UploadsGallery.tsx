'use client';

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { deleteTaskPhoto } from "@/app/employee/actions";
import PhotoLightbox from "@/components/dashboard/PhotoLightbox";

export type GalleryUpload = {
    id: string;
    task_id: string | null;
    image_url: string | null;
    photo_type: string | null;
    title: string;
    // Who did the work or who it was for, shown under the task name.
    people: string;
    created_at: string | null;
};

type Filter = "all" | "before" | "after";
type Order = "newest" | "oldest";

type Group = {
    key: string;
    title: string;
    people: string;
    latest: number;
    before: GalleryUpload[];
    after: GalleryUpload[];
};

const FILTERS: { value: Filter; label: string }[] = [
    { value: "all", label: "All" },
    { value: "before", label: "Before" },
    { value: "after", label: "After" },
];

const COLUMN = {
    before: { label: "Before", border: "border-sky-400/25", text: "text-sky-300", dot: "bg-sky-400" },
    after: { label: "After", border: "border-emerald-400/25", text: "text-emerald-300", dot: "bg-emerald-400" },
} as const;

function formatDay(ms: number) {
    if (!ms) return "";
    return new Date(ms).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

// Uploads grouped by task, with the before photos and the after photos in
// their own labelled columns. Filter by type, search, and change the order.
export default function UploadsGallery({ uploads, canDelete = false }: { uploads: GalleryUpload[]; canDelete?: boolean }) {
    const router = useRouter();
    const [deletingId, setDeletingId] = useState<string | null>(null);

    const removePhoto = async (id: string) => {
        if (!window.confirm("Delete this photo for good?")) return;

        setDeletingId(id);
        try {
            await deleteTaskPhoto(id);
            toast.success("Photo deleted");
            router.refresh();
        } catch {
            toast.error("Could not delete this photo.");
        } finally {
            setDeletingId(null);
        }
    };

    const [filter, setFilter] = useState<Filter>("all");
    const [order, setOrder] = useState<Order>("newest");
    const [query, setQuery] = useState("");
    const [openIndex, setOpenIndex] = useState<number | null>(null);

    const counts = useMemo(
        () => ({
            all: uploads.length,
            before: uploads.filter((u) => u.photo_type === "before").length,
            after: uploads.filter((u) => u.photo_type === "after").length,
        }),
        [uploads]
    );

    const groups = useMemo(() => {
        const q = query.trim().toLowerCase();
        const map = new Map<string, Group>();

        for (const upload of uploads) {
            if (!upload.image_url) continue;
            if (filter !== "all" && upload.photo_type !== filter) continue;
            if (q && !`${upload.title} ${upload.people}`.toLowerCase().includes(q)) continue;

            const key = upload.task_id ?? `single-${upload.id}`;
            const time = upload.created_at ? new Date(upload.created_at).getTime() : 0;
            let group = map.get(key);

            if (!group) {
                group = { key, title: upload.title, people: upload.people, latest: 0, before: [], after: [] };
                map.set(key, group);
            }

            group.latest = Math.max(group.latest, time);
            if (upload.photo_type === "after") group.after.push(upload);
            else group.before.push(upload);
        }

        const list = Array.from(map.values());
        list.sort((a, b) => (order === "newest" ? b.latest - a.latest : a.latest - b.latest));
        return list;
    }, [uploads, filter, order, query]);

    // The viewer steps through everything on screen, in the order shown.
    const flat = useMemo(() => groups.flatMap((g) => [...g.before, ...g.after]), [groups]);
    const lightboxPhotos = flat.map((u) => ({
        id: u.id,
        image_url: u.image_url as string,
        photo_type: u.photo_type,
        caption: u.title,
    }));

    const renderColumn = (group: Group, type: "before" | "after") => {
        const style = COLUMN[type];
        const list = type === "before" ? group.before : group.after;

        if (filter !== "all" && filter !== type) return null;

        return (
            <div className={`rounded-xl border ${style.border} bg-black/20 p-3`}>
                <p className={`mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.15em] ${style.text}`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} />
                    {style.label} ({list.length})
                </p>

                {list.length === 0 ? (
                    <p className="rounded-lg border border-dashed border-white/10 px-3 py-6 text-center text-xs text-white/35">
                        No {style.label.toLowerCase()} photos yet
                    </p>
                ) : (
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                        {list.map((photo) => (
                            <div key={photo.id} className="group relative aspect-square overflow-hidden rounded-lg border border-white/10">
                                <button
                                    type="button"
                                    onClick={() => setOpenIndex(flat.findIndex((p) => p.id === photo.id))}
                                    aria-label={`View ${style.label.toLowerCase()} photo of ${group.title}`}
                                    className="absolute inset-0 block h-full w-full"
                                >
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img
                                        src={photo.image_url as string}
                                        alt={`${style.label} photo of ${group.title}`}
                                        loading="lazy"
                                        className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
                                    />
                                </button>
                                {canDelete && (
                                    <button
                                        type="button"
                                        disabled={deletingId === photo.id}
                                        onClick={() => removePhoto(photo.id)}
                                        aria-label="Delete photo"
                                        className="absolute right-1.5 top-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-red-600/90 text-white opacity-100 transition hover:bg-red-500 disabled:opacity-50 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100"
                                    >
                                        <Trash2 className="h-3.5 w-3.5" />
                                    </button>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>
        );
    };

    return (
        <div>
            <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="flex flex-wrap gap-2" role="tablist" aria-label="Filter photos">
                    {FILTERS.map((f) => (
                        <button
                            key={f.value}
                            type="button"
                            role="tab"
                            aria-selected={filter === f.value}
                            onClick={() => setFilter(f.value)}
                            className={`rounded-full border px-4 py-2 text-sm font-semibold transition ${
                                filter === f.value
                                    ? "border-amber-300/60 bg-amber-300/15 text-amber-200"
                                    : "border-white/10 bg-white/[0.03] text-white/65 hover:bg-white/[0.07]"
                            }`}
                        >
                            {f.label} <span className="text-white/45">({counts[f.value]})</span>
                        </button>
                    ))}
                </div>

                <div className="flex gap-2">
                    <div className="relative flex-1 md:w-64 md:flex-none">
                        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
                        <input
                            type="search"
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            placeholder="Search task or person"
                            className="w-full rounded-xl border border-white/10 bg-white/[0.05] py-2.5 pl-9 pr-3 text-sm text-white outline-none placeholder:text-white/35 focus:border-amber-300/50"
                        />
                    </div>
                    <select
                        value={order}
                        onChange={(e) => setOrder(e.target.value as Order)}
                        aria-label="Sort order"
                        className="rounded-xl border border-white/10 bg-[#101010] px-3 py-2.5 text-sm text-white outline-none focus:border-amber-300/50"
                    >
                        <option value="newest">Newest first</option>
                        <option value="oldest">Oldest first</option>
                    </select>
                </div>
            </div>

            {groups.length === 0 ? (
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 text-sm text-white/55">
                    No photos match. Try a different filter or search.
                </div>
            ) : (
                <div className="grid gap-5">
                    {groups.map((group) => (
                        <section key={group.key} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                            <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                                <h3 className="font-bold">{group.title}</h3>
                                <p className="text-sm text-white/55">
                                    {[group.people, formatDay(group.latest)].filter(Boolean).join(" · ")}
                                </p>
                            </div>

                            <div className={`grid gap-3 ${filter === "all" ? "md:grid-cols-2" : ""}`}>
                                {renderColumn(group, "before")}
                                {renderColumn(group, "after")}
                            </div>
                        </section>
                    ))}
                </div>
            )}

            <PhotoLightbox photos={lightboxPhotos} index={openIndex} onChange={setOpenIndex} heading="Task uploads" />
        </div>
    );
}
