import { createClient } from "@/utils/supabase/server";
import { getUserProfile } from "@/lib/auth/getUserProfile";
import { redirect } from "next/navigation";
import {
    Bell,
    CalendarDays,
    CheckCircle2,
    ClipboardList,
    Clock3,
    LayoutDashboard,
    MapPinned,
    Settings,
    Truck,
    UserCircle2,
    Users,
    Wrench,
} from "lucide-react";
import { LogOut  } from "lucide-react";
import { createClient as createBrowserClient } from "@/utils/supabase/client";
import LogoutButton from "@/components/dashboard/LogoutButton";
import { endTask, startTask, uploadTaskPhoto } from "@/app/employee/actions";

type TaskRow = {
    id: string;
    title: string;
    status: string | null;
    priority: string | null;
    scheduled_date: string | null;
    zone: string | null;
    employee_id: string | null;
    customer_id: string | null;
    customer_name?: string | null;
    created_at?: string | null;
};

type UploadRow = {
    id: string;
    task_id: string | null;
    image_url: string | null;
    task_title?: string | null;
    created_at?: string | null;
};

function statusVariant(status: string) {
    const s = status.toLowerCase();

    if (s === "in progress") {
        return "bg-emerald-500/15 text-emerald-300 border-emerald-400/20";
    }

    if (s === "pending") {
        return "bg-amber-500/15 text-amber-300 border-amber-400/20";
    }

    if (s === "completed") {
        return "bg-sky-500/15 text-sky-300 border-sky-400/20";
    }

    return "bg-zinc-500/15 text-zinc-300 border-zinc-400/20";
}

function priorityVariant(priority: string) {
    const p = priority.toLowerCase();

    if (p === "high") {
        return "bg-rose-500/15 text-rose-300 border-rose-400/20";
    }

    if (p === "medium") {
        return "bg-orange-500/15 text-orange-300 border-orange-400/20";
    }

    return "bg-zinc-500/15 text-zinc-300 border-zinc-400/20";
}

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

