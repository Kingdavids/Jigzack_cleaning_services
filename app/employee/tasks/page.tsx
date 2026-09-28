import Link from "next/link";
import { requireDashboardAccess } from "@/lib/dashboard/requireDashboardAccess";
import { ChevronDown, Clock3, MapPin, MapPinned, MessageCircle, Phone, StickyNote } from "lucide-react";
import DashboardShell from "@/components/dashboard/DashboardShell";
import SectionCard from "@/components/dashboard/SectionCard";
import StatusBadge from "@/components/dashboard/StatusBadge";
import SendMessageForm from "@/components/dashboard/SendMessageForm";
import TaskPhotoManager from "@/components/dashboard/TaskPhotoManager";
import TaskTimer from "@/components/dashboard/TaskTimer";
import TaskServiceButtons from "@/components/dashboard/TaskServiceButtons";
import { sendMessageToCustomer } from "@/lib/messaging-actions";
import { loadTaskCustomers, loadTaskTeams, taskDisplayStatus, type TaskCustomer } from "@/lib/tasks";

type TaskRow = {
    id: string;
    title: string;
    status: string | null;
    priority: string | null;
    scheduled_date: string | null;
    zone: string | null;
    customer_name?: string | null;
    started_at: string | null;
};

type UploadRow = {
    id: string;
    task_id: string;
    photo_type: "before" | "after";
    image_url: string;
};

function formatDate(value: string | null) {
    if (!value) return "Not scheduled";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleDateString("en-CA", {
        year: "numeric",
        month: "short",
        day: "numeric",
    });
}

// wa.me wants the number in international form with no "+" or spaces; local
// Nigerian numbers start with 0.
function whatsappLink(value: string) {
    const digits = value.replace(/\D/g, "");
    return `https://wa.me/${digits.startsWith("0") ? `234${digits.slice(1)}` : digits}`;
}

