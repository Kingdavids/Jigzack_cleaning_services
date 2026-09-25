import { CalendarClock, CalendarDays, CheckCircle2, ChevronDown, Clock3, MapPin, Repeat } from "lucide-react";
import { requireDashboardAccess } from "@/lib/dashboard/requireDashboardAccess";
import { formatDate, resolveBilling } from "@/lib/customer/billing";
import { describeFrequency, parseFrequency, todayKey } from "@/lib/billing/schedule";
import DashboardShell from "@/components/dashboard/DashboardShell";
import SectionCard from "@/components/dashboard/SectionCard";
import StatusBadge from "@/components/dashboard/StatusBadge";
import ServicePhotos, { type ServicePhoto } from "@/components/dashboard/ServicePhotos";
import { loadTaskTeams, taskDisplayStatus, teamNames } from "@/lib/tasks";

type TaskRow = {
    id: string;
    title: string | null;
    status: string | null;
    scheduled_date: string | null;
    zone: string | null;
    employee_id?: string | null;
    started_at: string | null;
    completed_at: string | null;
    created_at: string;
};

type UploadRow = ServicePhoto & { task_id: string | null };

const HISTORY_LIMIT = 30;

const badgeStatus = (status: string | null) => (status ?? "pending").toLowerCase().replace(" ", "_");

