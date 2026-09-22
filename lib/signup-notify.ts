"use server";

import { createClient } from "@/utils/supabase/server";

export async function notifyAdminsOfSignup(fullName: string, email: string, role: string) {
    const apiKey = process.env.RESEND_API_KEY;

    if (!apiKey) {
        console.warn("RESEND_API_KEY not configured; skipping new-signup admin email.");
        return;
    }

    const supabase = await createClient();
    const { data: recipients, error } = await supabase.rpc("approved_admin_emails");

    if (error) {
        console.error("Could not load admin emails for signup notification:", error.message);
        return;
    }

    if (!recipients || recipients.length === 0) return;

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "";
    const fromAddress = process.env.RESEND_FROM_EMAIL ?? "Jigzack Cleaning Services <onboarding@resend.dev>";

    try {
        const response = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
                Authorization: `Bearer ${apiKey}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                from: fromAddress,
                to: recipients,
                subject: `New ${role} signup awaiting approval`,
                html: `
                    <p><strong>${fullName}</strong> (${email}) just signed up as a <strong>${role}</strong> and is waiting for approval.</p>
                    ${siteUrl ? `<p><a href="${siteUrl}/admin/approvals">Review in the admin dashboard</a></p>` : ""}
                `,
            }),
        });

        if (!response.ok) {
            console.error("Resend signup email failed:", response.status, await response.text());
        }
    } catch (err) {
        console.error("Failed to send admin signup email:", err);
    }
}
