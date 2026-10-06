"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";
import { logActivity } from "@/lib/activity";
import { escapeHtml, sendEmail } from "@/lib/send-email";
import { removeUnreferencedAttachments, saveMessageAttachment } from "@/lib/message-attachments";
import { emailEachRecipient } from "@/lib/broadcast-email";
import { requireAdmin, duplicateSince } from "./shared";

export type MessageActionState = { success: boolean; error?: string } | null;

export async function sendMessage(
    _prevState: MessageActionState,
    formData: FormData
): Promise<MessageActionState> {
    const profile = await requireAdmin();
    const supabase = await createClient();

    const toProfileId = String(formData.get("toProfileId") || "");
    const subject = String(formData.get("subject") || "").trim();
    const body = String(formData.get("body") || "").trim();

    if (!toProfileId || !subject || !body) {
        return { success: false, error: "Recipient, subject, and message are required." };
    }

    const { data: duplicateMessage } = await supabase
        .from("messages")
        .select("id")
        .eq("from_profile_id", profile.id)
        .eq("to_profile_id", toProfileId)
        .eq("subject", subject)
        .eq("body", body)
        .gte("created_at", duplicateSince())
        .limit(1);

    if (duplicateMessage && duplicateMessage.length > 0) {
        return { success: true };
    }

    const attachment = await saveMessageAttachment(supabase, profile.id, formData);
    if (attachment && "error" in attachment) return { success: false, error: attachment.error };

    const { error } = await supabase.from("messages").insert({
        from_profile_id: profile.id,
        to_profile_id: toProfileId,
        subject,
        body,
        ...(attachment ? { attachment_path: attachment.path, attachment_name: attachment.name } : {}),
    });

    if (error) {
        console.error("sendMessage insert error:", error.message);
        if (attachment) await removeUnreferencedAttachments(supabase, [attachment.path]);
        return { success: false, error: "Could not send message. Please try again." };
    }

    revalidatePath("/admin/messages");

    return { success: true };
}

const BROADCAST_ROLES: Record<string, ("customer" | "employee")[]> = {
    all_customers: ["customer"],
    all_employees: ["employee"],
    everyone: ["customer", "employee"],
};

// Broadcasts are one-way (see the messages_insert_to_admin RLS policy,
// which rejects any reply whose thread root has is_broadcast = true) --
// a fan-out announcement isn't meant to become a support conversation.
export async function sendBroadcast(
    _prevState: MessageActionState,
    formData: FormData
): Promise<MessageActionState> {
    const profile = await requireAdmin();
    const supabase = await createClient();

    const audience = String(formData.get("audience") || "");
    const subject = String(formData.get("subject") || "").trim();
    const body = String(formData.get("body") || "").trim();

    const roles = BROADCAST_ROLES[audience];

    if (!roles || !subject || !body) {
        return { success: false, error: "Audience, subject, and message are required." };
    }

    const { data: recipients, error: recipientsError } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("role", roles)
        .eq("status", "approved");

    if (recipientsError) {
        console.error("broadcast recipients error:", recipientsError.message);
        return { success: false, error: "Could not load recipients. Please try again." };
    }

    if (!recipients || recipients.length === 0) {
        return { success: false, error: "No approved recipients found for this broadcast." };
    }

    const { data: duplicateBroadcast } = await supabase
        .from("messages")
        .select("id")
        .eq("from_profile_id", profile.id)
        .eq("subject", subject)
        .eq("body", body)
        .eq("is_broadcast", true)
        .gte("created_at", duplicateSince())
        .limit(1);

    if (duplicateBroadcast && duplicateBroadcast.length > 0) {
        return { success: true };
    }

    const groupId = randomUUID();
    const rows = recipients.map((r) => ({
        from_profile_id: profile.id,
        to_profile_id: r.id,
        subject,
        body,
        is_broadcast: true,
        group_id: groupId,
    }));

    const { error } = await supabase.from("messages").insert(rows);

    if (error) {
        console.error("broadcast insert error:", error.message);
        return { success: false, error: "Could not send broadcast. Please try again." };
    }

    // A copy in their inbox too, not just the in-app message. Best effort: an
    // email problem never undoes the broadcast that has already been sent.
    const emailed = await emailEachRecipient(recipients, subject, body).catch(() => 0);

    await logActivity(
        supabase,
        profile,
        "broadcast_sent",
        `Sent a broadcast announcement (emailed ${emailed} of ${recipients.length})`
    );
    revalidatePath("/admin/messages");
    revalidatePath("/employee/messages");
    revalidatePath("/customer/messages");

    return { success: true };
}

export type EmailResult = { success: boolean; error?: string; message?: string };

// A one-off email to a specific customer, sent from the site's own address
// through Resend, not the in-app messaging. Separate from sendMessage: this
// reaches their inbox even if they never open the app.
export async function emailCustomer(profileId: string, subject: string, body: string): Promise<EmailResult> {
    const actor = await requireAdmin();
    const supabase = await createClient();

    const cleanSubject = subject.trim().slice(0, 200);
    const cleanBody = body.trim().slice(0, 5000);

    if (!profileId || !cleanSubject || !cleanBody) {
        return { success: false, error: "Choose a customer, then add a subject and a message." };
    }

    const { data: target } = await supabase
        .from("profiles")
        .select("id, full_name, email, role")
        .eq("id", profileId)
        .eq("role", "customer")
        .maybeSingle();

    if (!target) return { success: false, error: "Could not find that customer." };
    if (!target.email) return { success: false, error: "This customer has no email address on file." };

    const sent = await sendEmail({
        to: [target.email],
        subject: cleanSubject,
        html: `
            <p>Hi ${escapeHtml(target.full_name?.trim() || "there")},</p>
            <p style="white-space:pre-wrap">${escapeHtml(cleanBody)}</p>
        `,
        replyTo: actor.email || undefined,
    });

    if (!sent) {
        return { success: false, error: "Could not send the email. Check that Resend is configured, and try again." };
    }

    await logActivity(
        supabase,
        actor,
        "customer_emailed",
        `Emailed ${target.full_name ?? target.email} directly: "${cleanSubject}"`,
        { type: "profile", id: profileId }
    );

    return { success: true, message: `Emailed ${target.email}.` };
}
