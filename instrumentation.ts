import type { Instrumentation } from "next";

// Emails the developer when a page or server action crashes, so a broken
// screen gets noticed before a customer reports it. Set ERROR_ALERT_EMAILS
// (comma separated) to turn it on; without it errors only appear in the
// Railway logs, as before.

const lastSent = new Map<string, number>();
const COOLDOWN_MS = 60 * 60 * 1000;

export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
    if (process.env.NEXT_RUNTIME !== "nodejs") return;

    const err = error as Error & { digest?: string };

    // Redirects and 404s are how Next.js normally works, not failures.
    if (/^NEXT_(REDIRECT|NOT_FOUND|HTTP_ERROR_FALLBACK)/.test(err.digest ?? "") || /NEXT_REDIRECT|NEXT_NOT_FOUND/.test(err.message)) {
        return;
    }

    const recipients = (process.env.ERROR_ALERT_EMAILS ?? "")
        .split(",")
        .map((e) => e.trim())
        .filter(Boolean);

    if (recipients.length === 0) return;

    // One email per distinct error per hour, so a bad page can't fill an inbox.
    const key = `${context.routePath}:${err.message}`.slice(0, 300);
    const now = Date.now();
    if (now - (lastSent.get(key) ?? 0) < COOLDOWN_MS) return;
    lastSent.set(key, now);

    const { escapeHtml, sendEmail } = await import("@/lib/send-email");

    // Only where and what: no headers, cookies or request bodies, which could
    // hold customer details.
    await sendEmail({
        to: recipients,
        subject: `Jigzack site error on ${context.routePath}`,
        html: `
            <p>A ${escapeHtml(context.routeType)} error happened on <strong>${escapeHtml(context.routePath)}</strong>.</p>
            <p>${escapeHtml(request.method)} ${escapeHtml(request.path.split("?")[0])}</p>
            <p><strong>${escapeHtml(err.message || "No message")}</strong></p>
            <p style="color:#666">Reference: ${escapeHtml(err.digest ?? "none")}. Search the Railway logs for it to see the full trace.</p>
        `,
    });
};
