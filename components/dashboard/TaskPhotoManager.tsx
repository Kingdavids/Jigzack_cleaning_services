'use client';

import { useEffect, useRef, useState, useTransition } from "react";
import Image from "next/image";
import { X, Plus, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/utils/supabase/client";
import { uploadTaskPhoto, deleteTaskPhoto, MAX_PHOTOS_PER_SLOT } from "@/app/employee/actions";

type Photo = { id: string; image_url: string };

export default function TaskPhotoManager({
                                              taskId,
                                              photoType,
                                              label,
                                              accent,
                                              initialPhotos,
                                          }: {
    taskId: string;
    photoType: "before" | "after";
    label: string;
    accent: "sky" | "emerald";
    initialPhotos: Photo[];
}) {
    const [photos, setPhotos] = useState<Photo[]>(initialPhotos);
    const [isCompressing, startCompressing] = useTransition();
    const [isUploading, startUploading] = useTransition();
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        const supabase = createClient();

        const channel = supabase
            .channel(`task-photos-${taskId}-${photoType}`)
            .on(
                "postgres_changes",
                { event: "INSERT", schema: "public", table: "uploads", filter: `task_id=eq.${taskId}` },
                (payload) => {
                    const row = payload.new as { id: string; image_url: string; photo_type: string };
                    if (row.photo_type !== photoType) return;
                    setPhotos((prev) => (prev.some((p) => p.id === row.id) ? prev : [...prev, { id: row.id, image_url: row.image_url }]));
                }
            )
            .on(
                "postgres_changes",
                { event: "DELETE", schema: "public", table: "uploads", filter: `task_id=eq.${taskId}` },
                (payload) => {
                    const row = payload.old as { id: string };
                    setPhotos((prev) => prev.filter((p) => p.id !== row.id));
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [taskId, photoType]);

    const handleFiles = (fileList: FileList | null) => {
        if (!fileList || fileList.length === 0) return;

        const remaining = MAX_PHOTOS_PER_SLOT - photos.length;
        if (remaining <= 0) {
            toast.error(`You already have ${MAX_PHOTOS_PER_SLOT} ${photoType} photos on this task.`);
            return;
        }

        const picked = Array.from(fileList).slice(0, remaining);
        if (fileList.length > remaining) {
            toast.message(`Only the first ${remaining} photo${remaining === 1 ? "" : "s"} will be uploaded (5-photo limit).`);
        }

        startCompressing(async () => {
            const imageCompression = (await import("browser-image-compression")).default;
            const formData = new FormData();
            formData.set("taskId", taskId);
            formData.set("photoType", photoType);

            let anyAttached = false;

            for (const file of picked) {
                try {
                    const compressed = await imageCompression(file, {
                        maxSizeMB: 1.5,
                        maxWidthOrHeight: 1920,
                        useWebWorker: true,
                        fileType: "image/jpeg",
                    });
                    const renamed = new File(
                        [compressed],
                        file.name.replace(/\.\w+$/, ".jpg"),
                        { type: "image/jpeg" }
                    );
                    formData.append("photo", renamed);
                    anyAttached = true;
                } catch (err) {
                    console.error("Client-side compression failed for", file.name, err);
                    toast.error(`Couldn't process "${file.name}" — try a different photo format (JPEG/PNG).`);
                }
            }

            if (!anyAttached) return;

            startUploading(async () => {
                const result = await uploadTaskPhoto(null, formData);
                if (result?.success) {
                    if (result.error) {
                        toast.message(result.error);
                    } else {
                        toast.success(`${label} photo${(result.uploaded ?? 1) > 1 ? "s" : ""} uploaded`);
                    }
                } else {
                    toast.error(result?.error || "Upload failed. Please try again.");
                }
            });
        });

        if (inputRef.current) inputRef.current.value = "";
    };

    const handleDelete = (id: string) => {
        setPhotos((prev) => prev.filter((p) => p.id !== id));
        startTransitionSafeDelete(id);
    };

    const startTransitionSafeDelete = (id: string) => {
        deleteTaskPhoto(id).catch((err) => {
            console.error("Delete failed:", err);
            toast.error("Could not delete photo.");
        });
    };

    const busy = isCompressing || isUploading;
    const accentClasses =
        accent === "sky"
            ? { border: "border-sky-400/20", dot: "bg-sky-400", text: "text-sky-300" }
            : { border: "border-emerald-400/20", dot: "bg-emerald-400", text: "text-emerald-300" };

    return (
        <div className={`rounded-xl border ${accentClasses.border} bg-black/20 p-3`}>
            <label className={`mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.15em] ${accentClasses.text}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${accentClasses.dot}`} />
                {label} Photo{photos.length > 0 ? `s (${photos.length}/${MAX_PHOTOS_PER_SLOT})` : ""}
            </label>

            <div className="mb-2 grid grid-cols-3 gap-2">
                {photos.map((photo) => (
                    <div key={photo.id} className="group relative aspect-square overflow-hidden rounded-lg border border-white/10">
                        <Image src={photo.image_url} alt={`${label} photo`} fill className="object-cover" unoptimized />
                        <button
                            type="button"
                            onClick={() => handleDelete(photo.id)}
                            aria-label="Remove photo"
                            className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/70 text-white opacity-0 transition group-hover:opacity-100"
                        >
                            <X size={12} />
                        </button>
                    </div>
                ))}

                {photos.length < MAX_PHOTOS_PER_SLOT && (
                    <button
                        type="button"
                        disabled={busy}
                        onClick={() => inputRef.current?.click()}
                        className="flex aspect-square items-center justify-center rounded-lg border border-dashed border-white/15 text-white/40 transition hover:border-white/30 hover:text-white/70 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        {busy ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
                    </button>
                )}
            </div>

            <input
                ref={inputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => handleFiles(e.target.files)}
            />

            {photos.length === 0 && (
                <p className="text-xs text-white/40">No {photoType} photos yet — tap + to add up to {MAX_PHOTOS_PER_SLOT}.</p>
            )}
        </div>
    );
}
