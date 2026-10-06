import { escapeHtml } from "@/lib/send-email";
import { BUSINESS, REGISTRATION_FEE_NGN } from "@/lib/config/business";

const SUPPORT_PHONES = BUSINESS.contact.supportPhones.join(" / ");

export function approvalEmail({
                                  name,
                                  role,
                                  status,
                                  origin,
                                  isTenant,
                                  feeWaived = false,
                                  isCommercial = false,
                                  reason,
                              }: {
    name: string | null;
    role: string;
    status: "approved" | "declined";
    origin: string;
    isTenant: boolean;
    feeWaived?: boolean;
    isCommercial?: boolean;
    reason?: string | null;
}) {
    const greeting = `Hi ${escapeHtml(name?.trim() || "there")},`;
    const loginUrl = `${origin}/auth`;

    if (status === "declined") {
        return {
            subject: `Update on your ${BUSINESS.name} application`,
            html: `
                <p>${greeting}</p>
                <p>Thank you for applying. Unfortunately we couldn't approve your account at this time.</p>
                ${reason ? `<p>Reason: ${escapeHtml(reason)}</p>` : ""}
                <p>If you think this is a mistake, or you'd like to send us more information, please get in touch on ${SUPPORT_PHONES}.</p>
                <p>${BUSINESS.name}</p>
            `,
        };
    }

    const fee = REGISTRATION_FEE_NGN;
    const next =
        role === "employee"
            ? "Log in to see your assigned tasks."
            : isTenant
                ? "Log in to raise complaints and view your estate's shared utility bill."
                : feeWaived
                    ? "As an existing customer there is no registration fee. Log in to see your pickup schedule, invoices and messages."
                    : `Log in to see your pickup schedule, invoices and messages. On your first login you'll be asked to pay a one-time registration fee of ₦${fee.toLocaleString()} to activate your dashboard.`;

    return {
        subject: `Your ${BUSINESS.name} account is approved`,
        html: `
            <p>${greeting}</p>
            <p>Good news: your account has been approved.</p>
            <p>${next}</p>
            ${
                isCommercial && role === "customer" && !isTenant
                    ? "<p>Because you are a commercial facility, we inspect and survey the site before we give a quote. Our team will contact you to arrange the visit.</p>"
                    : ""
            }
            <p><a href="${escapeHtml(loginUrl)}">Log in to your account</a></p>
            <p>Questions? Call us on ${SUPPORT_PHONES}.</p>
            <p>${BUSINESS.name}</p>
        `,
    };
}
