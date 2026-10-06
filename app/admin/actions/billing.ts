"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";
import { getUserProfile } from "@/lib/auth/getUserProfile";
import { logActivity } from "@/lib/activity";
import { billingMonthLabel } from "@/lib/billing/pricing";
import { round2 } from "@/lib/billing/balance";
import { frequencyToDays } from "@/lib/billing/schedule";
import { naira } from "@/lib/customer/billing";
import { discountInfo, generateInvoiceFor, generateScheduleFor, loadBillable, loadEstateUnits, planSchedule, recalculateOpenInvoice } from "@/lib/billing/generate";
import { runInvoiceGeneration, runScheduleGeneration } from "@/lib/billing/run";
import { requireAdmin } from "./shared";

export type GenerateResult = { success: boolean; message: string };

export type MonthlyRateResult = { success: boolean; error?: string; message?: string };

// The amount used for this customer's monthly invoices. Empty goes back to
// working it out from their property details.
export async function setMonthlyRate(profileId: string, amount: number | null): Promise<MonthlyRateResult> {
    const actor = await requireAdmin();
    const supabase = await createClient();

    if (!profileId) return { success: false, error: "Missing customer." };

    const value = amount === null ? null : round2(Number(amount));

    if (value !== null && (!Number.isFinite(value) || value <= 0 || value > 100_000_000)) {
        return { success: false, error: "Enter an amount greater than zero." };
    }

    const { data: before } = await supabase.from("customers").select("full_name").eq("profile_id", profileId).maybeSingle();
    if (!before) return { success: false, error: "Customer not found." };

    const { error } = await supabase.from("customers").update({ monthly_rate: value }).eq("profile_id", profileId);

    if (error) {
        console.error("setMonthlyRate error:", error.message);
        return {
            success: false,
            error: /monthly_rate/.test(error.message)
                ? "Not switched on yet. Run supabase/billing-installments-2026-09.sql in Supabase first."
                : "Could not save the monthly charge. Please try again.",
        };
    }

    // This month's invoice follows the new charge if it is still untouched.
    const billable = await loadBillable(supabase, profileId);
    const repriced = billable ? await recalculateOpenInvoice(supabase, billable) : false;

    await logActivity(
        supabase,
        actor,
        "monthly_rate_changed",
        value === null
            ? `Set ${before.full_name ?? "a customer"} back to the calculated monthly charge`
            : `Set the monthly charge for ${before.full_name ?? "a customer"} to ${naira(value)}`,
        { type: "profile", id: profileId }
    );
    revalidatePath(`/admin/customers/${profileId}`);
    revalidatePath("/admin/estates");
    revalidatePath("/admin/payments");
    revalidatePath("/customer");
    revalidatePath("/customer/payments");

    return {
        success: true,
        message:
            (value === null ? "Back to the calculated monthly charge." : `Monthly charge set to ${naira(value)}.`) +
            (repriced ? " This month's open invoice was updated." : ""),
    };
}

export type DiscountResult = { success: boolean; error?: string; message?: string };

