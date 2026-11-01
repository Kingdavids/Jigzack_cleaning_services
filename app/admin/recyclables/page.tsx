import { ArrowDownLeft, ArrowUpRight, Boxes, Coins, HandCoins, Truck } from "lucide-react";
import { requireDashboardAccess } from "@/lib/dashboard/requireDashboardAccess";
import Link from "next/link";
import { formatDate, naira } from "@/lib/customer/billing";
import { isFullAdmin } from "@/lib/auth/roles";
import { categoryLabel, RECYCLABLES_CATEGORIES } from "@/lib/expenses";
import { COMMON_MATERIALS, kgText, loadBuyPrices, materialLabel, MATERIALS, summarise, type Movement } from "@/lib/recyclables";
import { monthName } from "@/lib/finance/cashflow";
import DashboardShell from "@/components/dashboard/DashboardShell";
import SectionCard from "@/components/dashboard/SectionCard";
import StatCard from "@/components/dashboard/StatCard";
import RecyclableForm from "@/components/dashboard/RecyclableForm";
import RecyclableEditButton from "@/components/dashboard/RecyclableEditButton";
import BuyPricesForm from "@/components/dashboard/BuyPricesForm";
import RecyclableDeleteButton from "@/components/dashboard/RecyclableDeleteButton";
import ExpenseForm from "@/components/dashboard/ExpenseForm";
import StatusBadge from "@/components/dashboard/StatusBadge";
import { logAdminExpense } from "@/app/admin/actions/expenses";
import { TIMEZONE } from "@/lib/config/business";

const lagosDay = (date: Date) => date.toLocaleDateString("en-CA", { timeZone: TIMEZONE });

