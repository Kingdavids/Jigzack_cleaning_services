"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";
import { getUserProfile } from "@/lib/auth/getUserProfile";

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

    revalidatePath("/employee");
    revalidatePath("/admin");
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
    revalidatePath("/admin");
    revalidatePath("/customer");
}

export async function uploadTaskPhoto(formData: FormData) {
    const profile = await getUserProfile();
    const supabase = await createClient();

    const taskId = String(formData.get("taskId") || "");
    const photoType = String(formData.get("photoType") || "");
    const file = formData.get("photo") as File | null;

    if (!taskId || !photoType || !file || file.size === 0) return;

    const fileExt = file.name.split(".").pop();
    const filePath = `${profile.id}/${taskId}-${photoType}-${Date.now()}.${fileExt}`;

    const { error: uploadError } = await supabase.storage
        .from("task-photos")
        .upload(filePath, file, {
            upsert: false,
        });

    if (uploadError) {
        console.error("Photo upload failed:", uploadError.message);
        return;
    }

    const { data: publicUrlData } = supabase.storage
        .from("task-photos")
        .getPublicUrl(filePath);

    await supabase.from("uploads").insert({
        task_id: taskId,
        employee_id: profile.id,
        image_url: publicUrlData.publicUrl,
        photo_type: photoType, // "before" or "after"
        created_at: new Date().toISOString(),
    });

    revalidatePath("/employee");
    revalidatePath("/admin");
}