// A discount for one customer: a percentage or a fixed amount off their
// monthly charge, shown as its own line on the invoice. type = null removes it.
export async function setCustomerDiscount(
    profileId: string,
    type: "percent" | "amount" | null,
    value: number | null,
    reason: string
): Promise<DiscountResult> {
    const actor = await requireAdmin();
    const supabase = await createClient();

    if (!profileId) return { success: false, error: "Missing customer." };

    const { data: before } = await supabase.from("customers").select("full_name").eq("profile_id", profileId).maybeSingle();
    if (!before) return { success: false, error: "Customer not found." };

    let update: { discount_type: "percent" | "amount" | null; discount_value: number | null; discount_reason: string | null; discount_set_by: string | null; discount_set_at: string | null };

    if (type === null) {
        update = { discount_type: null, discount_value: null, discount_reason: null, discount_set_by: null, discount_set_at: null };
    } else {
        const amount = round2(Number(value));

        if (!Number.isFinite(amount) || amount <= 0) {
            return { success: false, error: "Enter a discount greater than zero." };
        }
        if (type === "percent" && amount > 100) {
            return { success: false, error: "A percentage discount can't be over 100." };
        }
        if (type === "amount" && amount > 100_000_000) {
            return { success: false, error: "That amount looks too large. Please check it." };
        }

        update = {
            discount_type: type,
            discount_value: amount,
            discount_reason: reason.trim().slice(0, 200) || null,
            discount_set_by: actor.id,
            discount_set_at: new Date().toISOString(),
        };
    }

    const { error } = await supabase.from("customers").update(update).eq("profile_id", profileId);

    if (error) {
        console.error("setCustomerDiscount error:", error.message);
        return {
            success: false,
            error: /discount_/.test(error.message)
                ? "Not switched on yet. Run supabase/customer-discount-2026-09.sql in Supabase first."
                : "Could not save the discount. Please try again.",
        };
    }

    // This month's invoice follows the new discount if it is still untouched.
    const billable = await loadBillable(supabase, profileId);
    const repriced = billable ? await recalculateOpenInvoice(supabase, billable) : false;
    // Shown as a percentage either way, so it reads the same as the invoice line does.
    const estateUnits = billable?.is_estate ? await loadEstateUnits(supabase, profileId) : undefined;
    const percent = billable ? discountInfo(billable, estateUnits)?.percent : null;

    const describe =
        type === null
            ? `Removed the discount for ${before.full_name ?? "a customer"}`
            : `Set a ${percent ?? update.discount_value}% discount for ${before.full_name ?? "a customer"}${
                  type === "amount" ? ` (${naira(update.discount_value ?? 0)})` : ""
              }`;

    await logActivity(supabase, actor, "customer_discount_changed", describe, { type: "profile", id: profileId });
    revalidatePath(`/admin/customers/${profileId}`);
    revalidatePath("/admin/customers");
    revalidatePath("/admin/payments");
    revalidatePath("/customer");
    revalidatePath("/customer/payments");

    return {
        success: true,
        message:
            (type === null ? "Discount removed." : `Discount set: ${percent ?? update.discount_value}% off.`) +
            (repriced ? " This month's open invoice was updated." : ""),
    };
}

export async function generateAllSchedules(): Promise<GenerateResult> {
    const actor = await requireAdmin();
    const supabase = await createClient();

    const { customers, created, unrecognised } = await runScheduleGeneration(supabase);

    await logActivity(supabase, actor, "schedules_generated", `Generated schedules: ${created} pickups added`);
    revalidatePath("/admin/tasks");
    revalidatePath("/admin");

    return {
        success: true,
        message:
            `Added ${created} pickups across ${customers} customers.` +
            (unrecognised > 0 ? ` ${unrecognised} had a frequency we couldn't read and defaulted to weekly.` : ""),
    };
}

export async function generateAllInvoices(): Promise<GenerateResult> {
    const actor = await requireAdmin();
    const supabase = await createClient();

    const tally = await runInvoiceGeneration(supabase);

    await logActivity(supabase, actor, "invoices_generated", `Generated ${billingMonthLabel()} invoices: ${tally.created} created`);
    revalidatePath("/admin/payments");
    revalidatePath("/customer/payments");

    return {
        success: true,
        message:
            `${tally.created} invoices created for ${billingMonthLabel()}, ${tally.exists} already existed` +
            (tally["no-pricing"] > 0 ? `, ${tally["no-pricing"]} skipped (no priced property types, add manually)` : "") +
            (tally.prepaid > 0 ? `, ${tally.prepaid} skipped (paid in advance)` : "") +
            (tally.error > 0 ? `, ${tally.error} failed` : "") +
            ".",
    };
}

export type SchedulePreview = {
    success: boolean;
    error?: string;
    name?: string;
    // What the property details say, and how the app read it.
    source?: string;
    label?: string;
    recognised?: boolean;
    // The pickups that would be created (YYYY-MM-DD), and how many already exist.
    dates?: string[];
    alreadyScheduled?: number;
    // "the rest of September", "October 2026" or "the next 4 weeks".
    windowLabel?: string;
    // The weekdays the detected frequency comes to (Monday = 1), to fill the day picker.
    suggestedDays?: number[];
    // True when the customer already has days saved by an admin.
    savedDays?: boolean;
};