export default async function AdminRecyclablesPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
    const { profile, supabase, unreadCount } = await requireDashboardAccess("admin");
    const params = await searchParams;

    const today = lagosDay(new Date());
    const thisMonth = today.slice(0, 7);
    const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(params.month ?? "") && (params.month as string) <= thisMonth ? (params.month as string) : thisMonth;

    // amount and payment_id come from the trading SQL; without it the page still works by weight.
    const load = (columns: string) =>
        supabase
            .from("recyclable_movements")
            .select(columns)
            .order("movement_date", { ascending: false })
            .order("created_at", { ascending: false })
            .limit(20000);
    const BASE = "id, direction, material, material_note, kg, movement_date, party, note, created_at";
    const withMoney = await load(`${BASE}, amount, payment_id`);
    const { data, error } = withMoney.error ? await load(BASE) : withMoney;
    const hasMoney = !withMoney.error;

    const movements = (error ? [] : (data ?? [])) as unknown as Movement[];
    const inMonth = movements.filter((m) => m.movement_date.startsWith(month));

    // Stock is everything ever in minus everything ever out; the month shows what moved.
    const stock = summarise(movements);
    const monthly = summarise(inMonth);
    // Money this month: what was paid buying, and what sales came to.
    const spent = inMonth.filter((m) => m.direction === "in").reduce((sum, m) => sum + Number(m.amount ?? 0), 0);
    const sold = inMonth.filter((m) => m.direction === "out").reduce((sum, m) => sum + Number(m.amount ?? 0), 0);
    const canAct = isFullAdmin(profile);
    const prices = await loadBuyPrices(supabase);

    // Recyclables expenses of the month: cash paid for material that isn't a priced entry above,
    // and what handling it cost (transport, loading, gate and security).
    // Approved and paid-back ones count as spent, the same as on Money in & out.
    const [year, mon] = month.split("-").map(Number);
    const nextMonth = mon === 12 ? `${year + 1}-01` : `${year}-${String(mon + 1).padStart(2, "0")}`;
    const { data: expenseData } = await supabase
        .from("expenses")
        .select("id, amount, category, note, expense_date, status, employee:profiles!expenses_employee_id_fkey(full_name)")
        .in("category", RECYCLABLES_CATEGORIES.map((c) => c.value))
        .gte("expense_date", `${month}-01`)
        .lt("expense_date", `${nextMonth}-01`)
        .order("expense_date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(200);
    const expenses = (expenseData ?? []) as unknown as {
        id: string;
        amount: number;
        category: string;
        note: string | null;
        expense_date: string;
        status: string;
        employee: { full_name: string | null } | null;
    }[];
    const countedExpenses = expenses.filter((e) => e.status === "approved" || e.status === "reimbursed");
    const sum = (list: typeof expenses) => list.reduce((total, e) => total + Number(e.amount), 0);
    const expenseSpent = sum(countedExpenses.filter((e) => e.category === "recyclables"));
    const costs = sum(countedExpenses.filter((e) => e.category !== "recyclables"));
    const totalSpent = spent + expenseSpent;

    const monthLabel = monthName(month);
    // The four common materials always; any other only once something is logged under it.
    const logged = new Set(movements.map((m) => m.material));
    const tableMaterials = MATERIALS.filter((m) => COMMON_MATERIALS.some((c) => c.value === m.value) || logged.has(m.value));

    return (
        <DashboardShell
            role="admin"
            profileId={profile.id}
            title="Recyclable waste"
            subtitle="Kilograms collected in and sold or dispatched out, with the stock on hand."
            unreadCount={unreadCount}
        >
            <div className="space-y-6">
                {error && (
                    <div className="rounded-2xl border border-amber-300/30 bg-amber-300/10 p-4 text-sm text-amber-100">
                        Recyclable tracking is not switched on yet. Run <code>supabase/admin-expenses-recyclables-2026-10.sql</code> in the Supabase SQL editor to turn it on.
                    </div>
                )}

                <div className="grid gap-5 sm:grid-cols-3">
                    <StatCard icon={Boxes} label="In stock now" value={kgText(stock.stock)} helper="All time: collected minus sold or dispatched" />
                    <StatCard icon={ArrowDownLeft} label={`Came in · ${monthLabel}`} value={kgText(monthly.inKg)} helper="Collected or received" />
                    <StatCard icon={ArrowUpRight} label={`Went out · ${monthLabel}`} value={kgText(monthly.outKg)} helper="Sold or dispatched" />
                    {hasMoney && <StatCard icon={Coins} label={`Spent buying · ${monthLabel}`} value={naira(totalSpent)} helper={expenseSpent > 0 ? `${naira(spent)} on entries + ${naira(expenseSpent)} in expenses` : "Money out"} />}
                    {hasMoney && <StatCard icon={Truck} label={`Other costs · ${monthLabel}`} value={naira(costs)} helper="Transport, loading, gate and security" />}
                    {hasMoney && <StatCard icon={HandCoins} label={`Sold for · ${monthLabel}`} value={naira(sold)} helper="Value of sale invoices" href="/admin/payments" />}
                </div>

                <SectionCard title="By material" description={`Stock now, and what moved in ${monthLabel}.`}>
                    <div className="overflow-x-auto">
                        <table className="min-w-full text-left text-sm">
                            <thead className="text-xs uppercase tracking-[0.12em] text-white/40">
                                <tr>
                                    <th className="py-2 pr-4">Material</th>
                                    <th className="py-2 pr-4 text-right">In this month</th>
                                    <th className="py-2 pr-4 text-right">Out this month</th>
                                    <th className="py-2 text-right">In stock now</th>
                                </tr>
                            </thead>
                            <tbody>
                                {tableMaterials.map((m) => (
                                    <tr key={m.value} className="border-t border-white/10">
                                        <td className="py-2.5 pr-4 font-semibold">{m.label}</td>
                                        <td className="py-2.5 pr-4 text-right text-emerald-300">{kgText(monthly.byMaterial[m.value].inKg)}</td>
                                        <td className="py-2.5 pr-4 text-right text-red-300">{kgText(monthly.byMaterial[m.value].outKg)}</td>
                                        <td className="py-2.5 text-right font-bold">{kgText(stock.byMaterial[m.value].stock)}</td>
                                    </tr>
                                ))}
                                <tr className="border-t border-white/20 font-bold">
                                    <td className="py-2.5 pr-4">Total</td>
                                    <td className="py-2.5 pr-4 text-right text-emerald-300">{kgText(monthly.inKg)}</td>
                                    <td className="py-2.5 pr-4 text-right text-red-300">{kgText(monthly.outKg)}</td>
                                    <td className="py-2.5 text-right text-amber-300">{kgText(stock.stock)}</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </SectionCard>

                {canAct && (
                    <SectionCard title="Log recyclables" description="Add what was collected, or what was sold or dispatched. Nothing can go out that isn't in stock." collapsible>
                        <RecyclableForm today={today} prices={prices} />
                    </SectionCard>
                )}

                {canAct && (
                    <SectionCard title="Buying prices" description="What we pay per kilogram for each material. Change them whenever the rate changes." collapsible>
                        <BuyPricesForm prices={prices} />
                    </SectionCard>
                )}

                {canAct && (
                    <SectionCard
                        title="Recyclables expenses"
                        description="Material bought for cash, and what it costs to move and handle it: transport, loading, gate and security. It is approved as you save it and counts against the recyclables profit."
                        collapsible
                    >
                        <p className="mb-4 rounded-xl border border-amber-300/20 bg-amber-300/5 p-3 text-xs text-amber-100/80">
                            Log each purchase once. If you already gave the material a price in Log recyclables, don&apos;t enter the same payment here as Recyclables bought, or it counts twice. Transport, loading and gate costs are separate and are always logged here.
                        </p>
                        <ExpenseForm
                            tasks={[]}
                            showJob={false}
                            today={today}
                            earliest={`${new Date().getFullYear() - 1}-01-01`}
                            action={logAdminExpense}
                            successMessage="Recyclables expense logged"
                            saveLabel="Save expense"
                            categories={RECYCLABLES_CATEGORIES}
                            defaultCategory="recyclables"
                            notePlaceholder="e.g. Paid Musa for 120 kg of PET bottles, or Tipper hire to the buyer"
                        />
                    </SectionCard>
                )}

                <SectionCard
                    title="Recyclables expenses this month"
                    description={`${expenses.length} for ${monthLabel}${expenseSpent > 0 ? `, ${naira(expenseSpent)} counted` : ""}.`}
                >
                    {expenses.length === 0 ? (
                        <p className="text-sm text-white/50">No recyclables expenses logged for this month.</p>
                    ) : (
                        <ul className="space-y-2">
                            {expenses.map((e) => (
                                <li key={e.id} className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm">
                                    <div className="min-w-0">
                                        <p className="font-semibold">
                                            <span className="text-red-300">{naira(Number(e.amount))}</span> · {categoryLabel(e.category)}
                                        </p>
                                        <p className="truncate text-xs text-white/50">
                                            {formatDate(e.expense_date)}
                                            {e.employee?.full_name ? ` · ${e.employee.full_name}` : ""}
                                            {e.note ? ` · ${e.note}` : ""}
                                        </p>
                                    </div>
                                    <StatusBadge status={e.status} />
                                </li>
                            ))}
                        </ul>
                    )}
                    <Link href="/admin/expenses" className="mt-3 inline-block text-xs font-semibold text-amber-300 underline underline-offset-2">
                        Review or edit on Expenses
                    </Link>
                </SectionCard>

                <SectionCard title="Entries" description={`${inMonth.length} for ${monthLabel}. Newest first.`}>
                    <form method="get" className="mb-4 flex flex-wrap items-center gap-3">
                        <label htmlFor="month" className="text-sm text-white/60">
                            Month
                        </label>
                        <input
                            id="month"
                            type="month"
                            name="month"
                            defaultValue={month}
                            max={thisMonth}
                            className="h-11 rounded-xl border border-white/10 bg-white/8 px-3 text-sm text-white outline-none"
                        />
                        <button type="submit" className="h-11 rounded-xl bg-amber-400 px-4 text-sm font-bold text-black hover:bg-amber-300">
                            Show
                        </button>
                    </form>

                    {inMonth.length === 0 ? (
                        <p className="text-sm text-white/50">Nothing logged for this month.</p>
                    ) : (
                        <ul className="space-y-2">
                            {inMonth.map((m) => {
                                const name = m.material === "other" && m.material_note ? m.material_note : materialLabel(m.material);
                                const summary = `${m.direction === "in" ? "Came in" : "Went out"}: ${kgText(Number(m.kg))} of ${name.toLowerCase()} on ${formatDate(m.movement_date)}`;

                                return (
                                    <li key={m.id} className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm">
                                        <div className="min-w-0">
                                            <p className="font-semibold">
                                                <span className={m.direction === "in" ? "text-emerald-300" : "text-red-300"}>
                                                    {m.direction === "in" ? "↓ In" : "↑ Out"}
                                                </span>{" "}
                                                {kgText(Number(m.kg))} · {name}
                                            </p>
                                            <p className="truncate text-xs text-white/50">
                                                {formatDate(m.movement_date)}
                                                {m.party ? ` · ${m.direction === "in" ? "from" : "to"} ${m.party}` : ""}
                                                {Number(m.amount ?? 0) > 0 ? ` · ${m.direction === "in" ? "paid" : "sold for"} ${naira(Number(m.amount))}` : ""}
                                                {m.note ? ` · ${m.note}` : ""}
                                            </p>
                                        </div>
                                        {m.payment_id ? (
                                            <Link href="/admin/payments" className="shrink-0 text-xs font-semibold text-amber-300 underline underline-offset-2">
                                                From a sale invoice
                                            </Link>
                                        ) : (
                                            canAct && (
                                                <div className="flex shrink-0 gap-2">
                                                    <RecyclableEditButton entry={m} />
                                                    <RecyclableDeleteButton id={m.id} summary={summary} />
                                                </div>
                                            )
                                        )}
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </SectionCard>
            </div>
        </DashboardShell>
    );
}