export default async function EmployeePage() {
    const profile = await getUserProfile();

    if (profile.status !== "approved") {
        redirect("/auth/pending");
    }

    if (profile.role !== "employee") {
        redirect(`/${profile.role}`);
    }

    const supabase = await createClient();

    const { data: taskData, error: taskError } = await supabase
        .from("tasks")
        .select("*")
        .eq("employee_id", profile.id)
        .order("created_at", { ascending: false });

    if (taskError) {
        console.error("Failed to load employee tasks:", taskError.message);
    }

    const tasks: TaskRow[] = taskData ?? [];

    const { data: uploadData, error: uploadError } = await supabase
        .from("uploads")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(4);

    if (uploadError) {
        console.error("Failed to load uploads:", uploadError.message);
    }

    const uploads: UploadRow[] = uploadData ?? [];

    const completed = tasks.filter(
        (t) => (t.status ?? "").toLowerCase() === "completed"
    ).length;

    const pending = tasks.filter(
        (t) => (t.status ?? "").toLowerCase() !== "completed"
    ).length;

    const inProgress = tasks.filter(
        (t) => (t.status ?? "").toLowerCase() === "in progress"
    ).length;

    const highPriority = tasks.filter(
        (t) => (t.priority ?? "").toLowerCase() === "high"
    ).length;

    const recentActivity = tasks.slice(0, 4).map((task) => ({
        id: task.id,
        text: `${task.title} updated to ${task.status ?? "Unknown"}`,
    }));

    return (
        <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(249,115,22,0.18),_transparent_30%),linear-gradient(180deg,_#0a0a0a_0%,_#101114_100%)] text-white">
            <div className="mx-auto max-w-7xl px-4 py-6 md:px-6 lg:px-8">
                <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
                    <aside className="rounded-3xl border border-white/10 bg-white/5 p-4 shadow-2xl backdrop-blur-xl">
                        <div className="mb-8 flex items-center gap-3">
                            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-orange-500/20 ring-1 ring-orange-400/30">
                                <Wrench className="h-6 w-6 text-orange-300" />
                            </div>
                            <div>
                                <p className="text-xs uppercase tracking-[0.3em] text-white/50">
                                    Jigzack
                                </p>
                                <h1 className="text-xl font-semibold">Employee Portal</h1>
                            </div>
                        </div>

                        <nav className="space-y-2">
                            {[
                                [LayoutDashboard, "Overview"],
                                [ClipboardList, "My Tasks"],
                                [Truck, "Routes"],
                                [CalendarDays, "Schedule"],
                                [Users, "Team"],
                                [Settings, "Settings"],
                            ].map(([Icon, label]) => (
                                <button
                                    key={label as string}
                                    className={`flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left transition ${
                                        label === "Overview"
                                            ? "bg-orange-500/20 text-white ring-1 ring-orange-400/30"
                                            : "text-white/70 hover:bg-white/10 hover:text-white"
                                    }`}
                                >
                                    <Icon className="h-5 w-5" />
                                    <span className="text-sm font-medium">{label}</span>
                                </button>
                            ))}
                        </nav>

                        <div className="mt-8 rounded-3xl border border-orange-400/20 bg-orange-500/10 p-4">
                            <p className="text-xs uppercase tracking-[0.2em] text-orange-200/70">
                                Today
                            </p>
                            <h2 className="mt-2 text-lg font-semibold">Morning Dispatch</h2>
                            <p className="mt-1 text-sm text-white/70">
                                All pickup teams should check route priority before departure.
                            </p>
                            <button className="mt-4 w-full rounded-2xl bg-orange-500 px-4 py-3 font-semibold text-white transition hover:bg-orange-400">
                                View briefing
                            </button>
                        </div>
                    </aside>

                    <main className="space-y-6">
                        <div className="rounded-[28px] border border-white/10 bg-white/5 p-5 shadow-2xl backdrop-blur-xl">
                            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                                <div>
                                    <p className="text-sm text-orange-200/80">Welcome back</p>
                                    <h2 className="mt-1 text-3xl font-semibold tracking-tight">
                                        Operational Dashboard
                                    </h2>
                                    <p className="mt-2 text-sm text-white/60">
                                        Track waste pickups, monitor field teams, and stay on top of
                                        daily service delivery.
                                    </p>
                                </div>

                                <div className="flex items-center gap-3">
                                    <button className="rounded-2xl border border-white/15 bg-white/5 px-4 py-2 text-white transition hover:bg-white/10">
    <span className="inline-flex items-center gap-2">
      <Bell className="h-4 w-4" />
      Notifications
    </span>
                                    </button>

                                    <LogoutButton />

                                    <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-3 py-2">
                                        <UserCircle2 className="h-9 w-9 text-orange-300" />
                                        <div>
                                            <p className="text-sm font-medium">{profile.full_name ?? "Employee"}</p>
                                            <p className="text-xs text-white/50">Employee</p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                            <div className="rounded-[26px] border border-white/10 bg-white/5 p-5 text-white shadow-xl backdrop-blur-xl">
                                <div className="flex items-start justify-between">
                                    <div>
                                        <p className="text-sm text-white/60">Assigned Pickups</p>
                                        <h3 className="mt-3 text-3xl font-semibold tracking-tight">
                                            {tasks.length}
                                        </h3>
                                        <p className="mt-2 text-sm text-orange-200/75">
                                            Total assigned tasks
                                        </p>
                                    </div>
                                    <div className="rounded-2xl bg-orange-500/15 p-3 ring-1 ring-orange-400/20">
                                        <Truck className="h-5 w-5 text-orange-300" />
                                    </div>
                                </div>
                            </div>

                            <div className="rounded-[26px] border border-white/10 bg-white/5 p-5 text-white shadow-xl backdrop-blur-xl">
                                <div className="flex items-start justify-between">
                                    <div>
                                        <p className="text-sm text-white/60">Pending Jobs</p>
                                        <h3 className="mt-3 text-3xl font-semibold tracking-tight">
                                            {pending}
                                        </h3>
                                        <p className="mt-2 text-sm text-orange-200/75">
                                            Includes scheduled and active
                                        </p>
                                    </div>
                                    <div className="rounded-2xl bg-orange-500/15 p-3 ring-1 ring-orange-400/20">
                                        <ClipboardList className="h-5 w-5 text-orange-300" />
                                    </div>
                                </div>
                            </div>

                            <div className="rounded-[26px] border border-white/10 bg-white/5 p-5 text-white shadow-xl backdrop-blur-xl">
                                <div className="flex items-start justify-between">
                                    <div>
                                        <p className="text-sm text-white/60">Completed</p>
                                        <h3 className="mt-3 text-3xl font-semibold tracking-tight">
                                            {completed}
                                        </h3>
                                        <p className="mt-2 text-sm text-orange-200/75">
                                            Finished service tasks
                                        </p>
                                    </div>
                                    <div className="rounded-2xl bg-orange-500/15 p-3 ring-1 ring-orange-400/20">
                                        <CheckCircle2 className="h-5 w-5 text-orange-300" />
                                    </div>
                                </div>
                            </div>

                            <div className="rounded-[26px] border border-white/10 bg-white/5 p-5 text-white shadow-xl backdrop-blur-xl">
                                <div className="flex items-start justify-between">
                                    <div>
                                        <p className="text-sm text-white/60">High Priority</p>
                                        <h3 className="mt-3 text-3xl font-semibold tracking-tight">
                                            {highPriority}
                                        </h3>
                                        <p className="mt-2 text-sm text-orange-200/75">
                                            Urgent work orders
                                        </p>
                                    </div>
                                    <div className="rounded-2xl bg-orange-500/15 p-3 ring-1 ring-orange-400/20">
                                        <Users className="h-5 w-5 text-orange-300" />
                                    </div>
                                </div>
                            </div>
                        </section>

                        <section className="grid gap-6 xl:grid-cols-[1.45fr_0.9fr]">
                            <div className="rounded-[28px] border border-white/10 bg-white/5 text-white shadow-2xl backdrop-blur-xl">
                                <div className="flex flex-col gap-4 border-b border-white/10 p-6 sm:flex-row sm:items-center sm:justify-between">
                                    <div>
                                        <h3 className="text-xl font-semibold">Assigned Tasks</h3>
                                        <p className="mt-1 text-sm text-white/55">
                                            Live overview of your service work orders.
                                        </p>
                                    </div>
                                </div>

                                <div className="space-y-4 p-6">
                                    {tasks.length === 0 ? (
                                        <div className="rounded-3xl border border-white/10 bg-black/20 p-5 text-sm text-white/60">
                                            No tasks assigned yet.
                                        </div>
                                    ) : (
                                        tasks.map((task) => (
                                            <div
                                                key={task.id}
                                                className="rounded-3xl border border-white/10 bg-black/20 p-4 transition hover:border-orange-300/25 hover:bg-white/[0.07]"
                                            >
                                                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                                                    <div>
                                                        <div className="flex flex-wrap items-center gap-2">
                                                            <h3 className="text-lg font-semibold">
                                                                {task.title}
                                                            </h3>
                                                            <span
                                                                className={`inline-flex rounded-full border px-3 py-1 text-xs font-medium ${statusVariant(
                                                                    task.status ?? "unknown"
                                                                )}`}
                                                            >
                                {task.status ?? "Unknown"}
                              </span>
                                                            <span
                                                                className={`inline-flex rounded-full border px-3 py-1 text-xs font-medium ${priorityVariant(
                                                                    task.priority ?? "low"
                                                                )}`}
                                                            >
                                {task.priority ?? "Low"}
                              </span>
                                                        </div>

                                                        <p className="mt-2 text-sm text-white/60">
                                                            Customer: {task.customer_name ?? "Assigned client"}
                                                        </p>

                                                        <div className="mt-3 flex flex-wrap gap-4 text-sm text-white/55">
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
                                                                    className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-2 text-emerald-200 transition hover:bg-emerald-500/20"
                                                                >
                                                                    Start Task
                                                                </button>
                                                            </form>

                                                            <form action={endTask}>
                                                                <input type="hidden" name="taskId" value={task.id} />
                                                                <button
                                                                    type="submit"
                                                                    className="rounded-2xl bg-orange-500 px-4 py-2 text-white transition hover:bg-orange-400"
                                                                >
                                                                    End Task
                                                                </button>
                                                            </form>
                                                        </div>

                                                        <div className="grid gap-3">
                                                            <form action={uploadTaskPhoto} className="rounded-2xl border border-white/10 bg-white/5 p-3">
                                                                <input type="hidden" name="taskId" value={task.id} />
                                                                <input type="hidden" name="photoType" value="before" />
                                                                <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.15em] text-white/55">
                                                                    Before Photo
                                                                </label>
                                                                <input
                                                                    type="file"
                                                                    name="photo"
                                                                    accept="image/*"
                                                                    className="mb-3 block w-full text-sm text-white/70 file:mr-3 file:rounded-xl file:border-0 file:bg-white/10 file:px-3 file:py-2 file:text-sm file:text-white"
                                                                />
                                                                <button
                                                                    type="submit"
                                                                    className="w-full rounded-2xl border border-white/10 bg-white/10 px-4 py-2 text-white transition hover:bg-white/15"
                                                                >
                                                                    Upload Before
                                                                </button>
                                                            </form>

                                                            <form action={uploadTaskPhoto} className="rounded-2xl border border-white/10 bg-white/5 p-3">
                                                                <input type="hidden" name="taskId" value={task.id} />
                                                                <input type="hidden" name="photoType" value="after" />
                                                                <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.15em] text-white/55">
                                                                    After Photo
                                                                </label>
                                                                <input
                                                                    type="file"
                                                                    name="photo"
                                                                    accept="image/*"
                                                                    className="mb-3 block w-full text-sm text-white/70 file:mr-3 file:rounded-xl file:border-0 file:bg-white/10 file:px-3 file:py-2 file:text-sm file:text-white"
                                                                />
                                                                <button
                                                                    type="submit"
                                                                    className="w-full rounded-2xl border border-white/10 bg-white/10 px-4 py-2 text-white transition hover:bg-white/15"
                                                                >
                                                                    Upload After
                                                                </button>
                                                            </form>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>

                            <div className="space-y-6">
                                <div className="rounded-[28px] border border-white/10 bg-white/5 text-white shadow-2xl backdrop-blur-xl">
                                    <div className="border-b border-white/10 p-6">
                                        <h3 className="text-xl font-semibold">Team Snapshot</h3>
                                    </div>
                                    <div className="space-y-4 p-6">
                                        <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                                            <div>
                                                <p className="font-medium">In Progress</p>
                                                <p className="text-sm text-white/50">
                                                    Active field tasks
                                                </p>
                                            </div>
                                            <span className="rounded-full border border-white/10 bg-white/8 px-3 py-1 text-sm text-white/80">
                        {inProgress}
                      </span>
                                        </div>

                                        <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                                            <div>
                                                <p className="font-medium">Completed</p>
                                                <p className="text-sm text-white/50">
                                                    Finished assignments
                                                </p>
                                            </div>
                                            <span className="rounded-full border border-white/10 bg-white/8 px-3 py-1 text-sm text-white/80">
                        {completed}
                      </span>
                                        </div>

                                        <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                                            <div>
                                                <p className="font-medium">Pending</p>
                                                <p className="text-sm text-white/50">
                                                    Waiting for action
                                                </p>
                                            </div>
                                            <span className="rounded-full border border-white/10 bg-white/8 px-3 py-1 text-sm text-white/80">
                        {pending}
                      </span>
                                        </div>
                                    </div>
                                </div>

                                <div className="rounded-[28px] border border-white/10 bg-white/5 text-white shadow-2xl backdrop-blur-xl">
                                    <div className="border-b border-white/10 p-6">
                                        <h3 className="text-xl font-semibold">Recent Activity</h3>
                                    </div>
                                    <div className="space-y-4 p-6">
                                        {recentActivity.length === 0 ? (
                                            <div className="rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-white/60">
                                                No recent activity yet.
                                            </div>
                                        ) : (
                                            recentActivity.map((item) => (
                                                <div
                                                    key={item.id}
                                                    className="flex gap-3 rounded-2xl border border-white/10 bg-black/20 p-4"
                                                >
                                                    <div className="mt-0.5 rounded-full bg-orange-500/20 p-2">
                                                        <CheckCircle2 className="h-4 w-4 text-orange-300" />
                                                    </div>
                                                    <p className="text-sm text-white/75">{item.text}</p>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                </div>

                                <div className="rounded-[28px] border border-white/10 bg-white/5 text-white shadow-2xl backdrop-blur-xl">
                                    <div className="border-b border-white/10 p-6">
                                        <h3 className="text-xl font-semibold">Task Uploads</h3>
                                    </div>
                                    <div className="grid gap-4 p-6">
                                        {uploads.length === 0 ? (
                                            <div className="rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-white/60">
                                                No uploads available.
                                            </div>
                                        ) : (
                                            uploads.map((upload) => (
                                                <div
                                                    key={upload.id}
                                                    className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.04] shadow transition hover:-translate-y-1 hover:border-amber-300/20"
                                                >
                                                    {upload.image_url ? (
                                                        <img
                                                            src={upload.image_url}
                                                            alt={upload.task_title ?? "Task upload"}
                                                            className="h-44 w-full object-cover transition duration-700 hover:scale-105"
                                                        />
                                                    ) : (
                                                        <div className="flex h-44 items-center justify-center bg-black/20 text-sm text-white/40">
                                                            No image
                                                        </div>
                                                    )}

                                                    <div className="p-4">
                                                        <p className="font-bold">
                                                            {upload.task_title ?? "Task upload"}
                                                        </p>
                                                        <p className="text-sm text-white/60">
                                                            Synced with admin uploads
                                                        </p>
                                                    </div>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                </div>
                            </div>
                        </section>
                    </main>
                </div>
            </div>
        </div>
    );
}