export type ScheduleRequest = {
    frequencyText?: string | null;
    days?: number[] | null;
    period?: "thisMonth" | "nextMonth" | null;
    // Keep the chosen days for this customer, so later schedules use them too.
    remember?: boolean;
};

// Shows what "Generate schedule" would create for a customer, without creating
// anything. Read from the frequency in their property details, or from a
// frequency the admin picks instead.
export async function previewCustomerSchedule(profileId: string, request: ScheduleRequest = {}): Promise<SchedulePreview> {
    const profile = await getUserProfile();

    if (profile.role !== "admin" || profile.status !== "approved") {
        return { success: false, error: "Not authorized" };
    }

    const supabase = await createClient();
    const billable = await loadBillable(supabase, profileId);

    if (!billable) return { success: false, error: "Customer not found." };

    const plan = await planSchedule(supabase, billable, request);
    // What the customer's own record comes to, ignoring anything picked in this request.
    const own = await planSchedule(supabase, billable, { period: null });

    return {
        success: true,
        name: billable.full_name ?? undefined,
        source: plan.source,
        label: plan.label,
        recognised: plan.recognised,
        dates: plan.fresh,
        alreadyScheduled: plan.alreadyScheduled,
        windowLabel: plan.windowLabel,
        suggestedDays: frequencyToDays(own.frequency),
        savedDays: (billable.pickup_days ?? []).length > 0,
    };
}

export async function generateCustomerBilling(
    profileId: string,
    what: "schedule" | "invoice",
    request: ScheduleRequest = {}
): Promise<GenerateResult> {
    const actor = await requireAdmin();
    const supabase = await createClient();

    const billable = await loadBillable(supabase, profileId);
    if (!billable) return { success: false, message: "Customer not found." };

    revalidatePath("/admin/tasks");
    revalidatePath("/admin");
    revalidatePath("/admin/payments");
    revalidatePath(`/admin/customers/${profileId}`);

    if (what === "schedule") {
        const result = await generateScheduleFor(supabase, billable, request);

        // Remember the days chosen for this customer, so the daily top-up and any
        // later schedule use the same pattern instead of guessing again.
        let remembered = "";
        const chosen = [...new Set((request.days ?? []).filter((d) => d >= 1 && d <= 6))].sort();

        if (request.remember && chosen.length > 0) {
            const { error: saveError } = await supabase.from("customers").update({ pickup_days: chosen }).eq("profile_id", profileId);
            remembered = saveError
                ? " The days could not be saved for next time. Run supabase/schedule-days-2026-09.sql in Supabase."
                : " These days are saved for this customer.";
        }

        if (result.created > 0) {
            await logActivity(supabase, actor, "schedule_generated", `Generated ${result.created} pickups for ${billable.full_name ?? "a customer"} (${result.frequency})`, { type: "profile", id: profileId });
            revalidatePath("/admin/tasks");
            revalidatePath("/admin");
        }

        return {
            success: true,
            message: (result.created > 0 ? `Added ${result.created} pickups (${result.frequency}).` : "Their schedule is already up to date.") + remembered,
        };
    }

    const outcome = await generateInvoiceFor(supabase, billable);
    const messages: Record<string, string> = {
        created: `Invoice created for ${billingMonthLabel()}.`,
        exists: `An invoice for ${billingMonthLabel()} already exists.`,
        prepaid: `${billingMonthLabel()} was paid in advance, so no invoice is needed.`,
        "no-pricing": "No priced property types are recorded for this customer. Add an invoice manually.",
        error: "Could not create the invoice.",
    };

    return { success: outcome === "created" || outcome === "exists" || outcome === "prepaid", message: messages[outcome] };
}

// ---------------------------------------------------------------------------
// Customer records
// ---------------------------------------------------------------------------
