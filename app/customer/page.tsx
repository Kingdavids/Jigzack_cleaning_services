import Link from "next/link";
import { CalendarCheck, CalendarClock, CheckCircle2, ChevronDown, Clock3, MapPin, Wallet } from "lucide-react";
import { requireDashboardAccess } from "@/lib/dashboard/requireDashboardAccess";
import { formatDate, naira, resolveBilling } from "@/lib/customer/billing";
import DashboardShell from "@/components/dashboard/DashboardShell";
import StatCard from "@/components/dashboard/StatCard";
import SectionCard from "@/components/dashboard/SectionCard";
import StatusBadge from "@/components/dashboard/StatusBadge";
import ServicePhotos, { type ServicePhoto } from "@/components/dashboard/ServicePhotos";
import InvoiceList, { type InvoiceRow } from "@/components/dashboard/InvoiceList";

type TaskRow = {
    id: string;
    title: string | null;
    status: string | null;
    scheduled_date: string | null;
    zone: string | null;
    started_at: string | null;
    completed_at: string | null;
};

type UploadRow = ServicePhoto & { task_id: string | null };

const HISTORY_LIMIT = 10;
const DASHBOARD_INVOICES = 5;

function duration(startedAt: string | null, completedAt: string | null) {
    if (!startedAt || !completedAt) return null;

    const minutes = Math.round((new Date(completedAt).getTime() - new Date(startedAt).getTime()) / 60000);
    if (!Number.isFinite(minutes) || minutes < 0) return null;
    if (minutes < 60) return `${Math.max(minutes, 1)} min`;

    return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

// Task statuses are stored with a space ("in progress"); the badge styles
// are keyed with an underscore.
const badgeStatus = (status: string | null) => (status ?? "pending").toLowerCase().replace(" ", "_");

function completedOn(task: TaskRow) {
    return task.completed_at ?? task.scheduled_date;
}

export default async function CustomerPage() {
    const { profile, supabase, unreadCount, customer } = await requireDashboardAccess("customer");
    const { billingProfileId, isTenant } = await resolveBilling(supabase, profile.id, customer);

    const [tasks, uploads, invoices] = await Promise.all([
        isTenant
            ? Promise.resolve([] as TaskRow[])
            : supabase
                .from("tasks")
                .select("id, title, status, scheduled_date, zone, started_at, completed_at")
                .eq("customer_id", profile.id)
                .order("scheduled_date", { ascending: true })
                .limit(200)
                .then((r) => (r.data ?? []) as TaskRow[]),
        isTenant
            ? Promise.resolve([] as UploadRow[])
            : supabase
                .from("uploads")
                .select("id, task_id, image_url, photo_type")
                .eq("customer_id", profile.id)
                .order("created_at", { ascending: true })
                .limit(400)
                .then((r) => (r.data ?? []) as UploadRow[]),
        supabase
            .from("payments")
            .select("id, amount, arrears, description, invoice_month, status, paid_at, payment_method, payment_reference, created_at")
            .eq("customer_id", billingProfileId)
            .order("created_at", { ascending: false })
            .limit(100)
            .then((r) => (r.data ?? []) as InvoiceRow[]),
    ]);

    const today = new Date().toISOString().slice(0, 10);

    const completed = tasks
        .filter((t) => (t.status ?? "").toLowerCase() === "completed")
        .sort((a, b) => new Date(completedOn(b) ?? 0).getTime() - new Date(completedOn(a) ?? 0).getTime());

    const upcoming = tasks
        .filter((t) => !["completed", "declined"].includes((t.status ?? "pending").toLowerCase()))
        .sort((a, b) => (a.scheduled_date ?? "9999").localeCompare(b.scheduled_date ?? "9999"));

    const nextPickup = upcoming.find((t) => t.scheduled_date && t.scheduled_date >= today) ?? upcoming[0] ?? null;

    const lastService = completed[0] ?? null;
    const history = completed.slice(1, 1 + HISTORY_LIMIT);

    const photosByTask = new Map<string, ServicePhoto[]>();
    for (const upload of uploads) {
        if (!upload.task_id) continue;
        const list = photosByTask.get(upload.task_id) ?? [];
        list.push(upload);
        photosByTask.set(upload.task_id, list);
    }

    const totals = invoices.reduce(
        (acc, invoice) => {
            const amount = Number(invoice.amount ?? 0);
            acc.billed += amount;
            if (invoice.status === "paid") acc.paid += amount;
            else acc.outstanding += amount;
            return acc;
        },
        { billed: 0, paid: 0, outstanding: 0 }
    );

    return (
        <DashboardShell
            role="customer"
            profileId={profile.id}
            title="Customer Dashboard"
            subtitle={`Welcome back, ${profile.full_name ?? customer?.full_name ?? "there"}. Your pickups, service photos and payments in one place.`}
            unreadCount={unreadCount}
        >
            <div className="space-y-6">
                {isTenant && (
                    <div className="rounded-xl border border-sky-400/20 bg-sky-400/[0.06] px-4 py-3 text-sm text-sky-200">
                        You&apos;re set up as a tenant. Use Messages to raise a complaint, and see your estate&apos;s shared
                        utility bill and receipts below.
                    </div>
                )}

                <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
                    {!isTenant && (
                        <>
                            <StatCard
                                icon={CalendarCheck}
                                label="Last Serviced"
                                value={
                                    lastService
                                        ? formatDate(completedOn(lastService))
                                        : customer?.last_serviced
                                            ? formatDate(customer.last_serviced)
                                            : "Not yet"
                                }
                                helper={lastService?.title ?? "Most recent completed pickup"}
                            />
                            <StatCard
                                icon={CalendarClock}
                                label="Next Pickup"
                                value={nextPickup?.scheduled_date ? formatDate(nextPickup.scheduled_date) : "Not scheduled"}
                                helper={nextPickup?.title ?? "Nearest upcoming service date"}
                            />
                            <StatCard
                                icon={CheckCircle2}
                                label="Services Completed"
                                value={String(completed.length)}
                                helper="Pickups finished to date"
                            />
                        </>
                    )}
                    <StatCard
                        icon={Wallet}
                        label="Outstanding Balance"
                        value={naira(totals.outstanding)}
                        helper={
                            totals.outstanding > 0
                                ? "Unpaid invoices"
                                : invoices.length > 0
                                    ? "You're all paid up"
                                    : "No invoices yet"
                        }
                    />
                </div>

                {!isTenant && (
                    <>
                        <SectionCard
                            id="last-service"
                            title="Last service"
                            description="What was done at your last completed pickup, with before and after photos."
                        >
                            {!lastService ? (
                                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 text-sm text-white/60">
                                    No completed service yet. Photos and details appear here once your first pickup is done.
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                        <div>
                                            <p className="text-lg font-bold">{lastService.title ?? "Service pickup"}</p>
                                            <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm text-white/55">
                                                <span className="inline-flex items-center gap-1.5">
                                                    <CalendarCheck className="h-4 w-4" />
                                                    Completed {formatDate(completedOn(lastService))}
                                                </span>
                                                {duration(lastService.started_at, lastService.completed_at) && (
                                                    <span className="inline-flex items-center gap-1.5">
                                                        <Clock3 className="h-4 w-4" />
                                                        {duration(lastService.started_at, lastService.completed_at)} on site
                                                    </span>
                                                )}
                                                {lastService.zone && (
                                                    <span className="inline-flex items-center gap-1.5">
                                                        <MapPin className="h-4 w-4" />
                                                        {lastService.zone}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                        <StatusBadge status="completed" />
                                    </div>

                                    <ServicePhotos photos={photosByTask.get(lastService.id) ?? []} />
                                </div>
                            )}
                        </SectionCard>

                        <SectionCard
                            id="pickups"
                            title="Upcoming pickups"
                            description="Scheduled and in-progress services."
                        >
                            {upcoming.length === 0 ? (
                                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 text-sm text-white/60">
                                    No upcoming pickups scheduled.
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {upcoming.map((task) => (
                                        <div
                                            key={task.id}
                                            className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4 sm:flex-row sm:items-center sm:justify-between"
                                        >
                                            <div>
                                                <p className="font-bold">{task.title ?? "Scheduled pickup"}</p>
                                                <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-white/55">
                                                    <span className="inline-flex items-center gap-1.5">
                                                        <CalendarClock className="h-4 w-4" />
                                                        {task.scheduled_date ? formatDate(task.scheduled_date) : "Date to be confirmed"}
                                                    </span>
                                                    {task.zone && (
                                                        <span className="inline-flex items-center gap-1.5">
                                                            <MapPin className="h-4 w-4" />
                                                            {task.zone}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                            <StatusBadge status={badgeStatus(task.status)} />
                                        </div>
                                    ))}
                                </div>
                            )}
                        </SectionCard>
                    </>
                )}

                <SectionCard
                    id="payments"
                    title="Payments"
                    description={isTenant ? "Your estate's shared utility bill." : "Your invoices, their status and receipts."}
                >
                    <div className="mb-5 grid gap-3 sm:grid-cols-3">
                        {[
                            { label: "Total billed", value: naira(totals.billed), tone: "text-white" },
                            { label: "Paid", value: naira(totals.paid), tone: "text-emerald-300" },
                            { label: "Outstanding", value: naira(totals.outstanding), tone: "text-amber-300" },
                        ].map((item) => (
                            <div key={item.label} className="rounded-xl border border-white/10 bg-black/20 px-4 py-3">
                                <p className="text-xs uppercase tracking-[0.15em] text-white/40">{item.label}</p>
                                <p className={`mt-1 text-xl font-bold ${item.tone}`}>{item.value}</p>
                            </div>
                        ))}
                    </div>

                    <InvoiceList invoices={invoices.slice(0, DASHBOARD_INVOICES)} />

                    {invoices.length > DASHBOARD_INVOICES && (
                        <Link
                            href="/customer/payments"
                            className="mt-4 block rounded-xl border border-white/10 bg-white/[0.03] py-3 text-center text-sm font-semibold text-white/60 transition hover:border-white/20 hover:bg-white/[0.06] hover:text-white"
                        >
                            View all {invoices.length} invoices
                        </Link>
                    )}
                </SectionCard>

                {!isTenant && history.length > 0 && (
                    <SectionCard
                        id="history"
                        title="Service history"
                        description="Earlier completed pickups. Tap one to see its before and after photos."
                    >
                        <div className="space-y-3">
                            {history.map((task) => (
                                <details
                                    key={task.id}
                                    className="group rounded-2xl border border-white/10 bg-white/[0.03] open:border-white/20"
                                >
                                    <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4">
                                        <div className="min-w-0">
                                            <p className="truncate font-semibold">{task.title ?? "Service pickup"}</p>
                                            <p className="mt-0.5 text-xs text-white/45">
                                                {formatDate(completedOn(task))}
                                                {duration(task.started_at, task.completed_at)
                                                    ? ` · ${duration(task.started_at, task.completed_at)} on site`
                                                    : ""}
                                                {task.zone ? ` · ${task.zone}` : ""}
                                            </p>
                                        </div>
                                        <ChevronDown className="h-4 w-4 shrink-0 text-white/40 transition-transform group-open:rotate-180" />
                                    </summary>
                                    <div className="border-t border-white/10 p-4">
                                        <ServicePhotos photos={photosByTask.get(task.id) ?? []} />
                                    </div>
                                </details>
                            ))}
                        </div>
                    </SectionCard>
                )}
            </div>
        </DashboardShell>
    );
}
