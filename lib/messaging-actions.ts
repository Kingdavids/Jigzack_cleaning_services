"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";
import { getUserProfile } from "@/lib/auth/getUserProfile";

export async function sendMessageToAdmin(formData: FormData) {
    const profile = await getUserProfile();
    const supabase = await createClient();

    const subject = String(formData.get("subject") || "").trim();
    const body = String(formData.get("body") || "").trim();

    if (!subject || !body) return;

    const { data: adminId, error: adminIdError } = await supabase.rpc("default_admin_id");

    if (adminIdError) {
        console.error("default_admin_id RPC error:", adminIdError.message);
        return;
    }

    if (!adminId) return;

    const { error: insertError } = await supabase.from("messages").insert({
        from_profile_id: profile.id,
        to_profile_id: adminId,
        subject,
        body,
    });

    if (insertError) {
        console.error("messages insert error:", insertError.message);
        return;
    }

    revalidatePath("/employee");
    revalidatePath("/customer");
    revalidatePath("/admin");
}
