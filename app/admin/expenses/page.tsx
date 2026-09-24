import { requireDashboardAccess } from "@/lib/dashboard/requireDashboardAccess";
import { formatDate, naira } from "@/lib/customer/billing";
import { categoryLabel, RECEIPT_BUCKET, type ExpenseRow } from "@/lib/expenses";
import DashboardShell from "@/components/dashboard/DashboardShell";
import SectionCard from "@/components/dashboard/SectionCard";
import StatCard from "@/components/dashboard/StatCard";
import StatusBadge from "@/components/dashboard/StatusBadge";
import ExpenseReviewControls from "@/components/dashboard/ExpenseReviewControls";
import { BulkCheckbox, BulkSelectProvider } from "@/components/dashboard/BulkSelect";
import { deleteExpenses } from "../cleanup-actions";
import { isOwner } from "@/lib/auth/roles";
import { Clock, HandCoins, Receipt, Wallet } from "lucide-react";

const STATUSES = ["submitted", "approved", "reimbursed", "rejected"] as const;

const lagosDay = (date: Date) => date.toLocaleDateString("en-CA", { timeZone: "Africa/Lagos" });

function monthBounds(month: string) {
    const [year, mon] = month.split("-").map(Number);
    const next = mon === 12 ? `${year + 1}-01` : `${year}-${String(mon + 1).padStart(2, "0")}`;
    return { start: `${month}-01`, end: `${next}-01` };
}

const entries = (n: number) => `${n} ${n === 1 ? "entry" : "entries"}`;

