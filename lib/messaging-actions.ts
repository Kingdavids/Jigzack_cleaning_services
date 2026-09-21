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

    const { data: adminIds, error: adminIdsError } = await supabase.rpc("approved_admin_ids");

    if (adminIdsError || !adminIds || adminIds.length === 0) {
        console.error("approved_admin_ids RPC error:", adminIdsError?.message);
        return { success: false, error: "Could not reach admin. Please try again." };
    }

    // Every admin gets their own copy so whichever one is actually working
    // sees it and gets the live alert -- not just whichever admin account
    // happens to be oldest.
    const rows = (adminIds as string[]).map((adminId) => ({
        from_profile_id: profile.id,
        to_profile_id: adminId,
        subject,
        body,
    }));

    const { error: insertError } = await supabase.from("messages").insert(rows);

    if (insertError) {
        console.error("messages insert error:", insertError.message);
        return { success: false, error: "Could not send message. Please try again." };
    }

    revalidatePath("/employee/messages");
    revalidatePath("/customer/messages");
    revalidatePath("/admin/messages");

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

    revalidatePath("/employee/messages");
    revalidatePath("/customer/messages");
    revalidatePath("/admin/messages");

    return { success: true };
}

// Marks only the messages in one thread as read, instead of every unread
// message the user has -- a thread should stay unread until it's actually
// opened, not the moment the messages list happens to render.
export async function markThreadRead(rootMessageId: string) {
    if (!rootMessageId) return;

    const profile = await getUserProfile();
    const supabase = await createClient();

    const { error } = await supabase
        .from("messages")
        .update({ read_at: new Date().toISOString() })
        .eq("to_profile_id", profile.id)
        .is("read_at", null)
        .or(`id.eq.${rootMessageId},parent_message_id.eq.${rootMessageId}`);

    if (error) {
        console.error("markThreadRead error:", error.message);
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

    revalidatePath("/employee/messages");
    revalidatePath("/customer/messages");
    revalidatePath("/admin/messages");
}
