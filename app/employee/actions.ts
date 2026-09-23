"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";
import { getUserProfile } from "@/lib/auth/getUserProfile";
import { MAX_PHOTOS_PER_SLOT } from "@/lib/upload-constants";

export async function startTask(formData: FormData) {
    const profile = await getUserProfile();
    const supabase = await createClient();

    const taskId = String(formData.get("taskId") || "");

    if (!taskId) return;

    await supabase
        .from("tasks")
        .update({
            status: "in progress",
            started_at: new Date().toISOString(),
        })
        .eq("id", taskId)
        .eq("employee_id", profile.id);

    revalidatePath("/employee/tasks");
    revalidatePath("/admin/tasks");
}

export async function endTask(formData: FormData) {
    const profile = await getUserProfile();
    const supabase = await createClient();

    const taskId = String(formData.get("taskId") || "");

    if (!taskId) return;

    await supabase
        .from("tasks")
        .update({
            status: "completed",
            completed_at: new Date().toISOString(),
        })
        .eq("id", taskId)
        .eq("employee_id", profile.id);

    revalidatePath("/employee");
    revalidatePath("/employee/tasks");
    revalidatePath("/admin/tasks");
    revalidatePath("/customer");
    revalidatePath("/customer/tasks");
}

const IMAGE_EXTENSIONS: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/heic": "heic",
    "image/heif": "heif",
};

const MAX_PHOTO_BYTES = 15 * 1024 * 1024;

export type UploadActionState = { success: boolean; error?: string; uploaded?: number } | null;

export async function uploadTaskPhoto(
    _prevState: UploadActionState,
    formData: FormData
): Promise<UploadActionState> {
    const profile = await getUserProfile();
    const supabase = await createClient();

    const taskId = String(formData.get("taskId") || "");
    const photoType = String(formData.get("photoType") || "");
    const files = formData.getAll("photo").filter((f): f is File => f instanceof File && f.size > 0);

    if (!taskId || !photoType || files.length === 0) {
        return { success: false, error: "Choose at least one photo." };
    }

    if (photoType !== "before" && photoType !== "after") {
        return { success: false, error: "Photos must be marked before or after." };
    }

    if (profile.role !== "employee" && profile.role !== "admin") {
        return { success: false, error: "Only staff can upload task photos." };
    }

    const { count: existingCount } = await supabase
        .from("uploads")
        .select("id", { count: "exact", head: true })
        .eq("task_id", taskId)
        .eq("photo_type", photoType);

    const remainingSlots = MAX_PHOTOS_PER_SLOT - (existingCount ?? 0);

    if (remainingSlots <= 0) {
        return { success: false, error: `You can only keep ${MAX_PHOTOS_PER_SLOT} ${photoType} photos per task.` };
    }

    const filesToUpload = files.slice(0, remainingSlots);

    const { data: task, error: taskError } = await supabase
        .from("tasks")
        .select("title, customer_id, employee_id")
        .eq("id", taskId)
        .single();

    if (taskError) {
        console.error("Could not load task for upload:", taskError.message);
        return { success: false, error: "Could not load this task. Please try again." };
    }

    // Staff can only add photos to the jobs assigned to them.
    if (profile.role !== "admin" && task.employee_id !== profile.id) {
        return { success: false, error: "This task isn't assigned to you." };
    }

    let uploaded = 0;

    for (const file of filesToUpload) {
        // The browser compresses to a JPEG first, but the server can't rely on
        // that: only real images under the size cap are stored, and the file
        // extension comes from the type, not from whatever name was sent.
        const fileExt = IMAGE_EXTENSIONS[file.type];

        if (!fileExt || file.size > MAX_PHOTO_BYTES) {
            console.error("Rejected upload:", file.type, file.size);
            continue;
        }

        const filePath = `${profile.id}/${taskId}-${photoType}-${Date.now()}-${uploaded}.${fileExt}`;

        const { error: uploadError } = await supabase.storage
            .from("task-photos")
            .upload(filePath, file, { upsert: false });

        if (uploadError) {
            console.error("Photo upload failed:", uploadError.message);
            continue;
        }

        const { data: publicUrlData } = supabase.storage.from("task-photos").getPublicUrl(filePath);

        const { error: insertError } = await supabase.from("uploads").insert({
            task_id: taskId,
            employee_id: profile.id,
            customer_id: task?.customer_id ?? null,
            task_title: task?.title ?? null,
            image_url: publicUrlData.publicUrl,
            photo_type: photoType, // "before" or "after"
            created_at: new Date().toISOString(),
        });

        if (insertError) {
            console.error("Uploads insert error:", insertError.message);
            continue;
        }

        uploaded += 1;
    }

    revalidatePath("/employee/tasks");
    revalidatePath("/employee/uploads");
    revalidatePath("/admin/uploads");
    revalidatePath("/customer");
    revalidatePath("/customer/tasks");

    if (uploaded === 0) {
        return { success: false, error: "Upload failed. Please try again." };
    }

    if (uploaded < files.length) {
        return {
            success: true,
            uploaded,
            error: `Only ${uploaded} of ${files.length} photos were saved (5-photo limit per slot).`,
        };
    }

    return { success: true, uploaded };
}

export async function deleteTaskPhoto(uploadId: string) {
    const profile = await getUserProfile();
    const supabase = await createClient();

    if (!uploadId) return;

    const { data: upload, error: fetchError } = await supabase
        .from("uploads")
        .select("id, employee_id, image_url")
        .eq("id", uploadId)
        .single();

    if (fetchError || !upload) return;

    if (upload.employee_id !== profile.id && profile.role !== "admin") return;

    const storagePath = upload.image_url.split("/task-photos/")[1];

    if (storagePath) {
        await supabase.storage.from("task-photos").remove([decodeURIComponent(storagePath)]);
    }

    await supabase.from("uploads").delete().eq("id", uploadId);

    revalidatePath("/employee/tasks");
    revalidatePath("/employee/uploads");
    revalidatePath("/admin/uploads");
    revalidatePath("/customer");
    revalidatePath("/customer/tasks");
}