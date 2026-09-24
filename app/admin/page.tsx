import Link from "next/link";
import { createClient } from "@/utils/supabase/server";
import { requireDashboardAccess } from "@/lib/dashboard/requireDashboardAccess";
import { formatDate, naira } from "@/lib/customer/billing";
import DashboardShell from "@/components/dashboard/DashboardShell";
import StatCard from "@/components/dashboard/StatCard";
import StatusBadge from "@/components/dashboard/StatusBadge";
import HighlightPanel, { PanelRow } from "@/components/dashboard/HighlightPanel";
import OwnerOverview from "@/components/dashboard/OwnerOverview";
import { isOwner, isViewOnlyAdmin } from "@/lib/auth/roles";
import {
    AlertTriangle,
    Briefcase,
    CalendarCheck,
    MessageSquare,
    Receipt,
    TrendingUp,
    UserCheck,
    Users,
    Wallet,
} from "lucide-react";

type ProfileRef = { full_name: string | null } | null;

type TaskRow = {
    id: string;
    title: string;
    status: string | null;
    scheduled_date: string | null;
    employee_id: string | null;
    customer: ProfileRef;
    employee: ProfileRef;
};

type PendingRow = { id: string; full_name: string | null; role: string | null; created_at: string | null };

type UnpaidRow = {
    id: string;
    amount: number;
    arrears: number | null;
    invoice_month: string | null;
    created_at: string;
    customer: ProfileRef;
};

type PhotoRow = { id: string; image_url: string | null; photo_type: string | null; task_title: string | null };

const OPEN_TASK = "(completed,declined)";

