import Link from "next/link";
import { createClient } from "@/utils/supabase/server";
import { requireDashboardAccess } from "@/lib/dashboard/requireDashboardAccess";
import { formatDate, naira } from "@/lib/customer/billing";
import DashboardShell from "@/components/dashboard/DashboardShell";
import StatCard from "@/components/dashboard/StatCard";
import StatusBadge from "@/components/dashboard/StatusBadge";
import HighlightPanel, { PanelRow } from "@/components/dashboard/HighlightPanel";
import OwnerOverview from "@/components/dashboard/OwnerOverview";
import NeedsYouQueue, { type ExpenseItem, type FeeItem, type LinkItem, type TransferItem } from "@/components/dashboard/NeedsYouQueue";
import { PAYMENT_RECEIPT_BUCKET } from "@/lib/bank-details";
import { isFullAdmin, isOwner, isViewOnlyAdmin } from "@/lib/auth/roles";
import { balanceOf, invoiceTotal, loadInstallments, loadInstallmentsSince } from "@/lib/billing/balance";
import LiveRefresh from "@/components/dashboard/LiveRefresh";
import { billToOf } from "@/lib/billing/billTo";
import { kgText, loadStock } from "@/lib/recyclables";
import {
    AlertTriangle,
    Briefcase,
    CalendarCheck,
    MessageSquare,
    TrendingUp,
    UserCheck,
    Users,
    Wallet,
    Recycle,
    Scale,
} from "lucide-react";
import { TIMEZONE } from "@/lib/config/business";
import { TIMEZONE_OFFSET } from "@/lib/config/business";

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
    amount_paid?: number | string | null;
    status?: string | null;
    invoice_month: string | null;
    created_at: string;
    customer: ProfileRef;
    // Who it is for when they are not registered on the app.
    bill_to?: unknown;
    // What it is for; empty means the normal monthly service.
    invoice_kind?: string | null;
};

type PhotoRow = { id: string; image_url: string | null; photo_type: string | null; task_title: string | null };

const OPEN_TASK = "(completed,declined)";

