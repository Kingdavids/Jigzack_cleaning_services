import { requireDashboardAccess } from "@/lib/dashboard/requireDashboardAccess";
import { Clock3, MapPinned } from "lucide-react";
import DashboardShell from "@/components/dashboard/DashboardShell";
import SectionCard from "@/components/dashboard/SectionCard";
import StatusBadge from "@/components/dashboard/StatusBadge";
import TaskPhotoManager from "@/components/dashboard/TaskPhotoManager";
import TaskTimer from "@/components/dashboard/TaskTimer";
import { endTask, startTask } from "@/app/employee/actions";

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
    const taskIds = tasks.map((t) => t.id);

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
                                        <div className="flex items-center gap-3">
                                            <form action={startTask}>
                                                <input type="hidden" name="taskId" value={task.id} />
                                                <button
                                                    type="submit"
                                                    disabled={(task.status ?? "").toLowerCase() === "in progress"}
                                                    className="rounded-xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-2 text-sm font-semibold text-emerald-300 transition hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-50"
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

                                            {(task.status ?? "").toLowerCase() === "in progress" && task.started_at && (
                                                <TaskTimer startedAt={task.started_at} />
                                            )}
                                        </div>

                                        <div className="grid gap-3 sm:grid-cols-2">
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
                            </div>
                        ))
                    )}
                </div>
            </SectionCard>
        </DashboardShell>
    );
}
