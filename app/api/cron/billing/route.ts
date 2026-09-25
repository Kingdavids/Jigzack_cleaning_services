import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { runInvoiceGeneration, runScheduleGeneration } from "@/lib/billing/run";
import { runBillingEmails } from "@/lib/billing/notify";
import { monthLabel } from "@/lib/billing/pricing";
import { escapeHtml, sendEmail } from "@/lib/send-email";

// Called once a day by the GitHub Actions workflow in .github/workflows.
// Pickups are topped up every day (existing dates are skipped). Monthly
// invoices are created on the 1st, Lagos time, and never twice for a month.
// There is no signed-in user here, so it runs with the service key, and the
// shared secret is the only thing that lets a request in.

export const dynamic = "force-dynamic";

function sameSecret(given: string, expected: string) {
    // Hash first so the comparison is fixed length and timing safe.
    const a = createHash("sha256").update(given).digest();
    const b = createHash("sha256").update(expected).digest();
    return timingSafeEqual(a, b);
}

export async function POST(request: NextRequest) {
    const secret = process.env.CRON_SECRET;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;

    if (!secret || !serviceKey || !url) {
        return NextResponse.json({ error: "Scheduled billing is not configured." }, { status: 503 });
    }

    const given = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");

    if (!given || !sameSecret(given, secret)) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

    const lagosDay = new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Lagos" });
    const isFirstOfMonth = lagosDay.endsWith("-01");
    const forceInvoices = request.nextUrl.searchParams.get("invoices") === "force";

    const schedules = await runScheduleGeneration(supabase);
    const invoices = isFirstOfMonth || forceInvoices ? await runInvoiceGeneration(supabase) : null;

    // Invoice and reminder emails to customers go out after the invoices exist.
    const emails = await runBillingEmails(supabase);

    // Erase customers who have been in Recently deleted for 30 days, along with
    // their photo files. Before the recently-deleted SQL has run this does nothing.
    let purged = 0;
    const { data: purge } = await supabase.rpc("purge_deleted_customers", { p_days: 30 });

    if (purge && typeof purge === "object") {
        const result = purge as { purged?: number; photo_urls?: string[] };
        purged = Number(result.purged ?? 0);

        const paths = (result.photo_urls ?? [])
            .map((u) => u.split("/task-photos/")[1])
            .filter(Boolean)
            .map((p) => decodeURIComponent(p));

        if (paths.length > 0) await supabase.storage.from("task-photos").remove(paths);
    }

    const changed =
        schedules.created > 0 ||
        (invoices?.created ?? 0) > 0 ||
        (invoices?.error ?? 0) > 0 ||
        emails.newInvoices > 0 ||
        emails.reminders > 0 ||
        emails.failed > 0 ||
        purged > 0 ||
        Boolean(emails.skipped);

    if (changed) {
        const { data: admins } = await supabase
            .from("profiles")
            .select("email")
            .eq("role", "admin")
            .eq("status", "approved");

        const to = (admins ?? []).map((a) => a.email as string).filter(Boolean);

        const lines = [
            `<p>The daily billing job ran on ${escapeHtml(lagosDay)}.</p>`,
            `<p>Pickups added: <strong>${schedules.created}</strong> across ${schedules.customers} customers.</p>`,
        ];

        if (invoices) {
            lines.push(
                `<p>Invoices for ${escapeHtml(monthLabel())}: <strong>${invoices.created}</strong> created, ${invoices.exists} already existed` +
                    (invoices["no-pricing"] > 0 ? `, ${invoices["no-pricing"]} skipped because no priced property types are recorded` : "") +
                    (invoices.prepaid > 0 ? `, ${invoices.prepaid} skipped because they paid in advance` : "") +
                    (invoices.error > 0 ? `, <strong>${invoices.error} failed</strong>` : "") +
                    ".</p>"
            );
        }

        lines.push(
            `<p>Customer emails: <strong>${emails.newInvoices}</strong> new invoice notices, <strong>${emails.reminders}</strong> payment reminders` +
                (emails.failed > 0 ? `, <strong>${emails.failed} could not be sent</strong>` : "") +
                ".</p>"
        );

        if (purged > 0) lines.push(`<p>Erased <strong>${purged}</strong> customer${purged === 1 ? "" : "s"} that had been in Recently deleted for 30 days.</p>`);

        if (emails.skipped) lines.push(`<p><strong>Customer emails were skipped.</strong> ${escapeHtml(emails.skipped)}</p>`);

        lines.push("<p>Review and edit them in the admin dashboard under Tasks and Payments.</p>");

        await sendEmail({ to, subject: "Jigzack billing job summary", html: lines.join("") });
    }

    // Pickups whose date has passed are marked serviced. Quietly does nothing before the crew SQL has run.
    await supabase.rpc("mark_past_tasks_serviced");

    // Old notifications are not kept forever. Quietly does nothing before the table exists.
    await supabase
        .from("notifications")
        .delete()
        .lt("created_at", new Date(Date.now() - 60 * 86_400_000).toISOString());

    return NextResponse.json({ ok: true, day: lagosDay, schedules, invoices, emails, purged });
}
