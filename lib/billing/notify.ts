import type { SupabaseClient } from "@supabase/supabase-js";
import { naira } from "@/lib/customer/billing";
import { newInvoiceEmail, reminderEmail } from "@/lib/billing-email";
import { sendEmail } from "@/lib/send-email";
import { SITE } from "@/lib/seo";

// Emails customers about their invoices: one when an automatic invoice is new,
// then reminders 7 and 21 days later if it is still unpaid. What has already
// been sent is recorded on the invoice itself, so a re-run never repeats an
// email. Invoices that existed before this feature, and invoices an admin
// wrote by hand, are left alone.

const FIRST_REMINDER_DAYS = 7;
const SECOND_REMINDER_DAYS = 21;
// A new invoice only gets its "ready" email if it is recent, so switching this
// on does not email about old invoices.
const NEW_INVOICE_WINDOW_DAYS = 3;
// Resend limits how fast we can send; a short pause keeps a big batch safe.
const PAUSE_MS = 600;

type InvoiceRow = {
    id: string;
    amount: number;
    arrears: number | null;
    invoice_month: string | null;
    created_at: string;
    auto_generated: boolean;
    invoice_emailed_at: string | null;
    reminders_sent: number | null;
    customer: { full_name: string | null; email: string | null } | null;
};

const lagosDay = (value: string | Date) =>
    new Date(value).toLocaleDateString("en-CA", { timeZone: "Africa/Lagos" });

const dayNumber = (key: string) => Math.floor(Date.UTC(+key.slice(0, 4), +key.slice(5, 7) - 1, +key.slice(8, 10)) / 86_400_000);

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export type BillingEmailResult = { newInvoices: number; reminders: number; failed: number; skipped?: string };

export async function runBillingEmails(supabase: SupabaseClient): Promise<BillingEmailResult> {
    const result: BillingEmailResult = { newInvoices: 0, reminders: 0, failed: 0 };

    const { data, error } = await supabase
        .from("payments")
        .select(
            "id, amount, arrears, invoice_month, created_at, auto_generated, invoice_emailed_at, reminders_sent, customer:profiles!payments_customer_id_fkey(full_name, email)"
        )
        .eq("auto_generated", true)
        .neq("status", "paid");

    if (error) {
        // Most likely the tracking columns haven't been added yet.
        console.error("Billing emails skipped:", error.message);
        return { ...result, skipped: "Run supabase/billing-emails-2026-09.sql in the Supabase SQL editor." };
    }

    const today = dayNumber(lagosDay(new Date()));
    const invoices = (data ?? []) as unknown as InvoiceRow[];
    let sentAny = false;

    for (const invoice of invoices) {
        const email = invoice.customer?.email;
        if (!email) continue;

        const age = today - dayNumber(lagosDay(invoice.created_at));
        const details = {
            name: invoice.customer?.full_name ?? null,
            month: invoice.invoice_month ?? "this month",
            total: naira(Number(invoice.amount ?? 0) + Number(invoice.arrears ?? 0)),
            link: `${SITE.url}/customer/invoices/${invoice.id}`,
        };
        const sent = invoice.reminders_sent ?? 0;

        let message: { subject: string; html: string } | null = null;
        let update: Record<string, unknown> | null = null;
        let kind: "new" | "reminder" | null = null;

        if (!invoice.invoice_emailed_at) {
            if (age <= NEW_INVOICE_WINDOW_DAYS) {
                message = newInvoiceEmail(details);
                update = { invoice_emailed_at: new Date().toISOString() };
                kind = "new";
            }
        } else if (sent === 0 && age >= FIRST_REMINDER_DAYS) {
            message = reminderEmail({ ...details, number: 1 });
            update = { reminders_sent: 1, last_reminder_at: new Date().toISOString() };
            kind = "reminder";
        } else if (sent === 1 && age >= SECOND_REMINDER_DAYS) {
            message = reminderEmail({ ...details, number: 2 });
            update = { reminders_sent: 2, last_reminder_at: new Date().toISOString() };
            kind = "reminder";
        }

        if (!message || !update || !kind) continue;

        if (sentAny) await wait(PAUSE_MS);
        sentAny = true;

        const delivered = await sendEmail({ to: [email], subject: message.subject, html: message.html, replyTo: SITE.email });

        if (!delivered) {
            result.failed += 1;
            continue;
        }

        const { error: updateError } = await supabase.from("payments").update(update).eq("id", invoice.id);
        if (updateError) console.error("Could not record billing email:", updateError.message);

        if (kind === "new") result.newInvoices += 1;
        else result.reminders += 1;
    }

    return result;
}
