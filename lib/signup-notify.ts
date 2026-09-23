"use server";

import { createClient } from "@/utils/supabase/server";
import { escapeHtml, sendEmail } from "@/lib/send-email";

// Callable from the (logged-out) signup form, so it only reports that a
// signup happened -- never trust these values beyond display in an email.
export async function notifyAdminsOfSignup(fullName: string, email: string, role: string) {
    const supabase = await createClient();
    const { data: recipients, error } = await supabase.rpc("approved_admin_emails");

    if (error) {
        console.error("Could not load admin emails for signup notification:", error.message);
        return;
    }

    if (!recipients || recipients.length === 0) return;

    const safeRole = role === "employee" ? "employee" : "customer";
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "";

    await sendEmail({
        to: recipients,
        subject: `New ${safeRole} signup awaiting approval`,
        html: `
            <p><strong>${escapeHtml(fullName.slice(0, 120))}</strong> (${escapeHtml(email.slice(0, 200))}) just signed up as a <strong>${safeRole}</strong> and is waiting for approval.</p>
            ${siteUrl ? `<p><a href="${escapeHtml(siteUrl)}/admin/approvals">Review in the admin dashboard</a></p>` : ""}
        `,
    });
}
