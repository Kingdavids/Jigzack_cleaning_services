"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";
import { getUserProfile } from "@/lib/auth/getUserProfile";

export type MessageActionState = { success: boolean; error?: string } | null;

export async function sendMessageToAdmin(
    _prevState: MessageActionState,
    formData: FormData
): Promise<MessageActionState> {
    const profile = await getUserProfile();
    const supabase = await createClient();

    const subject = String(formData.get("subject") || "").trim();
    const body = String(formData.get("body") || "").trim();

    if (!subject || !body) {
        return { success: false, error: "Subject and message are required." };
    }

    const { data: adminId, error: adminIdError } = await supabase.rpc("default_admin_id");

    if (adminIdError || !adminId) {
        console.error("default_admin_id RPC error:", adminIdError?.message);
        return { success: false, error: "Could not reach admin. Please try again." };
    }

    const { error: insertError } = await supabase.from("messages").insert({
        from_profile_id: profile.id,
        to_profile_id: adminId,
        subject,
        body,
    });

    if (insertError) {
        console.error("messages insert error:", insertError.message);
        return { success: false, error: "Could not send message. Please try again." };
    }

    revalidatePath("/employee");
    revalidatePath("/customer");
    revalidatePath("/admin");

    return { success: true };
}

export async function replyToMessage(
    _prevState: MessageActionState,
    formData: FormData
): Promise<MessageActionState> {
    const profile = await getUserProfile();
    const supabase = await createClient();

    const parentMessageId = String(formData.get("parentMessageId") || "");
    const body = String(formData.get("body") || "").trim();

    if (!parentMessageId || !body) {
        return { success: false, error: "Message is required." };
    }

    const { data: parent, error: parentError } = await supabase
        .from("messages")
        .select("id, subject, from_profile_id, to_profile_id, parent_message_id")
        .eq("id", parentMessageId)
        .single();

    if (parentError || !parent) {
        return { success: false, error: "Could not find the message you're replying to." };
    }

    const threadRootId = parent.parent_message_id ?? parent.id;
    const otherPartyId =
        parent.from_profile_id === profile.id ? parent.to_profile_id : parent.from_profile_id;

    if (!otherPartyId) {
        return { success: false, error: "Could not determine who to reply to." };
    }

    const subject = parent.subject.startsWith("Re: ") ? parent.subject : `Re: ${parent.subject}`;

    const { error } = await supabase.from("messages").insert({
        from_profile_id: profile.id,
        to_profile_id: otherPartyId,
        subject,
        body,
        parent_message_id: threadRootId,
    });

    if (error) {
        console.error("replyToMessage insert error:", error.message);
        return { success: false, error: "Could not send reply. Please try again." };
    }

    revalidatePath("/employee");
    revalidatePath("/customer");
    revalidatePath("/admin");

    return { success: true };
}

export async function markMessagesRead() {
    const profile = await getUserProfile();
    const supabase = await createClient();

    const { error } = await supabase
        .from("messages")
        .update({ read_at: new Date().toISOString() })
        .eq("to_profile_id", profile.id)
        .is("read_at", null);

    if (error) {
        console.error("markMessagesRead error:", error.message);
    }
}

export async function deleteMessage(formData: FormData) {
    const supabase = await createClient();
    const messageId = String(formData.get("messageId") || "");

    if (!messageId) return;

    const { error } = await supabase.from("messages").delete().eq("id", messageId);

    if (error) {
        console.error("deleteMessage error:", error.message);
        return;
    }

    revalidatePath("/employee");
    revalidatePath("/customer");
    revalidatePath("/admin");
}