export default async function AdminPage() {
    const { profile, unreadCount } = await requireDashboardAccess("admin");
    const supabase = await createClient();

    // Pickups are dated in Lagos time, so "today" has to be too.
    const today = new Date().toLocaleDateString("en-CA", { timeZone: TIMEZONE });
    const monthStart = `${today.slice(0, 7)}-01T00:00:00${TIMEZONE_OFFSET}`;
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
            .select("*, customer:profiles!payments_customer_id_fkey(full_name)")
            .neq("status", "paid")
            .order("created_at", { ascending: true }),
        supabase.from("payments").select("id, amount, arrears, payment_method").eq("status", "paid").gte("paid_at", monthStart),
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

    const estates = customers.filter((c) => c.is_estate).length;
    const withVacancies = customers.filter((c) => Object.values(c.vacancies ?? {}).some((n) => Number(n) > 0)).length;

    const todayDone = todayTasks.filter((t) => t.status === "completed").length;
    const todayRunning = todayTasks.filter((t) => t.status === "in progress").length;

    const overdue = overdueRes.count ?? 0;
    const unassigned = unassignedRes.count ?? 0;

    // Still owed is what is left on each open invoice after part payments. Money
    // collected this month is every payment recorded this month, plus invoices
    // settled in one go before part payments existed.
    const outstanding = unpaid.reduce((sum, row) => sum + balanceOf(row), 0);
    const recyclables = await loadStock(supabase);
    // Money owed by buyers of recyclables is kept apart from the solid waste service.
    const recyclableInvoices = unpaid.filter((row) => row.invoice_kind === "recyclables");
    const recyclablesOwed = recyclableInvoices.reduce((sum, row) => sum + balanceOf(row), 0);
    const solidOwed = outstanding - recyclablesOwed;

    // An invoice settled from an advance payment is not new money: the advance payment itself is counted below.
    const paidThisMonth = ((paidRes.data ?? []) as { id: string; amount: number; arrears: number | null; payment_method?: string | null }[]).filter(
        (row) => row.payment_method !== "Advance payment"
    );
    const { data: advanceData } = await supabase.from("prepayments").select("amount").gte("paid_at", monthStart);
    const advanceThisMonth = (advanceData ?? []) as { amount: number | string }[];
    const monthInstallments = await loadInstallmentsSince(supabase, monthStart);
    const withPayments = new Set(
        (await loadInstallments(supabase, paidThisMonth.map((row) => row.id))).map((item) => item.payment_id)
    );
    const collected =
        advanceThisMonth.reduce((sum, item) => sum + Number(item.amount ?? 0), 0) +
        monthInstallments.reduce((sum, item) => sum + Number(item.amount ?? 0), 0) +
        paidThisMonth.filter((row) => !withPayments.has(row.id)).reduce((sum, row) => sum + invoiceTotal(row), 0);
    const paymentsThisMonth =
        advanceThisMonth.length +
        monthInstallments.length + paidThisMonth.filter((row) => !withPayments.has(row.id)).length;

    // What needs a decision, as rows an admin can act on here. Each list is
    // capped; the full lists are on their own pages. Errors (a column or table
    // that doesn't exist yet) leave a list empty.
    const QUEUE_LIMIT = 5;
    const reportedTransfers = (unpaid as unknown as {
        id: string;
        customer: ProfileRef;
        bill_to?: unknown;
        invoice_month: string | null;
        created_at: string;
        transfer_reported_at?: string | null;
        transfer_note?: string | null;
        transfer_receipt_path?: string | null;
    }[]).filter((row) => row.transfer_reported_at);

    const [feeListRes, expenseListRes] = await Promise.all([
        supabase
            .from("customers")
            .select("profile_id, full_name, registration_fee_submitted_at, registration_fee_note, registration_fee_receipt_path")
            .not("registration_fee_submitted_at", "is", null)
            .eq("registration_fee_paid", false)
            .order("registration_fee_submitted_at", { ascending: true })
            .limit(QUEUE_LIMIT),
        supabase
            .from("expenses")
            .select("id, employee_id, amount, category, note, expense_date")
            .eq("status", "submitted")
            .order("created_at", { ascending: true })
            .limit(QUEUE_LIMIT),
    ]);

    const feeRows = (feeListRes.data ?? []) as {
        profile_id: string;
        full_name: string | null;
        registration_fee_submitted_at: string;
        registration_fee_note: string | null;
        registration_fee_receipt_path: string | null;
    }[];
    const expenseRows = (expenseListRes.data ?? []) as { id: string; employee_id: string; amount: number; category: string; note: string | null; expense_date: string }[];
    const shownTransfers = reportedTransfers.slice(0, QUEUE_LIMIT);

    const { data: staffNames } = expenseRows.length
        ? await supabase.from("profiles").select("id, full_name").in("id", [...new Set(expenseRows.map((e) => e.employee_id))])
        : { data: [] };
    const staffName = new Map(((staffNames ?? []) as { id: string; full_name: string | null }[]).map((p) => [p.id, p.full_name ?? "Staff member"]));

    // Receipts are private: each opens through a link that expires in an hour.
    const proofPaths = [...feeRows.map((f) => f.registration_fee_receipt_path), ...shownTransfers.map((t) => t.transfer_receipt_path)].filter((p): p is string => Boolean(p));
    const signedProofs = proofPaths.length ? (await supabase.storage.from(PAYMENT_RECEIPT_BUCKET).createSignedUrls(proofPaths, 3600)).data ?? [] : [];
    const proofUrl = new Map(signedProofs.map((p) => [p.path, p.signedUrl]));

    const feeItems: FeeItem[] = feeRows.map((f) => ({
        profileId: f.profile_id,
        name: f.full_name ?? "Unknown customer",
        reportedAt: formatDate(f.registration_fee_submitted_at),
        note: f.registration_fee_note,
        receiptUrl: f.registration_fee_receipt_path ? proofUrl.get(f.registration_fee_receipt_path) ?? null : null,
    }));
    const transferItems: TransferItem[] = shownTransfers.map((t) => ({
        paymentId: t.id,
        name: t.customer?.full_name ?? (billToOf(t as never) ? `${billToOf(t as never)!.full_name} (not registered)` : "Unknown customer"),
        month: t.invoice_month ?? formatDate(t.created_at),
        balance: balanceOf(t as never),
        reportedAt: formatDate(t.transfer_reported_at as string),
        note: t.transfer_note ?? null,
        receiptUrl: t.transfer_receipt_path ? proofUrl.get(t.transfer_receipt_path) ?? null : null,
    }));
    const expenseItems: ExpenseItem[] = expenseRows.map((e) => ({
        id: e.id,
        name: staffName.get(e.employee_id) ?? "Staff member",
        amount: Number(e.amount),
        category: e.category,
        date: formatDate(e.expense_date),
        note: e.note,
    }));

    // Decided on their own pages, so only counted here.
    const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
    const queueLinks: LinkItem[] = [
        pending.length > 0 && { label: "Sign-ups to approve", detail: plural(pending.length, "person") + " waiting for you to review", href: "/admin/approvals" },
        unassigned > 0 && { label: "Pickups without a driver", detail: plural(unassigned, "upcoming pickup") + " not assigned yet", href: "/admin/tasks" },
        overdue > 0 && { label: "Overdue pickups", detail: plural(overdue, "pickup") + " past their date and not done", href: "/admin/tasks" },
        unreadCount > 0 && { label: "Unread messages", detail: plural(unreadCount, "message") + " in your inbox", href: "/admin/messages" },
    ].filter((item): item is LinkItem => Boolean(item));

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
            <LiveRefresh tables={["tasks", "payments", "uploads", "profiles"]} />
            <div className="space-y-6">
                <NeedsYouQueue
                    fees={feeItems}
                    feeTotal={feeReportsRes.count ?? feeItems.length}
                    transfers={transferItems}
                    transferTotal={transferReportsRes.count ?? reportedTransfers.length}
                    expenses={expenseItems}
                    expenseTotal={pendingExpenses.length}
                    links={queueLinks}
                    canAct={isFullAdmin(profile)}
                />

                {owner && <OwnerOverview supabase={supabase} collected={collected} outstanding={outstanding} />}

                {/* Solid waste and recyclables are kept apart, with the money still owed in total. */}
                <section aria-label="Balances" className="space-y-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/40">Balances</p>
                    <div className="grid gap-5 sm:grid-cols-3">
                        <StatCard
                            icon={Wallet}
                            label="Solid waste owed"
                            value={naira(solidOwed)}
                            helper={`${unpaid.length - recyclableInvoices.length} unpaid invoice${unpaid.length - recyclableInvoices.length === 1 ? "" : "s"} for collection, disposal and other services`}
                            href="/admin/payments"
                        />
                        <StatCard
                            icon={Recycle}
                            label="Recyclables owed"
                            value={naira(recyclablesOwed)}
                            helper={
                                recyclables.table
                                    ? `${recyclableInvoices.length} unpaid sale${recyclableInvoices.length === 1 ? "" : "s"} · ${kgText(recyclables.stock)} in stock`
                                    : "Run the recyclables SQL to start tracking stock"
                            }
                            href="/admin/recyclables"
                        />
                        <StatCard
                            icon={Scale}
                            label="Total outstanding"
                            value={naira(outstanding)}
                            helper="Solid waste owed plus recyclables owed"
                            href="/admin/payments"
                            tone={outstanding > 0 ? "alert" : "default"}
                        />
                    </div>
                </section>

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
                        helper={`${paymentsThisMonth} payment${paymentsThisMonth === 1 ? "" : "s"} received`}
                        href="/admin/payments"
                    />
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
                                primary={
                                    invoice.customer?.full_name ??
                                    (billToOf(invoice) ? `${billToOf(invoice)!.full_name} (not registered)` : "Unknown customer")
                                }
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
