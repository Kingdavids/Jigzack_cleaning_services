import { escapeHtml, sendEmail } from "@/lib/send-email";

export type EmailRecipient = { email: string | null; full_name: string | null };

// Sends the same message individually to each recipient, addressed by name, in
// small batches so one broadcast doesn't hit Resend's rate limit all at once.
// Best effort: a recipient whose email fails is skipped, never thrown, so a
// broadcast that mostly succeeds is never reported as a total failure.
export async function emailEachRecipient(
    recipients: EmailRecipient[],
    subject: string,
    body: string,
    batchSize = 8
): Promise<number> {
    const withEmail = recipients.filter((r): r is { email: string; full_name: string | null } => Boolean(r.email));

    if (withEmail.length === 0) return 0;

    const html = (name: string | null) => `
        <p>Hi ${escapeHtml(name?.trim() || "there")},</p>
        <p style="white-space:pre-wrap">${escapeHtml(body)}</p>
    `;

    let sent = 0;

    for (let i = 0; i < withEmail.length; i += batchSize) {
        const batch = withEmail.slice(i, i + batchSize);
        const results = await Promise.all(
            batch.map((r) => sendEmail({ to: [r.email], subject, html: html(r.full_name) }).catch(() => false))
        );
        sent += results.filter(Boolean).length;

        // A short pause between batches keeps a large broadcast under the rate limit.
        if (i + batchSize < withEmail.length) await new Promise((resolve) => setTimeout(resolve, 400));
    }

    return sent;
}