function CustomerDetails({ customer }: { customer: TaskCustomer }) {
    const place = [customer.address, customer.lga, customer.state].filter(Boolean).join(", ");
    const facts = [
        ["Property", customer.property_type],
        ["Waste", customer.waste_type],
        ["Pickups", customer.preferred_pickup_frequency],
    ].filter(([, value]) => value) as [string, string][];

    return (
        <div className="space-y-3 rounded-xl border border-white/10 bg-black/20 p-4 text-sm">
            <p className="text-xs uppercase tracking-[0.2em] text-white/45">Customer</p>
            <p className="font-semibold">{customer.full_name ?? "Customer"}</p>

            {place && (
                <div className="flex items-start gap-2 text-white/70">
                    <MapPin className="mt-0.5 h-4 w-4 shrink-0" />
                    <div>
                        <p>{place}</p>
                        {customer.landmark && <p className="text-white/50">Near {customer.landmark}</p>}
                        <a
                            href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-amber-300 hover:underline"
                        >
                            Open in Maps
                        </a>
                    </div>
                </div>
            )}

            {(customer.phone || customer.whatsapp_number) && (
                <div className="flex flex-wrap gap-2">
                    {customer.phone && (
                        <a
                            href={`tel:${customer.phone.replace(/\s/g, "")}`}
                            className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 hover:bg-white/10"
                        >
                            <Phone className="h-4 w-4" />
                            {customer.phone}
                        </a>
                    )}
                    {customer.whatsapp_number && (
                        <a
                            href={whatsappLink(customer.whatsapp_number)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-emerald-400/30 bg-emerald-400/10 px-3 text-emerald-200 hover:bg-emerald-400/20"
                        >
                            <MessageCircle className="h-4 w-4" />
                            WhatsApp
                        </a>
                    )}
                </div>
            )}

            {facts.length > 0 && (
                <dl className="grid gap-x-4 gap-y-1 sm:grid-cols-3">
                    {facts.map(([label, value]) => (
                        <div key={label}>
                            <dt className="text-xs text-white/45">{label}</dt>
                            <dd className="capitalize text-white/80">{value}</dd>
                        </div>
                    ))}
                </dl>
            )}

            {customer.special_notes && (
                <div className="flex items-start gap-2 rounded-lg border border-amber-300/30 bg-amber-300/10 p-3 text-amber-100">
                    <StickyNote className="mt-0.5 h-4 w-4 shrink-0" />
                    <p className="whitespace-pre-line">{customer.special_notes}</p>
                </div>
            )}
        </div>
    );
}

// The dashboard cards link here with ?show= to open just that group.
const FILTERS = [
    { key: "all", label: "All" },
    { key: "pending", label: "Pending" },
    { key: "completed", label: "Completed" },
    { key: "high", label: "High priority" },
] as const;

type Filter = (typeof FILTERS)[number]["key"];

function matchesFilter(task: TaskRow, filter: Filter) {
    const status = (task.status ?? "").toLowerCase();

    if (filter === "pending") return status !== "completed";
    if (filter === "completed") return status === "completed";
    if (filter === "high") return (task.priority ?? "").toLowerCase() === "high";

    return true;
}

export default async function EmployeeTasksPage({
                                                    searchParams,
                                                }: {
    searchParams: Promise<{ show?: string }>;
}) {
    const { profile, supabase, unreadCount } = await requireDashboardAccess("employee");
    const { show } = await searchParams;
    const filter: Filter = FILTERS.some((f) => f.key === show) ? (show as Filter) : "all";

    // The database returns only the tasks this person is on, as the lead or as
    // crew, so a job shared with a colleague shows up for both of them.
    const { data: taskData, error: taskError } = await supabase
        .from("tasks")
        .select("*")
        .order("created_at", { ascending: false });

    if (taskError) {
        console.error("Failed to load employee tasks:", taskError.message);
    }

    const allTasks: TaskRow[] = taskData ?? [];
    const tasks = allTasks.filter((t) => matchesFilter(t, filter));
    const taskIds = tasks.map((t) => t.id);
    const [teams, customers] = await Promise.all([
        loadTaskTeams(supabase, taskIds),
        loadTaskCustomers(supabase, taskIds),
    ]);

    const { data: uploadsData } = taskIds.length
        ? await supabase
              .from("uploads")
              .select("id, task_id, photo_type, image_url")
              .in("task_id", taskIds)
        : { data: [] as UploadRow[] };

    const uploadsByTask = new Map<string, { before: UploadRow[]; after: UploadRow[] }>();
    for (const upload of (uploadsData ?? []) as UploadRow[]) {
        const bucket = uploadsByTask.get(upload.task_id) ?? { before: [], after: [] };
        bucket[upload.photo_type].push(upload);
        uploadsByTask.set(upload.task_id, bucket);
    }

    return (
        <DashboardShell
            role="employee"
            profileId={profile.id}
            title="Assigned Tasks"
            subtitle="Live overview of your service work orders."
            unreadCount={unreadCount}
        >
            <SectionCard title="Assigned Tasks" description="Tap a task to see the customer's details, message them and add photos.">
                <nav aria-label="Filter tasks" className="mb-4 flex flex-wrap gap-2">
                    {FILTERS.map((f) => {
                        const count = allTasks.filter((t) => matchesFilter(t, f.key)).length;
                        const active = f.key === filter;

                        return (
                            <Link
                                key={f.key}
                                href={f.key === "all" ? "/employee/tasks" : `/employee/tasks?show=${f.key}`}
                                aria-current={active ? "page" : undefined}
                                className={`inline-flex min-h-10 items-center gap-2 rounded-full border px-4 text-sm transition ${
                                    active
                                        ? "border-amber-400 bg-amber-400 font-semibold text-black"
                                        : "border-white/10 bg-white/5 text-white/70 hover:bg-white/10"
                                }`}
                            >
                                {f.label}
                                <span className={active ? "text-black/60" : "text-white/40"}>{count}</span>
                            </Link>
                        );
                    })}
                </nav>

                <div className="space-y-4">
                    {tasks.length === 0 ? (
                        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-5 text-sm text-white/50">
                            {allTasks.length === 0 ? "No tasks assigned yet." : "No tasks in this group."}
                        </div>
                    ) : (
                        tasks.map((task) => {
                            const customer = customers.get(task.id);
                            const inProgress = (task.status ?? "").toLowerCase() === "in progress";
                            const colleagues = (teams.get(task.id) ?? []).filter((m) => m.employee_id !== profile.id);

                            return (
                                <details
                                    key={task.id}
                                    open={inProgress}
                                    className="group rounded-xl border border-white/10 bg-white/[0.03]"
                                >
                                    <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4 [&::-webkit-details-marker]:hidden">
                                        <div className="min-w-0 flex-1">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <p className="text-lg font-bold">{task.title}</p>
                                                <StatusBadge status={taskDisplayStatus(task.status, true)} />
                                            </div>

                                            <p className="mt-1 text-sm text-white/60">
                                                {customer?.full_name ?? task.customer_name ?? "Assigned client"}
                                            </p>

                                            <div className="mt-2 flex flex-wrap gap-4 text-sm text-white/50">
                                                <span className="inline-flex items-center gap-2">
                                                    <Clock3 className="h-4 w-4" />
                                                    {formatDate(task.scheduled_date)}
                                                </span>
                                                <span className="inline-flex items-center gap-2">
                                                    <MapPinned className="h-4 w-4" />
                                                    {task.zone ?? "Unassigned zone"}
                                                </span>
                                            </div>
                                        </div>
                                        <ChevronDown className="h-5 w-5 shrink-0 text-white/40 transition-transform group-open:rotate-180" />
                                    </summary>

                                    <div className="space-y-4 border-t border-white/10 p-4">
                                        {colleagues.length > 0 && (
                                            <p className="text-sm text-sky-300">
                                                With {colleagues.map((m) => m.full_name ?? "a colleague").join(" and ")}
                                            </p>
                                        )}

                                        <div className="flex flex-wrap items-center gap-3">
                                            <TaskServiceButtons taskId={task.id} status={task.status} scheduledDate={task.scheduled_date} />

                                            {inProgress && task.started_at && <TaskTimer startedAt={task.started_at} />}
                                        </div>

                                        <div className="grid gap-4 lg:grid-cols-2">
                                            <div className="space-y-3">
                                                {customer && <CustomerDetails customer={customer} />}

                                                {customer?.can_message && (
                                                    <details className="group/msg rounded-xl border border-white/10 bg-black/20">
                                                        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4 text-sm font-semibold text-amber-300 [&::-webkit-details-marker]:hidden">
                                                            <span className="inline-flex items-center gap-2">
                                                                <MessageCircle className="h-4 w-4" />
                                                                Message {customer.full_name ?? "the customer"}
                                                            </span>
                                                            <ChevronDown className="h-4 w-4 text-white/40 transition-transform group-open/msg:rotate-180" />
                                                        </summary>
                                                        <SendMessageForm
                                                            action={sendMessageToCustomer}
                                                            label="Replies show up in your Messages"
                                                            className="space-y-3 border-t border-white/10 p-4"
                                                        >
                                                            <input type="hidden" name="customerId" value={customer.customer_profile_id} />
                                                            <input
                                                                name="subject"
                                                                defaultValue={`${task.title} · ${formatDate(task.scheduled_date)}`}
                                                                placeholder="Subject"
                                                                required
                                                                className="h-11 w-full rounded-xl border border-white/10 bg-white/8 px-3 text-sm text-white outline-none placeholder:text-white/30"
                                                            />
                                                            <textarea
                                                                name="body"
                                                                placeholder="Message"
                                                                required
                                                                className="min-h-[90px] w-full rounded-xl border border-white/10 bg-white/8 px-3 py-2 text-sm text-white outline-none placeholder:text-white/30"
                                                            />
                                                        </SendMessageForm>
                                                    </details>
                                                )}
                                            </div>

                                            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                                                <TaskPhotoManager
                                                    taskId={task.id}
                                                    photoType="before"
                                                    label="Before"
                                                    accent="sky"
                                                    initialPhotos={uploadsByTask.get(task.id)?.before ?? []}
                                                />
                                                <TaskPhotoManager
                                                    taskId={task.id}
                                                    photoType="after"
                                                    label="After"
                                                    accent="emerald"
                                                    initialPhotos={uploadsByTask.get(task.id)?.after ?? []}
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </details>
                            );
                        })
                    )}
                </div>
            </SectionCard>
        </DashboardShell>
    );
}