export default async function AdminPage() {
    const { profile, unreadCount } = await requireDashboardAccess("admin");
    const supabase = await createClient();

    // Pickups are dated in Lagos time, so "today" has to be too.
    const today = new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Lagos" });
    const monthStart = `${today.slice(0, 7)}-01T00:00:00+01:00`;
    const weekAgoDate = new Date();
    weekAgoDate.setDate(weekAgoDate.getDate() - 7);
    const weekAgo = weekAgoDate.toISOString();

    const [
        pendingRes,
        customersRes,
        employeesRes,
        invitesRes,
        todayRes,
        overdueRes,
        unassignedRes,
        upcomingRes,
        unpaidRes,
        paidRes,
        photosRes,
        recentPhotosRes,
        expensesRes,
        feeReportsRes,
        transferReportsRes,
    ] = await Promise.all([
        supabase
            .from("profiles")
            .select("id, full_name, role, created_at")
            .eq("status", "pending")
            .order("created_at", { ascending: false })
            .limit(50),
        supabase.from("customers").select("id, is_estate, vacancies, status"),
        supabase.from("profiles").select("id", { count: "exact", head: true }).eq("role", "employee").eq("status", "approved"),
        supabase
            .from("employee_invites")
            .select("id", { count: "exact", head: true })
            .is("used_at", null)
            .gt("expires_at", new Date().toISOString()),
        supabase.from("tasks").select("status").eq("scheduled_date", today),
        supabase
            .from("tasks")
            .select("id", { count: "exact", head: true })
            .lt("scheduled_date", today)
            .not("status", "in", OPEN_TASK),
        supabase
            .from("tasks")
            .select("id", { count: "exact", head: true })
            .gte("scheduled_date", today)
            .is("employee_id", null)
            .not("status", "in", OPEN_TASK),
        supabase
            .from("tasks")
            .select(
                "id, title, status, scheduled_date, employee_id, customer:profiles!tasks_customer_id_fkey(full_name), employee:profiles!tasks_employee_id_fkey(full_name)"
            )
            .gte("scheduled_date", today)
            .not("status", "in", OPEN_TASK)
            .order("scheduled_date", { ascending: true })
            .limit(6),
        supabase
            .from("payments")
            .select("id, amount, arrears, invoice_month, created_at, customer:profiles!payments_customer_id_fkey(full_name)")
            .neq("status", "paid")
            .order("created_at", { ascending: true }),
        supabase.from("payments").select("amount, arrears").eq("status", "paid").gte("paid_at", monthStart),
        supabase.from("uploads").select("id", { count: "exact", head: true }).gte("created_at", weekAgo),
        supabase
            .from("uploads")
            .select("id, image_url, photo_type, task_title")
            .order("created_at", { ascending: false })
            .limit(6),
        // Errors (the table not existing yet) simply leave this at zero.
        supabase.from("expenses").select("amount").eq("status", "submitted"),
        // Customers who say they paid the registration fee. Errors (the column
        // not existing yet) leave this at zero.
        supabase
            .from("customers")
            .select("id", { count: "exact", head: true })
            .not("registration_fee_submitted_at", "is", null)
            .eq("registration_fee_paid", false),
        // Invoices customers say they paid by transfer, not yet confirmed.
        supabase
            .from("payments")
            .select("id", { count: "exact", head: true })
            .not("transfer_reported_at", "is", null)
            .eq("status", "pending"),
    ]);

    const pending = (pendingRes.data ?? []) as PendingRow[];
    const customers = ((customersRes.data ?? []) as {
        id: string;
        is_estate: boolean | null;
        vacancies: Record<string, number> | null;
        status: string | null;
    }[]).filter((c) => c.status !== "deleted");
    const todayTasks = (todayRes.data ?? []) as { status: string | null }[];
    const upcoming = (upcomingRes.data ?? []) as unknown as TaskRow[];
    const unpaid = (unpaidRes.data ?? []) as unknown as UnpaidRow[];
    const recentPhotos = (recentPhotosRes.data ?? []) as PhotoRow[];
    const pendingExpenses = (expensesRes.data ?? []) as { amount: number }[];
    const pendingExpenseTotal = pendingExpenses.reduce((sum, e) => sum + Number(e.amount ?? 0), 0);

    const estates = customers.filter((c) => c.is_estate).length;
    const withVacancies = customers.filter((c) => Object.values(c.vacancies ?? {}).some((n) => Number(n) > 0)).length;

    const todayDone = todayTasks.filter((t) => t.status === "completed").length;
    const todayRunning = todayTasks.filter((t) => t.status === "in progress").length;

    const overdue = overdueRes.count ?? 0;
    const unassigned = unassignedRes.count ?? 0;

    const invoiceTotal = (row: { amount: number; arrears: number | null }) => Number(row.amount ?? 0) + Number(row.arrears ?? 0);
    const outstanding = unpaid.reduce((sum, row) => sum + invoiceTotal(row), 0);
    const collected = (paidRes.data ?? []).reduce((sum, row) => sum + invoiceTotal(row), 0);

    const owner = isOwner(profile);
    const supervisor = isViewOnlyAdmin(profile);
    const firstName = (profile.full_name ?? "").trim().split(/\s+/)[0] || "there";

    return (
        <DashboardShell
            role="admin"
            profileId={profile.id}
            title={owner ? "Owner Dashboard" : supervisor ? "Supervisor Dashboard" : "Admin Dashboard"}
            subtitle={
                owner
                    ? `Welcome back, ${firstName}. How the business is doing, what needs you, and what your admins have been doing.`
                    : supervisor
                        ? `Welcome back, ${firstName}. You are a supervisor with view-only access, so you can look at everything but not change it.`
                        : `Welcome back, ${firstName}. You are an admin. Each card opens the page with the full detail.`
            }
            unreadCount={unreadCount}
        >
            <div className="space-y-6">
                {owner && <OwnerOverview supabase={supabase} collected={collected} outstanding={outstanding} />}

                <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
                    <StatCard
                        icon={UserCheck}
                        label="Pending approvals"
                        value={String(pending.length)}
                        helper={pending.length > 0 ? "People waiting for you to review" : "Nobody is waiting"}
                        href="/admin/approvals"
                        tone={pending.length > 0 ? "alert" : "default"}
                    />
                    <StatCard
                        icon={Users}
                        label="Customers"
                        value={String(customers.length)}
                        helper={`${estates} estate${estates === 1 ? "" : "s"} · ${withVacancies} with vacant units`}
                        href="/admin/customers"
                    />
                    <StatCard
                        icon={Briefcase}
                        label="Employees"
                        value={String(employeesRes.count ?? 0)}
                        helper={`${invitesRes.count ?? 0} invite${invitesRes.count === 1 ? "" : "s"} not used yet`}
                        href="/admin/employees"
                    />
                    <StatCard
                        icon={MessageSquare}
                        label="Unread messages"
                        value={String(unreadCount)}
                        helper={unreadCount > 0 ? "Waiting in your inbox" : "Inbox is clear"}
                        href="/admin/messages"
                        tone={unreadCount > 0 ? "alert" : "default"}
                    />

                    <StatCard
                        icon={CalendarCheck}
                        label="Today's pickups"
                        value={String(todayTasks.length)}
                        helper={
                            todayTasks.length === 0
                                ? "None scheduled for today"
                                : `${todayDone} done · ${todayRunning} in progress · ${todayTasks.length - todayDone - todayRunning} waiting`
                        }
                        href="/admin/tasks"
                    />
                    <StatCard
                        icon={AlertTriangle}
                        label="Needs attention"
                        value={String(overdue + unassigned)}
                        helper={`${overdue} overdue · ${unassigned} upcoming without a driver`}
                        href="/admin/tasks"
                        tone={overdue + unassigned > 0 ? "alert" : "default"}
                    />
                    <StatCard
                        icon={Wallet}
                        label="Outstanding balance"
                        value={naira(outstanding)}
                        helper={`${unpaid.length} unpaid invoice${unpaid.length === 1 ? "" : "s"}`}
                        href="/admin/payments"
                    />
                    <StatCard
                        icon={TrendingUp}
                        label="Collected this month"
                        value={naira(collected)}
                        helper={`${(paidRes.data ?? []).length} payment${(paidRes.data ?? []).length === 1 ? "" : "s"} received`}
                        href="/admin/payments"
                    />

                    <div className="grid gap-5 sm:col-span-2 sm:grid-cols-2 xl:col-span-4">
                        <StatCard
                            icon={Wallet}
                            label="Registration fees to confirm"
                            value={String(feeReportsRes.count ?? 0)}
                            helper={(feeReportsRes.count ?? 0) > 0 ? "Customers say they have paid. Check and confirm." : "Nothing waiting"}
                            href="/admin/payments#registration-fees"
                            tone={(feeReportsRes.count ?? 0) > 0 ? "alert" : "default"}
                        />
                        <StatCard
                            icon={Wallet}
                            label="Invoice transfers to confirm"
                            value={String(transferReportsRes.count ?? 0)}
                            helper={(transferReportsRes.count ?? 0) > 0 ? "Customers say they paid an invoice. Check and confirm." : "Nothing waiting"}
                            href="/admin/payments"
                            tone={(transferReportsRes.count ?? 0) > 0 ? "alert" : "default"}
                        />
                    </div>

                    <div className="sm:col-span-2 xl:col-span-4">
                        <StatCard
                            icon={Receipt}
                            label="Staff expenses to review"
                            value={naira(pendingExpenseTotal)}
                            helper={
                                pendingExpenses.length > 0
                                    ? `${pendingExpenses.length} entr${pendingExpenses.length === 1 ? "y" : "ies"} waiting for you`
                                    : "Nothing waiting"
                            }
                            href="/admin/expenses"
                            tone={pendingExpenses.length > 0 ? "alert" : "default"}
                        />
                    </div>
                </div>

                <div className="grid gap-5 lg:grid-cols-2">
                    <HighlightPanel
                        title="Next pickups"
                        href="/admin/tasks"
                        linkLabel="All tasks"
                        empty={upcoming.length === 0 ? "No upcoming pickups. Generate schedules from the Tasks page." : undefined}
                    >
                        {upcoming.map((task) => (
                            <PanelRow
                                key={task.id}
                                href="/admin/tasks"
                                primary={task.customer?.full_name ?? task.title}
                                secondary={`${formatDate(task.scheduled_date)} · ${task.employee?.full_name ?? "No driver yet"}`}
                                aside={<StatusBadge status={(task.status ?? "pending").replace(" ", "_")} />}
                            />
                        ))}
                    </HighlightPanel>

                    <HighlightPanel
                        title="Awaiting approval"
                        href="/admin/approvals"
                        linkLabel="Review"
                        empty={pending.length === 0 ? "No one is waiting for approval." : undefined}
                    >
                        {pending.slice(0, 5).map((person) => (
                            <PanelRow
                                key={person.id}
                                href="/admin/approvals"
                                primary={person.full_name ?? "New sign-up"}
                                secondary={person.created_at ? `Signed up ${formatDate(person.created_at)}` : undefined}
                                aside={<span className="capitalize text-white/60">{person.role ?? "customer"}</span>}
                            />
                        ))}
                    </HighlightPanel>

                    <HighlightPanel
                        title="Oldest unpaid invoices"
                        href="/admin/payments"
                        linkLabel="All payments"
                        empty={unpaid.length === 0 ? "Every invoice is paid." : undefined}
                    >
                        {unpaid.slice(0, 5).map((invoice) => (
                            <PanelRow
                                key={invoice.id}
                                href="/admin/payments"
                                primary={invoice.customer?.full_name ?? "Unknown customer"}
                                secondary={invoice.invoice_month ?? formatDate(invoice.created_at)}
                                aside={<span className="font-bold text-amber-300">{naira(invoiceTotal(invoice))}</span>}
                            />
                        ))}
                    </HighlightPanel>

                    <HighlightPanel
                        title="Latest photos"
                        href="/admin/uploads"
                        linkLabel="All uploads"
                        empty={recentPhotos.length === 0 ? "No photos uploaded yet." : undefined}
                    >
                        <p className="mb-3 text-xs text-white/50">
                            {photosRes.count ?? 0} new in the last 7 days
                        </p>
                        <div className="grid grid-cols-3 gap-2">
                            {recentPhotos.map((photo) =>
                                photo.image_url ? (
                                    <Link
                                        key={photo.id}
                                        href="/admin/uploads"
                                        className="group relative block aspect-square overflow-hidden rounded-lg border border-white/10"
                                    >
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        <img
                                            src={photo.image_url}
                                            alt={photo.task_title ?? "Task photo"}
                                            loading="lazy"
                                            className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
                                        />
                                        {photo.photo_type && (
                                            <span
                                                className={`absolute left-1 top-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase text-white ${
                                                    photo.photo_type === "after" ? "bg-emerald-500" : "bg-sky-500"
                                                }`}
                                            >
                                                {photo.photo_type}
                                            </span>
                                        )}
                                    </Link>
                                ) : null
                            )}
                        </div>
                    </HighlightPanel>
                </div>
            </div>
        </DashboardShell>
    );
}
