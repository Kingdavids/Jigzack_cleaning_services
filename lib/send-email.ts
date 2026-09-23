export function escapeHtml(value: string) {
    return value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

// Server-only helper (imported by server actions). Skips quietly when
// Resend isn't configured so a missing key never breaks the calling flow.
export async function sendEmail({
                                         to,
                                         subject,
                                         html,
                                         replyTo,
                                     }: {
    to: string[];
    subject: string;
    html: string;
    replyTo?: string;
}) {
    const apiKey = process.env.RESEND_API_KEY;

    if (!apiKey) {
        console.warn("RESEND_API_KEY not configured; skipping email:", subject);
        return false;
    }

    if (to.length === 0) return false;

    const from = process.env.RESEND_FROM_EMAIL ?? "Jigzack Cleaning Services <onboarding@resend.dev>";

    try {
        const response = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
                Authorization: `Bearer ${apiKey}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ from, to, subject, html, ...(replyTo ? { reply_to: replyTo } : {}) }),
        });

        if (!response.ok) {
            console.error("Resend email failed:", response.status, await response.text());
            return false;
        }

        return true;
    } catch (err) {
        console.error("Failed to send email:", err);
        return false;
    }
}
