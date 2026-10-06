import Link from "next/link";
import { ArrowDownLeft, ArrowUpRight, Clock, Scale } from "lucide-react";
import { requireDashboardAccess } from "@/lib/dashboard/requireDashboardAccess";
import { naira } from "@/lib/customer/billing";
import { categoryLabel } from "@/lib/expenses";
import { INFLOW_SOURCES, loadCashflow, monthName, monthsEndingAt, type MonthFlow } from "@/lib/finance/cashflow";
import DashboardShell from "@/components/dashboard/DashboardShell";
import SectionCard from "@/components/dashboard/SectionCard";
import StatCard from "@/components/dashboard/StatCard";
import LiveRefresh from "@/components/dashboard/LiveRefresh";
import { kgText, summarise, type Movement } from "@/lib/recyclables";
import { TIMEZONE } from "@/lib/config/business";

// One category's share of a total, as a labelled bar.
function Row({ label, amount, total, count, tone }: { label: string; amount: number; total: number; count?: number; tone: "in" | "out" }) {
    const share = total > 0 ? Math.round((amount / total) * 100) : 0;

    return (
        <li className="space-y-1.5">
            <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="text-white/80">
                    {label}
                    {count !== undefined && count > 0 && <span className="ml-2 text-xs text-white/40">{count}</span>}
                </span>
                <span className="font-semibold">
                    {naira(amount)}
                    <span className="ml-2 text-xs font-normal text-white/40">{share}%</span>
                </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-white/10">
                <div className={`h-full rounded-full ${tone === "in" ? "bg-emerald-400" : "bg-red-400"}`} style={{ width: `${share}%` }} />
            </div>
        </li>
    );
}

