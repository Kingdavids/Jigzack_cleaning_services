"use server";

import { headers } from "next/headers";
import { escapeHtml, sendEmail } from "@/lib/send-email";

export type ContactState = { success: boolean; error?: string } | null;

// Every enquiry goes to all three inboxes. Kept server-side so the personal
// addresses never appear in the page. CONTACT_RECIPIENTS (comma separated)
// overrides this without a code change.
const DEFAULT_RECIPIENTS = ["info@jigzack.com", "razackolajide@gmail.com", "jigzackcleaningservices@gmail.com"];

function recipients() {
    const configured = (process.env.CONTACT_RECIPIENTS ?? "")
        .split(",")
        .map((e) => e.trim())
        .filter(Boolean);

    return configured.length > 0 ? configured : DEFAULT_RECIPIENTS;
}

// Best-effort limit per visitor (per server instance) so the form can't be
// used to flood the inboxes.
const recent = new Map<string, number[]>();
const WINDOW_MS = 10 * 60 * 1000;
const MAX_PER_WINDOW = 3;

export async function sendContactMessage(_prev: ContactState, formData: FormData): Promise<ContactState> {
    // Hidden field real visitors never fill in.
    if (String(formData.get("website") || "").trim()) return { success: true };

    const name = String(formData.get("name") || "").trim().slice(0, 120);
    const email = String(formData.get("email") || "").trim().slice(0, 200);
    const phone = String(formData.get("phone") || "").trim().slice(0, 40);
    const message = String(formData.get("message") || "").trim().slice(0, 4000);

    if (!name || !message) return { success: false, error: "Please enter your name and a message." };
    if (!email && !phone) return { success: false, error: "Please give us an email address or phone number so we can reply." };
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return { success: false, error: "That email address doesn't look right." };
    }

    const h = await headers();
    const visitor = (h.get("x-forwarded-for") ?? "unknown").split(",")[0].trim();
    const now = Date.now();
    const timestamps = (recent.get(visitor) ?? []).filter((t) => now - t < WINDOW_MS);

    if (timestamps.length >= MAX_PER_WINDOW) {
        return { success: false, error: "You've sent a few messages already. Please try again in a little while, or call us." };
    }

    recent.set(visitor, [...timestamps, now]);

    const sent = await sendEmail({
        to: recipients(),
        replyTo: email || undefined,
        subject: `Website enquiry from ${name}`,
        html: `
            <p><strong>${escapeHtml(name)}</strong> sent a message through the website.</p>
            <p>Email: ${escapeHtml(email || "not given")}<br>Phone: ${escapeHtml(phone || "not given")}</p>
            <p style="white-space:pre-wrap">${escapeHtml(message)}</p>
        `,
    });

    if (!sent) {
        return { success: false, error: "We couldn't send your message just now. Please call us on 0703 433 9721." };
    }

    return { success: true };
}
