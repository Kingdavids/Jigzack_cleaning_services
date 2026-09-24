import { requireDashboardAccess } from "@/lib/dashboard/requireDashboardAccess";
import { formatDate, naira } from "@/lib/customer/billing";
import { categoryLabel, RECEIPT_BUCKET, type ExpenseRow } from "@/lib/expenses";
import DashboardShell from "@/components/dashboard/DashboardShell";
import SectionCard from "@/components/dashboard/SectionCard";
import StatusBadge from "@/components/dashboard/StatusBadge";
import ExpenseForm from "@/components/dashboard/ExpenseForm";
import ExpenseDeleteButton from "@/components/dashboard/ExpenseDeleteButton";

const lagosDay = (date: Date) => date.toLocaleDateString("en-CA", { timeZone: "Africa/Lagos" });

export default async function EmployeeExpensesPage() {
    const { profile, supabase, unreadCount } = await requireDashboardAccess("employee");

    const now = new Date();
    const today = lagosDay(now);
    const sixtyAgo = new Date(now);
    sixtyAgo.setDate(sixtyAgo.getDate() - 60);
    const earliest = lagosDay(sixtyAgo);

    const { data: taskData } = await supabase
        .from("tasks")
        .select("id, title, scheduled_date, customer:profiles!tasks_customer_id_fkey(full_name)")
        .eq("employee_id", profile.id)
        .order("scheduled_date", { ascending: false })
        .limit(30);

    const tasks = ((taskData ?? []) as unknown as {
        id: string;
        title: string;
        scheduled_date: string | null;
        customer: { full_name: string | null } | null;
    }[]).map((t) => ({
        id: t.id,
        label: `${formatDate(t.scheduled_date, "No date")} · ${t.customer?.full_name ?? t.title}`,
    }));

    const { data: expenseData, error } = await supabase
        .from("expenses")
        .select("id, amount, category, note, expense_date, receipt_path, status, admin_note, created_at, task:tasks(title)")
        .eq("employee_id", profile.id)
        .order("created_at", { ascending: false })
        .limit(100);

    const expenses = (error ? [] : (expenseData ?? [])) as unknown as ExpenseRow[];

    // Receipts are private, so each one is opened through a short-lived link.
    const receiptPaths = expenses.map((e) => e.receipt_path).filter((p): p is string => Boolean(p));
    const signed = receiptPaths.length
        ? (await supabase.storage.from(RECEIPT_BUCKET).createSignedUrls(receiptPaths, 3600)).data ?? []
        : [];
    const receiptUrl = new Map(signed.map((s) => [s.path, s.signedUrl]));

    const month = today.slice(0, 7);
    const monthTotal = expenses
        .filter((e) => e.expense_date.startsWith(month) && e.status !== "rejected")
        .reduce((sum, e) => sum + Number(e.amount), 0);

    return (
        <DashboardShell
            role="employee"
            profileId={profile.id}
            title="Expenses"
            subtitle="Log money you spent on the job. Only you and the admin can see it."
            unreadCount={unreadCount}
        >
            <div className="grid gap-6 xl:grid-cols-[minmax(0,420px)_1fr]">
                <SectionCard title="Log an expense" description="Add a receipt photo if you have one.">
                    <ExpenseForm tasks={tasks} today={today} earliest={earliest} />
                </SectionCard>

                <SectionCard
                    title="Your expenses"
                    description={
                        error
                            ? "Expenses are not switched on yet. Please tell the admin."
                            : `${naira(monthTotal)} logged this month, not counting rejected entries.`
                    }
                >
                    {expenses.length === 0 ? (
                        <p className="text-sm text-white/50">Nothing logged yet.</p>
                    ) : (
                        <div className="space-y-3">
                            {expenses.map((expense) => (
                                <div key={expense.id} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0">
                                            <p className="font-bold">
                                                {naira(Number(expense.amount))}{" "}
                                                <span className="text-sm font-medium text-white/55">{categoryLabel(expense.category)}</span>
                                            </p>
                                            <p className="text-xs text-white/45">
                                                {formatDate(expense.expense_date)}
                                                {expense.task?.title ? ` · ${expense.task.title}` : ""}
                                            </p>
                                        </div>
                                        <StatusBadge status={expense.status} />
                                    </div>

                                    {expense.note && <p className="mt-2 text-sm text-white/75">{expense.note}</p>}
                                    {expense.admin_note && (
                                        <p className="mt-2 rounded-lg bg-amber-300/10 px-3 py-2 text-sm text-amber-200">
                                            Admin: {expense.admin_note}
                                        </p>
                                    )}

                                    <div className="mt-3 flex items-center gap-4 text-xs">
                                        {expense.receipt_path && receiptUrl.get(expense.receipt_path) && (
                                            <a
                                                href={receiptUrl.get(expense.receipt_path)}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="font-semibold text-amber-300 underline underline-offset-2"
                                            >
                                                View receipt
                                            </a>
                                        )}
                                        {expense.status === "submitted" && <ExpenseDeleteButton expenseId={expense.id} />}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </SectionCard>
            </div>
        </DashboardShell>
    );
}
