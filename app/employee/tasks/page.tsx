import { requireDashboardAccess } from "@/lib/dashboard/requireDashboardAccess";
import { Clock3, MapPinned } from "lucide-react";
import DashboardShell from "@/components/dashboard/DashboardShell";
import SectionCard from "@/components/dashboard/SectionCard";
import StatusBadge from "@/components/dashboard/StatusBadge";
import { endTask, startTask, uploadTaskPhoto } from "@/app/employee/actions";

type TaskRow = {
    id: string;
    title: string;
    status: string | null;
    priority: string | null;
    scheduled_date: string | null;
    zone: string | null;
    customer_name?: string | null;
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

export default async function EmployeeTasksPage() {
    const { profile, supabase, unreadCount } = await requireDashboardAccess("employee");

    const { data: taskData, error: taskError } = await supabase
        .from("tasks")
        .select("*")
        .eq("employee_id", profile.id)
        .order("created_at", { ascending: false });

    if (taskError) {
        console.error("Failed to load employee tasks:", taskError.message);
    }

    const tasks: TaskRow[] = taskData ?? [];

    return (
        <DashboardShell
            role="employee"
            profileId={profile.id}
            title="Assigned Tasks"
            subtitle="Live overview of your service work orders."
            unreadCount={unreadCount}
        >
            <SectionCard title="Assigned Tasks" description="Live overview of your service work orders.">
                <div className="space-y-4">
                    {tasks.length === 0 ? (
                        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-5 text-sm text-white/50">
                            No tasks assigned yet.
                        </div>
                    ) : (
                        tasks.map((task) => (
                            <div key={task.id} className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                                    <div>
                                        <div className="flex flex-wrap items-center gap-2">
                                            <p className="text-lg font-bold">{task.title}</p>
                                            <StatusBadge status={(task.status ?? "pending").toLowerCase()} />
                                        </div>

                                        <p className="mt-2 text-sm text-white/60">
                                            Customer: {task.customer_name ?? "Assigned client"}
                                        </p>

                                        <div className="mt-3 flex flex-wrap gap-4 text-sm text-white/50">
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

                                    <div className="flex flex-col gap-3 lg:min-w-[280px]">
                                        <div className="flex gap-3">
                                            <form action={startTask}>
                                                <input type="hidden" name="taskId" value={task.id} />
                                                <button
                                                    type="submit"
                                                    className="rounded-xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-2 text-sm font-semibold text-emerald-300 transition hover:bg-emerald-500/20"
                                                >
                                                    Start Task
                                                </button>
                                            </form>

                                            <form action={endTask}>
                                                <input type="hidden" name="taskId" value={task.id} />
                                                <button
                                                    type="submit"
                                                    className="rounded-xl bg-amber-400 px-4 py-2 text-sm font-bold text-black transition hover:bg-amber-300"
                                                >
                                                    End Task
                                                </button>
                                            </form>
                                        </div>

                                        <div className="grid gap-3 sm:grid-cols-2">
                                            <form action={uploadTaskPhoto} className="rounded-xl border border-sky-400/20 bg-black/20 p-3">
                                                <input type="hidden" name="taskId" value={task.id} />
                                                <input type="hidden" name="photoType" value="before" />
                                                <label className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.15em] text-sky-300">
                                                    <span className="h-1.5 w-1.5 rounded-full bg-sky-400" />
                                                    Before Photo
                                                </label>
                                                <input
                                                    type="file"
                                                    name="photo"
                                                    accept="image/*"
                                                    className="mb-3 block w-full text-sm text-white/60 file:mr-3 file:rounded-lg file:border-0 file:bg-white/10 file:px-3 file:py-2 file:text-sm file:text-white"
                                                />
                                                <button
                                                    type="submit"
                                                    className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-white transition hover:bg-white/10"
                                                >
                                                    Upload
                                                </button>
                                            </form>

                                            <form action={uploadTaskPhoto} className="rounded-xl border border-emerald-400/20 bg-black/20 p-3">
                                                <input type="hidden" name="taskId" value={task.id} />
                                                <input type="hidden" name="photoType" value="after" />
                                                <label className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.15em] text-emerald-300">
                                                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                                                    After Photo
                                                </label>
                                                <input
                                                    type="file"
                                                    name="photo"
                                                    accept="image/*"
                                                    className="mb-3 block w-full text-sm text-white/60 file:mr-3 file:rounded-lg file:border-0 file:bg-white/10 file:px-3 file:py-2 file:text-sm file:text-white"
                                                />
                                                <button
                                                    type="submit"
                                                    className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-white transition hover:bg-white/10"
                                                >
                                                    Upload
                                                </button>
                                            </form>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </SectionCard>
        </DashboardShell>
    );
}
