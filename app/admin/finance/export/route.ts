import { createClient } from "@/utils/supabase/server";
import { getUserProfile } from "@/lib/auth/getUserProfile";
import { loadCashflow, monthsEndingAt } from "@/lib/finance/cashflow";
import { cashflowCsv } from "@/lib/finance/cashflow-csv";
import { TIMEZONE } from "@/lib/config/business";

// Money in & out for a month as a CSV file, with the six months up to it.
// Anyone who can open the Money in & out page can download it.

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
    const profile = await getUserProfile();

    if (profile.role !== "admin" || profile.status !== "approved") {
        return new Response("Not authorized", { status: 403 });
    }

    const thisMonth = new Date().toLocaleDateString("en-CA", { timeZone: TIMEZONE }).slice(0, 7);
    const asked = new URL(request.url).searchParams.get("month") ?? "";
    const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(asked) && asked <= thisMonth ? asked : thisMonth;

    const supabase = await createClient();
    const flows = await loadCashflow(supabase, monthsEndingAt(month, 6));

    return new Response(cashflowCsv(flows, month), {
        headers: {
            "Content-Type": "text/csv; charset=utf-8",
            "Content-Disposition": `attachment; filename="money-in-and-out-${month}.csv"`,
            "Cache-Control": "no-store",
        },
    });
}
