"use server";

import { createClient } from "@/utils/supabase/server";
import { getUserProfile } from "@/lib/auth/getUserProfile";
import { escapeHtml, sendEmail } from "@/lib/send-email";
import { siteOrigin } from "@/lib/site-origin";

// Sent when an applicant finishes the setup form -- the point they're really
// awaiting review with their details on file -- not at raw signup, which
// happens before their email is confirmed and before there's anything to
// review. Everything in the email comes from the caller's own session, never
// from client-supplied values, so it can't be used to send arbitrary email.
export async function notifyAdminsOfNewApplication() {
    const profile = await getUserProfile();

    if (profile.status !== "pending") return;

    const supabase = await createClient();
    const { data: recipients, error } = await supabase.rpc("approved_admin_emails");

    if (error) {
        console.error("Could not load admin emails for application notification:", error.message);
        return;
    }

    if (!recipients || recipients.length === 0) return;

    const role = profile.role === "employee" ? "employee" : "customer";
    const origin = await siteOrigin();
    const reviewUrl = `${origin}/admin/approvals#user-${profile.id}`;

    await sendEmail({
        to: recipients,
        subject: `New ${role} application awaiting approval`,
        html: `
            <p><strong>${escapeHtml(profile.full_name ?? "A new user")}</strong> (${escapeHtml(profile.email ?? "no email")}) has completed their ${role} setup and is waiting for approval.</p>
            <p><a href="${escapeHtml(reviewUrl)}">Review and approve in the admin dashboard</a></p>
            <p>You'll be asked to log in first if you aren't already.</p>
        `,
    });
}
