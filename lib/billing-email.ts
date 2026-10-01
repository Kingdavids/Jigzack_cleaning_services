import { escapeHtml } from "@/lib/send-email";

const PHONE = "0703 433 9721";

function wrap(body: string, link: string, button: string) {
    return `
        ${body}
        <p style="margin:24px 0">
            <a href="${escapeHtml(link)}" style="background:#fbbf24;color:#000;padding:12px 20px;border-radius:10px;text-decoration:none;font-weight:bold">${escapeHtml(button)}</a>
        </p>
        <p>Questions about the amount? Reply to this email or call ${PHONE}.</p>
        <p>Jigzack Cleaning Services</p>
    `;
}

type Details = { name: string | null; month: string; total: string; link: string };

export function newInvoiceEmail({ name, month, total, link }: Details) {
    return {
        subject: `Your Jigzack invoice for ${month}`,
        html: wrap(
            `<p>Hi ${escapeHtml(name?.trim() || "there")},</p>
             <p>Your invoice for <strong>${escapeHtml(month)}</strong> is ready. The amount is <strong>${escapeHtml(total)}</strong>.</p>
             <p>You can view, print or download it in your dashboard. The payment details are on the invoice.</p>`,
            link,
            "View your invoice"
        ),
    };
}

export function reminderEmail({ name, month, total, link, number }: Details & { number: 1 | 2 }) {
    const opening =
        number === 1
            ? `Our records show your invoice for <strong>${escapeHtml(month)}</strong> (${escapeHtml(total)}) has not been paid yet.`
            : `This is a second reminder that your invoice for <strong>${escapeHtml(month)}</strong> (${escapeHtml(total)}) is still unpaid.`;

    return {
        subject: number === 1 ? `Reminder: your ${month} invoice is still open` : `Second reminder: your ${month} invoice`,
        html: wrap(
            `<p>Hi ${escapeHtml(name?.trim() || "there")},</p>
             <p>${opening}</p>
             <p>If you have already paid, please reply with your payment details so we can update your record.</p>`,
            link,
            "View your invoice"
        ),
    };
}