export default async function AdminFinancePage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
    const { profile, supabase, unreadCount } = await requireDashboardAccess("admin");
    const params = await searchParams;

    const thisMonth = new Date().toLocaleDateString("en-CA", { timeZone: TIMEZONE }).slice(0, 7);
    const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(params.month ?? "") && (params.month as string) <= thisMonth ? (params.month as string) : thisMonth;

    const months = monthsEndingAt(month, 6);
    const flows = await loadCashflow(supabase, months);

    // Recyclable waste moved this month (by weight, so it is shown beside the money, not in it).
    const { data: movementData, error: movementError } = await supabase
        .from("recyclable_movements")
        .select("direction, material, kg, movement_date")
        .limit(20000);
    const movements = (movementError ? [] : (movementData ?? [])) as Pick<Movement, "direction" | "material" | "kg" | "movement_date">[];
    const recyclablesMonth = summarise(movements.filter((m) => m.movement_date.startsWith(month)));
    const recyclablesStock = summarise(movements);
    const current = flows[flows.length - 1];
    const net = current.inTotal - current.outTotal;

    const sources = INFLOW_SOURCES.map((s) => ({ ...s, ...current.inBySource[s.key] })).filter((s) => s.amount > 0);
    const methods = Object.entries(current.inByMethod).sort((a, b) => b[1] - a[1]);
    const categories = Object.entries(current.outByCategory)
        .filter(([, v]) => v.amount > 0)
        .sort((a, b) => b[1].amount - a[1].amount);

    const monthLink = (key: string) => `/admin/finance?month=${key}`;
    const trendMax = Math.max(1, ...flows.map((f: MonthFlow) => Math.max(f.inTotal, f.outTotal)));

    return (
        <DashboardShell
            role="admin"
            profileId={profile.id}
            title="Money in & out"
            subtitle="What came in and what went out, month by month, by category."
            unreadCount={unreadCount}
        >
            <LiveRefresh tables={["payments"]} />
            <div className="space-y-6">
                <form method="get" className="flex flex-wrap items-center gap-3">
                    <label className="text-sm text-white/60" htmlFor="month">
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
                    <button type="submit" className="h-11 rounded-xl bg-amber-400 px-4 text-sm font-bold text-black transition hover:bg-amber-300">
                        Show
                    </button>
                    <span className="text-sm text-white/45">{monthName(month)}</span>
                </form>

                <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
                    <StatCard icon={ArrowDownLeft} label="Money in" value={naira(current.inTotal)} helper="Payments received this month" href="/admin/payments" />
                    <StatCard
                        icon={ArrowUpRight}
                        label="Money out"
                        value={naira(current.outTotal)}
                        helper="Approved staff expenses and recyclables bought"
                        href={`/admin/expenses?month=${month}`}
                    />
                    <StatCard
                        icon={Scale}
                        label="Net"
                        value={`${net < 0 ? "−" : ""}${naira(Math.abs(net))}`}
                        helper={net < 0 ? "More went out than came in" : "Money in minus money out"}
                        tone={net < 0 ? "alert" : "default"}
                    />
                    <StatCard
                        icon={Clock}
                        label="Expense claims waiting"
                        value={naira(current.waiting.amount)}
                        helper={current.waiting.count > 0 ? `${current.waiting.count} not yet approved, so not counted` : "Nothing waiting"}
                        href={`/admin/expenses?month=${month}&status=submitted`}
                        tone={current.waiting.count > 0 ? "alert" : "default"}
                    />
                </div>

                <div className="grid gap-6 lg:grid-cols-2">
                    <SectionCard title="Money in by source" description={`Everything received in ${monthName(month)}, by what it was for.`}>
                        {sources.length === 0 ? (
                            <p className="text-sm text-white/50">Nothing received this month.</p>
                        ) : (
                            <ul className="space-y-4">
                                {sources.map((s) => (
                                    <Row key={s.key} label={s.label} amount={s.amount} count={s.count} total={current.inTotal} tone="in" />
                                ))}
                            </ul>
                        )}
                    </SectionCard>

                    <SectionCard title="Money in by method" description="How it was paid.">
                        {methods.length === 0 ? (
                            <p className="text-sm text-white/50">Nothing received this month.</p>
                        ) : (
                            <ul className="space-y-4">
                                {methods.map(([method, amount]) => (
                                    <Row key={method} label={method} amount={amount} total={current.inTotal} tone="in" />
                                ))}
                            </ul>
                        )}
                    </SectionCard>
                </div>

                <SectionCard
                    title="Money out by category"
                    description="Expenses an admin approved or paid back, and recyclables bought. Waiting and rejected claims aren't counted."
                >
                    {categories.length === 0 ? (
                        <p className="text-sm text-white/50">No approved expenses this month.</p>
                    ) : (
                        <ul className="grid gap-4 md:grid-cols-2">
                            {categories.map(([category, v]) => (
                                <Row key={category} label={category === "recyclables" ? "Recyclables purchases" : categoryLabel(category)} amount={v.amount} count={v.count} total={current.outTotal} tone="out" />
                            ))}
                        </ul>
                    )}
                </SectionCard>

                {!movementError && (
                    <SectionCard
                        title="Recyclable waste"
                        description={`By weight, not money. In ${monthName(month)}, and the stock on hand now.`}
                    >
                        <div className="grid gap-4 sm:grid-cols-3">
                            <div>
                                <p className="text-xs uppercase tracking-[0.12em] text-white/40">Came in</p>
                                <p className="mt-1 text-xl font-bold text-emerald-300">{kgText(recyclablesMonth.inKg)}</p>
                            </div>
                            <div>
                                <p className="text-xs uppercase tracking-[0.12em] text-white/40">Went out</p>
                                <p className="mt-1 text-xl font-bold text-red-300">{kgText(recyclablesMonth.outKg)}</p>
                            </div>
                            <div>
                                <p className="text-xs uppercase tracking-[0.12em] text-white/40">In stock now</p>
                                <p className="mt-1 text-xl font-bold">{kgText(recyclablesStock.stock)}</p>
                            </div>
                        </div>
                        <Link href="/admin/recyclables" className="mt-4 inline-block text-xs font-semibold text-amber-300 underline underline-offset-2">
                            Open recyclables
                        </Link>
                    </SectionCard>
                )}

                <SectionCard title="Last 6 months" description="Tap a month to see its breakdown.">
                    <div className="overflow-x-auto">
                        <table className="min-w-full text-left text-sm">
                            <thead className="text-xs uppercase tracking-[0.12em] text-white/40">
                                <tr>
                                    <th className="py-2 pr-4">Month</th>
                                    <th className="py-2 pr-4 text-right">In</th>
                                    <th className="py-2 pr-4 text-right">Out</th>
                                    <th className="py-2 pr-4 text-right">Net</th>
                                    <th className="hidden py-2 sm:table-cell" aria-hidden />
                                </tr>
                            </thead>
                            <tbody>
                                {[...flows].reverse().map((f) => {
                                    const n = f.inTotal - f.outTotal;

                                    return (
                                        <tr key={f.month} className={`border-t border-white/10 ${f.month === month ? "bg-white/[0.04]" : ""}`}>
                                            <td className="py-2.5 pr-4">
                                                <Link href={monthLink(f.month)} className="font-semibold underline-offset-2 hover:underline">
                                                    {monthName(f.month)}
                                                </Link>
                                            </td>
                                            <td className="py-2.5 pr-4 text-right text-emerald-300">{naira(f.inTotal)}</td>
                                            <td className="py-2.5 pr-4 text-right text-red-300">{naira(f.outTotal)}</td>
                                            <td className={`py-2.5 pr-4 text-right font-semibold ${n < 0 ? "text-red-300" : ""}`}>
                                                {n < 0 ? "−" : ""}
                                                {naira(Math.abs(n))}
                                            </td>
                                            <td className="hidden w-48 py-2.5 sm:table-cell">
                                                <div className="space-y-1">
                                                    <div className="h-1.5 rounded-full bg-emerald-400" style={{ width: `${(f.inTotal / trendMax) * 100}%` }} />
                                                    <div className="h-1.5 rounded-full bg-red-400" style={{ width: `${(f.outTotal / trendMax) * 100}%` }} />
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </SectionCard>

                <p className="text-xs text-white/40">
                    Money in is counted on the day it was received. Staff expenses are counted in the month they were spent, once approved.
                    Invoices settled from an advance payment aren&apos;t counted twice: only the advance payment itself is.
                </p>
            </div>
        </DashboardShell>
    );
}