function duration(startedAt: string | null, completedAt: string | null) {
    if (!startedAt || !completedAt) return null;

    const minutes = Math.round((new Date(completedAt).getTime() - new Date(startedAt).getTime()) / 60000);
    if (!Number.isFinite(minutes) || minutes < 0) return null;
    if (minutes < 60) return `${Math.max(minutes, 1)} min`;

    return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

function weekday(value: string | null) {
    if (!value) return "";
    const date = new Date(`${value}T00:00:00`);
    return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString("en-US", { weekday: "long" });
}

function monthHeading(value: string | null) {
    if (!value) return "Date to be confirmed";
    const date = new Date(`${value}T00:00:00`);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

export default async function CustomerSchedulePage() {
    const { profile, supabase, unreadCount, customer } = await requireDashboardAccess("customer");
    const { isTenant } = await resolveBilling(supabase, profile.id, customer);

    const [tasks, uploads] = await Promise.all([
        isTenant
            ? Promise.resolve([] as TaskRow[])
            : supabase
                .from("tasks")
                .select("id, title, status, scheduled_date, zone, employee_id, started_at, completed_at, created_at")
                .eq("customer_id", profile.id)
                .order("scheduled_date", { ascending: true })
                .limit(300)
                .then((r) => (r.data ?? []) as TaskRow[]),
        isTenant
            ? Promise.resolve([] as UploadRow[])
            : supabase
                .from("uploads")
                .select("id, task_id, image_url, photo_type")
                .eq("customer_id", profile.id)
                .order("created_at", { ascending: true })
                .limit(600)
                .then((r) => (r.data ?? []) as UploadRow[]),
    ]);

    const today = todayKey();
    const frequency = parseFrequency(customer?.preferred_pickup_frequency);

    const completed = tasks
        .filter((t) => (t.status ?? "").toLowerCase() === "completed")
        .sort((a, b) =>
            (b.completed_at ?? b.scheduled_date ?? "").localeCompare(a.completed_at ?? a.scheduled_date ?? "")
        );

    const upcoming = tasks
        .filter((t) => !["completed", "declined"].includes((t.status ?? "pending").toLowerCase()))
        .sort((a, b) => (a.scheduled_date ?? "9999").localeCompare(b.scheduled_date ?? "9999"));

    const byMonth = new Map<string, TaskRow[]>();
    for (const task of upcoming) {
        const heading = monthHeading(task.scheduled_date);
        byMonth.set(heading, [...(byMonth.get(heading) ?? []), task]);
    }

    const photosByTask = new Map<string, ServicePhoto[]>();
    for (const upload of uploads) {
        if (!upload.task_id) continue;
        photosByTask.set(upload.task_id, [...(photosByTask.get(upload.task_id) ?? []), upload]);
    }

    const history = completed.slice(0, HISTORY_LIMIT);

    // Who is coming, for pickups that have someone assigned.
    const teams = await loadTaskTeams(supabase, upcoming.filter((t) => t.employee_id).slice(0, 60).map((t) => t.id));

    return (
        <DashboardShell
            role="customer"
            profileId={profile.id}
            title="Schedule"
            subtitle="Your pickup calendar and photos from every service day."
            unreadCount={unreadCount}
        >
            <div className="space-y-6">
                {isTenant ? (
                    <div className="rounded-xl border border-sky-400/20 bg-sky-400/[0.06] px-4 py-3 text-sm text-sky-200">
                        Pickups for your estate are scheduled and managed by the estate. Use Messages to raise any
                        service issue.
                    </div>
                ) : (
                    <>
                        <SectionCard
                            id="plan"
                            title="Your plan"
                            description="Built from the pickup frequency on your account. Contact us to change it."
                        >
                            <div className="grid gap-3 sm:grid-cols-3">
                                <div className="rounded-xl border border-white/10 bg-black/20 px-4 py-3">
                                    <p className="flex items-center gap-1.5 text-xs uppercase tracking-[0.15em] text-white/40">
                                        <Repeat className="h-3.5 w-3.5" />
                                        You asked for
                                    </p>
                                    <p className="mt-1 font-semibold">{customer?.preferred_pickup_frequency ?? "Not set"}</p>
                                </div>
                                <div className="rounded-xl border border-white/10 bg-black/20 px-4 py-3">
                                    <p className="flex items-center gap-1.5 text-xs uppercase tracking-[0.15em] text-white/40">
                                        <CalendarClock className="h-3.5 w-3.5" />
                                        Pickups
                                    </p>
                                    <p className="mt-1 font-semibold">{describeFrequency(frequency)}</p>
                                </div>
                                <div className="rounded-xl border border-white/10 bg-black/20 px-4 py-3">
                                    <p className="flex items-center gap-1.5 text-xs uppercase tracking-[0.15em] text-white/40">
                                        <CheckCircle2 className="h-3.5 w-3.5" />
                                        Completed
                                    </p>
                                    <p className="mt-1 font-semibold">{completed.length} services</p>
                                </div>
                            </div>
                        </SectionCard>

                        <SectionCard
                            id="upcoming"
                            title="Upcoming pickups"
                            description="Scheduled and in-progress services, by month."
                        >
                            {upcoming.length === 0 ? (
                                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 text-sm text-white/60">
                                    No upcoming pickups scheduled yet. Your schedule is created once your account is
                                    approved.
                                </div>
                            ) : (
                                <div className="space-y-6">
                                    {Array.from(byMonth.entries()).map(([month, monthTasks]) => (
                                        <div key={month}>
                                            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-white/40">{month}</p>
                                            <div className="space-y-2">
                                                {monthTasks.map((task) => {
                                                    const isToday = task.scheduled_date === today;

                                                    return (
                                                        <div
                                                            key={task.id}
                                                            className={`flex flex-col gap-2 rounded-2xl border p-4 sm:flex-row sm:items-center sm:justify-between ${
                                                                isToday
                                                                    ? "border-amber-300/40 bg-amber-400/[0.07]"
                                                                    : "border-white/10 bg-white/[0.03]"
                                                            }`}
                                                        >
                                                            <div>
                                                                <p className="flex items-center gap-2 font-bold">
                                                                    <CalendarDays className="h-4 w-4 text-amber-300" />
                                                                    {weekday(task.scheduled_date)} {formatDate(task.scheduled_date, "Date to be confirmed")}
                                                                    {isToday && (
                                                                        <span className="rounded-full bg-amber-400 px-2 py-0.5 text-[10px] font-bold uppercase text-black">
                                                                            Today
                                                                        </span>
                                                                    )}
                                                                </p>
                                                                <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-white/55">
                                                                    <span>{task.title ?? "Scheduled pickup"}</span>
                                                                    {teams.get(task.id) && (
                                                                        <span>Crew: {teamNames(teams.get(task.id))}</span>
                                                                    )}
                                                                    {task.zone && (
                                                                        <span className="inline-flex items-center gap-1.5">
                                                                            <MapPin className="h-3.5 w-3.5" />
                                                                            {task.zone}
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            </div>
                                                            <StatusBadge status={taskDisplayStatus(task.status, Boolean(task.employee_id))} />
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </SectionCard>

                        <SectionCard
                            id="history"
                            title="Service history"
                            description="Each service day with its photos, sorted into before and after. Tap a photo to preview it."
                        >
                            {history.length === 0 ? (
                                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 text-sm text-white/60">
                                    No completed services yet. Photos from each pickup appear here.
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {history.map((task, index) => {
                                        const photos = photosByTask.get(task.id) ?? [];
                                        const beforeCount = photos.filter((p) => p.photo_type === "before").length;
                                        const afterCount = photos.filter((p) => p.photo_type === "after").length;
                                        const took = duration(task.started_at, task.completed_at);
                                        const day = task.completed_at ?? task.scheduled_date;

                                        return (
                                            <details
                                                key={task.id}
                                                open={index === 0}
                                                className="group rounded-2xl border border-white/10 bg-white/[0.03] open:border-white/20"
                                            >
                                                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4">
                                                    <div className="min-w-0">
                                                        <p className="font-semibold">
                                                            {weekday(day?.slice(0, 10) ?? null)} {formatDate(day)}
                                                        </p>
                                                        <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-white/45">
                                                            <span>{task.title ?? "Service pickup"}</span>
                                                            {took && (
                                                                <span className="inline-flex items-center gap-1">
                                                                    <Clock3 className="h-3 w-3" />
                                                                    {took} on site
                                                                </span>
                                                            )}
                                                            {task.zone && <span>{task.zone}</span>}
                                                            <span className="text-sky-300">{beforeCount} before</span>
                                                            <span className="text-emerald-300">{afterCount} after</span>
                                                        </p>
                                                    </div>
                                                    <ChevronDown className="h-4 w-4 shrink-0 text-white/40 transition-transform group-open:rotate-180" />
                                                </summary>
                                                <div className="border-t border-white/10 p-4">
                                                    <ServicePhotos photos={photos} heading={formatDate(day)} />
                                                </div>
                                            </details>
                                        );
                                    })}

                                    {completed.length > HISTORY_LIMIT && (
                                        <p className="text-center text-xs text-white/40">
                                            Showing the latest {HISTORY_LIMIT} of {completed.length} services.
                                        </p>
                                    )}
                                </div>
                            )}
                        </SectionCard>
                    </>
                )}
            </div>
        </DashboardShell>
    );
}