export default async function AdminExpensesPage({
                                                    searchParams,
                                                }: {
    searchParams: Promise<{ month?: string; status?: string; staff?: string }>;
}) {
    const { profile, supabase, unreadCount } = await requireDashboardAccess("admin");
    const params = await searchParams;

    const thisMonth = lagosDay(new Date()).slice(0, 7);
    const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(params.month ?? "") ? (params.month as string) : thisMonth;
    const status = STATUSES.find((s) => s === params.status) ?? "";
    const staff = /^[0-9a-f-]{36}$/i.test(params.staff ?? "") ? (params.staff as string) : "";
    const { start, end } = monthBounds(month);

    const { data: staffData } = await supabase
        .from("profiles")
        .select("id, full_name")
        .eq("role", "employee")
        .eq("status", "approved")
        .order("full_name", { ascending: true });

    let query = supabase
        .from("expenses")
        .select(
            "id, amount, category, note, expense_date, receipt_path, status, admin_note, created_at, employee:profiles!expenses_employee_id_fkey(full_name), task:tasks(title)"
        )
        .gte("expense_date", start)
        .lt("expense_date", end)
        .order("expense_date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(200);

    if (status) query = query.eq("status", status);
    if (staff) query = query.eq("employee_id", staff);

    const { data, error } = await query;
    const expenses = (error ? [] : (data ?? [])) as unknown as ExpenseRow[];

    const receiptPaths = expenses.map((e) => e.receipt_path).filter((p): p is string => Boolean(p));
    const signed = receiptPaths.length
        ? (await supabase.storage.from(RECEIPT_BUCKET).createSignedUrls(receiptPaths, 3600)).data ?? []
        : [];
    const receiptUrl = new Map(signed.map((s) => [s.path, s.signedUrl]));

    const canBulk = isOwner(profile);
    const counted = expenses.filter((e) => e.status !== "rejected");
    const sum = (list: ExpenseRow[]) => list.reduce((total, e) => total + Number(e.amount), 0);
    const awaiting = expenses.filter((e) => e.status === "submitted");
    const owed = expenses.filter((e) => e.status === "approved");
    const paidBack = expenses.filter((e) => e.status === "reimbursed");

    const byStaff = new Map<string, number>();
    for (const e of counted) {
        const name = e.employee?.full_name ?? "Unknown";
        byStaff.set(name, (byStaff.get(name) ?? 0) + Number(e.amount));
    }

    return (
        <DashboardShell
            role="admin"
            profileId={profile.id}
            title="Expenses"
            subtitle="What staff have spent. Only you can see every entry."
            unreadCount={unreadCount}
        >
            <div className="space-y-6">
                {error && (
                    <div className="rounded-2xl border border-amber-300/30 bg-amber-300/10 p-4 text-sm text-amber-100">
                        Expenses are not switched on yet. Run <code>supabase/declined-and-expenses-2026-09.sql</code> in the
                        Supabase SQL editor to turn them on.
                    </div>
                )}

                <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
                    <StatCard icon={Receipt} label="Total this month" value={naira(sum(counted))} helper="Not counting rejected entries" />
                    <StatCard
                        icon={Clock}
                        label="Waiting for review"
                        value={naira(sum(awaiting))}
                        helper={entries(awaiting.length)}
                        tone={awaiting.length > 0 ? "alert" : "default"}
                    />
                    <StatCard icon={Wallet} label="Approved, not paid back" value={naira(sum(owed))} helper={entries(owed.length)} />
                    <StatCard icon={HandCoins} label="Reimbursed" value={naira(sum(paidBack))} helper={entries(paidBack.length)} />
                </div>

                <SectionCard title="Filter" description="Pick a month, a status or a staff member.">
                    <form method="get" className="grid gap-3 sm:grid-cols-4">
                        <input
                            type="month"
                            name="month"
                            defaultValue={month}
                            aria-label="Month"
                            className="h-11 rounded-xl border border-white/10 bg-white/8 px-3 text-sm text-white outline-none"
                        />
                        <select
                            name="status"
                            defaultValue={status}
                            aria-label="Status"
                            className="h-11 rounded-xl border border-white/10 bg-[#141518] px-3 text-sm text-white outline-none"
                        >
                            <option value="">All statuses</option>
                            {STATUSES.map((s) => (
                                <option key={s} value={s}>
                                    {s.charAt(0).toUpperCase() + s.slice(1)}
                                </option>
                            ))}
                        </select>
                        <select
                            name="staff"
                            defaultValue={staff}
                            aria-label="Staff member"
                            className="h-11 rounded-xl border border-white/10 bg-[#141518] px-3 text-sm text-white outline-none"
                        >
                            <option value="">All staff</option>
                            {(staffData ?? []).map((s) => (
                                <option key={s.id} value={s.id}>
                                    {s.full_name}
                                </option>
                            ))}
                        </select>
                        <button type="submit" className="h-11 rounded-xl bg-amber-400 px-5 text-sm font-bold text-black hover:bg-amber-300">
                            Apply
                        </button>
                    </form>

                    {byStaff.size > 0 && (
                        <p className="mt-4 text-sm text-white/55">
                            By staff: {[...byStaff.entries()].map(([name, total]) => `${name} ${naira(total)}`).join(" · ")}
                        </p>
                    )}
                </SectionCard>

                <SectionCard title="Entries" description={`${entries(expenses.length)} for ${month}${status ? `, ${status}` : ""}. Newest first.`}>
                    <BulkSelectProvider
                        enabled={canBulk && expenses.length > 0}
                        allIds={expenses.map((e) => e.id)}
                        action={deleteExpenses}
                        noun="expense"
                    >
                    {expenses.length === 0 ? (
                        <p className="text-sm text-white/50">No expenses match.</p>
                    ) : (
                        <div className="space-y-3">
                            {expenses.map((expense) => (
                                <div key={expense.id} className={`relative rounded-2xl border border-white/10 bg-white/[0.03] p-4 ${canBulk ? "pl-11" : ""}`}>
                                    <div className="absolute left-3.5 top-5">
                                        <BulkCheckbox id={expense.id} label="Select expense" />
                                    </div>
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0">
                                            <p className="font-bold">{expense.employee?.full_name ?? "Unknown staff"}</p>
                                            <p className="text-xs text-white/45">
                                                {formatDate(expense.expense_date)} · {categoryLabel(expense.category)}
                                                {expense.task?.title ? ` · ${expense.task.title}` : ""}
                                            </p>
                                        </div>
                                        <div className="text-right">
                                            <p className="font-bold text-amber-300">{naira(Number(expense.amount))}</p>
                                            <StatusBadge status={expense.status} />
                                        </div>
                                    </div>

                                    {expense.note && <p className="mt-2 text-sm text-white/75">{expense.note}</p>}

                                    {expense.receipt_path && receiptUrl.get(expense.receipt_path) && (
                                        <a
                                            href={receiptUrl.get(expense.receipt_path)}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="mt-2 inline-block text-xs font-semibold text-amber-300 underline underline-offset-2"
                                        >
                                            View receipt
                                        </a>
                                    )}

                                    <ExpenseReviewControls expenseId={expense.id} current={expense.status} currentNote={expense.admin_note} />
                                </div>
                            ))}
                        </div>
                    )}
                    </BulkSelectProvider>
                </SectionCard>
            </div>
        </DashboardShell>
    );
}
