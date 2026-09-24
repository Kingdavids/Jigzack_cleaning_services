"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";
import { getUserProfile } from "@/lib/auth/getUserProfile";
import { removeUnreferencedAttachments, saveMessageAttachment, type SavedAttachment } from "@/lib/message-attachments";

export type MessageActionState = { success: boolean; error?: string } | null;

// Only adds the attachment columns when there is a file, so sending plain
// messages keeps working even before the attachments SQL has been run.
const attachmentFields = (attachment: SavedAttachment | null | { error: string }) =>
    attachment && "path" in attachment ? { attachment_path: attachment.path, attachment_name: attachment.name } : {};

// A double-click, a retried request or a slow network can submit the same
// form twice before the button's pending state lands. An identical message
// from the same sender within a few seconds is that, not a second intent.
async function isRecentDuplicate(
    supabase: Awaited<ReturnType<typeof createClient>>,
    match: { from_profile_id: string; subject: string; body: string; parent_message_id: string | null }
) {
    const since = new Date(Date.now() - 15_000).toISOString();

    let query = supabase
        .from("messages")
        .select("id")
        .eq("from_profile_id", match.from_profile_id)
        .eq("subject", match.subject)
        .eq("body", match.body)
        .gte("created_at", since)
        .limit(1);

    query = match.parent_message_id
        ? query.eq("parent_message_id", match.parent_message_id)
        : query.is("parent_message_id", null);

    const { data } = await query;
    return Boolean(data && data.length > 0);
}

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

    if (await isRecentDuplicate(supabase, { from_profile_id: profile.id, subject, body, parent_message_id: null })) {
        return { success: true };
    }

    // Every admin gets their own copy so whichever one is actually working
    // sees it and gets the live alert -- not just whichever admin account
    // happens to be oldest. The shared group_id lets the sender's list show
    // it once instead of once per admin.
    const attachment = await saveMessageAttachment(supabase, profile.id, formData);
    if (attachment && "error" in attachment) return { success: false, error: attachment.error };

    const groupId = randomUUID();
    const rows = (adminIds as string[]).map((adminId) => ({
        from_profile_id: profile.id,
        to_profile_id: adminId,
        subject,
        body,
        group_id: groupId,
        ...attachmentFields(attachment),
    }));

    const { error: insertError } = await supabase.from("messages").insert(rows);

    if (insertError) {
        console.error("messages insert error:", insertError.message);
        if (attachment) await removeUnreferencedAttachments(supabase, [attachment.path]);
        return { success: false, error: "Could not send message. Please try again." };
    }

    revalidatePath("/employee/messages");
    revalidatePath("/customer/messages");
    revalidatePath("/admin/messages");

    return { success: true };
}

// Employees can message the customers they have a job for. The list of who is
// allowed comes from the database (my_customer_contacts), and the same rule is
// enforced again by the messages_insert_employee_customer policy. Admins can
// read every message, so they see these conversations without any extra step.
export async function sendMessageToCustomer(
    _prevState: MessageActionState,
    formData: FormData
): Promise<MessageActionState> {
    const profile = await getUserProfile();

    if (profile.role !== "employee" || profile.status !== "approved") {
        return { success: false, error: "Only approved staff can message customers." };
    }

    const supabase = await createClient();

    const customerId = String(formData.get("customerId") || "");
    const subject = String(formData.get("subject") || "").trim().slice(0, 200);
    const body = String(formData.get("body") || "").trim().slice(0, 4000);

    if (!customerId || !subject || !body) {
        return { success: false, error: "Choose a customer and write a subject and message." };
    }

    const { data: contacts, error: contactsError } = await supabase.rpc("my_customer_contacts");

    if (contactsError) {
        console.error("my_customer_contacts error:", contactsError.message);
        return { success: false, error: "Messaging customers is not switched on yet. Please tell the admin." };
    }

    if (!(contacts ?? []).some((c: { id: string }) => c.id === customerId)) {
        return { success: false, error: "You can only message customers you have a job for." };
    }

    if (await isRecentDuplicate(supabase, { from_profile_id: profile.id, subject, body, parent_message_id: null })) {
        return { success: true };
    }

    const attachment = await saveMessageAttachment(supabase, profile.id, formData);
    if (attachment && "error" in attachment) return { success: false, error: attachment.error };

    const { error } = await supabase.from("messages").insert({
        from_profile_id: profile.id,
        to_profile_id: customerId,
        subject,
        body,
        ...attachmentFields(attachment),
    });

    if (error) {
        console.error("sendMessageToCustomer insert error:", error.code, error.message);
        if (attachment) await removeUnreferencedAttachments(supabase, [attachment.path]);
        return { success: false, error: "Could not send the message. Please try again." };
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
        .select("id, subject, from_profile_id, to_profile_id, parent_message_id, is_broadcast")
        .eq("id", parentMessageId)
        .single();

    if (parentError || !parent) {
        return { success: false, error: "Could not find the message you're replying to." };
    }

    const threadRootId = parent.parent_message_id ?? parent.id;

    // Reply always targets the thread root (see below), so this row's own
    // is_broadcast flag tells us whether the whole thread is one-way. Also
    // enforced at the database level (messages_insert_to_admin RLS policy)
    // so this isn't just a UI-layer restriction.
    if (parent.is_broadcast) {
        return { success: false, error: "Broadcast messages can't be replied to." };
    }
    const otherPartyId =
        parent.from_profile_id === profile.id ? parent.to_profile_id : parent.from_profile_id;

    if (!otherPartyId) {
        return { success: false, error: "Could not determine who to reply to." };
    }

    const subject = parent.subject.startsWith("Re: ") ? parent.subject : `Re: ${parent.subject}`;

    if (await isRecentDuplicate(supabase, { from_profile_id: profile.id, subject, body, parent_message_id: threadRootId })) {
        return { success: true };
    }

    const attachment = await saveMessageAttachment(supabase, profile.id, formData);
    if (attachment && "error" in attachment) return { success: false, error: attachment.error };

    const { error } = await supabase.from("messages").insert({
        from_profile_id: profile.id,
        to_profile_id: otherPartyId,
        subject,
        body,
        parent_message_id: threadRootId,
        ...attachmentFields(attachment),
    });

    if (error) {
        console.error("replyToMessage insert error:", error.message);
        if (attachment) await removeUnreferencedAttachments(supabase, [attachment.path]);
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
    const profile = await getUserProfile();
    const supabase = await createClient();
    const messageId = String(formData.get("messageId") || "");
    const groupId = String(formData.get("groupId") || "");

    if (!messageId) return;

    // Note any files first, so they can be removed once no message uses them.
    // The column may not exist yet, in which case there are no files.
    const { data: withFiles } = groupId
        ? await supabase.from("messages").select("attachment_path").eq("group_id", groupId).eq("from_profile_id", profile.id)
        : await supabase.from("messages").select("attachment_path").eq("id", messageId);
    const filePaths = (withFiles ?? []).map((row) => row.attachment_path as string | null);

    // A sender's list shows a fan-out (broadcast / message to all admins) as
    // one card, so deleting it has to remove every copy the sender owns --
    // otherwise the next copy would just pop up in its place.
    const { error } = groupId
        ? await supabase.from("messages").delete().eq("group_id", groupId).eq("from_profile_id", profile.id)
        : await supabase.from("messages").delete().eq("id", messageId);

    if (error) {
        console.error("deleteMessage error:", error.message);
        return;
    }

    await removeUnreferencedAttachments(supabase, filePaths);

    revalidatePath("/employee/messages");
    revalidatePath("/customer/messages");
    revalidatePath("/admin/messages");
}
