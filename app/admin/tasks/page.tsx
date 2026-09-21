import { requireDashboardAccess } from "@/lib/dashboard/requireDashboardAccess";
import { createTask } from "../actions";
import DashboardShell from "@/components/dashboard/DashboardShell";
import SectionCard from "@/components/dashboard/SectionCard";
import StatusBadge from "@/components/dashboard/StatusBadge";

type ProfileRef = { full_name: string | null } | null;

type TaskRow = {
    id: string;
    title: string;
    status: string | null;
    scheduled_date: string | null;
    customer: ProfileRef;
    employee: ProfileRef;
};

function formatDate(value: string | null | undefined) {
    if (!value) return "Not scheduled";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleDateString("en-CA", {
        year: "numeric",
        month: "short",
        day: "numeric",
    });
}

export default async function AdminTasksPage() {
    const { supabase, unreadCount } = await requireDashboardAccess("admin");

    const { data: directoryData } = await supabase
        .from("profiles")
        .select("id, full_name, role")
        .in("role", ["employee", "customer"])
        .eq("status", "approved")
        .order("full_name", { ascending: true });

    const directory = directoryData ?? [];
    const employeeOptions = directory.filter((p) => p.role === "employee");
    const customerOptions = directory.filter((p) => p.role === "customer");

    const { data: tasksData } = await supabase
        .from("tasks")
        .select(
            "id, title, status, scheduled_date, customer:profiles!tasks_customer_id_fkey(full_name), employee:profiles!tasks_employee_id_fkey(full_name)"
        )
        .order("created_at", { ascending: false })
        .limit(10);

    const tasks = (tasksData ?? []) as unknown as TaskRow[];

    return (
        <DashboardShell
            role="admin"
            title="Task Progress"
            subtitle="Live overview of assigned service tasks."
            unreadCount={unreadCount}
        >
            <SectionCard title="Task progress" description="Live overview of assigned service tasks.">
                <div className="space-y-4">
                    {tasks.length === 0 ? (
                        <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5 text-sm text-white/60">
                            No tasks yet.
                        </div>
                    ) : (
                        tasks.map((task) => (
                            <div
                                key={task.id}
                                className="rounded-3xl border border-white/10 bg-white/[0.03] p-5 transition hover:border-white/20"
                            >
                                <div className="flex flex-col gap-3 md:flex-row md:justify-between">
                                    <div>
                                        <p className="font-bold text-lg">{task.title}</p>
                                        <p className="text-sm text-white/60">
                                            {task.customer?.full_name ?? "Unassigned customer"} •{" "}
                                            {task.employee?.full_name ?? "Unassigned employee"}
                                        </p>
                                        <p className="text-xs text-white/40 mt-2">
                                            {formatDate(task.scheduled_date)}
                                        </p>
                                    </div>

                                    <StatusBadge status={task.status ?? "pending"} />
                                </div>
                            </div>
                        ))
                    )}

                    <form
                        action={createTask}
                        className="space-y-3 rounded-3xl border border-white/10 bg-black/20 p-5"
                    >
                        <p className="text-xs uppercase tracking-[0.2em] text-white/45">
                            Assign new task
                        </p>

                        <input
                            name="title"
                            placeholder="Task title"
                            required
                            className="h-11 w-full rounded-xl border border-white/10 bg-white/8 px-3 text-sm text-white outline-none placeholder:text-white/30 focus:border-amber-300/50"
                        />

                        <div className="grid gap-3 sm:grid-cols-2">
                            <select
                                name="customerId"
                                defaultValue=""
                                className="h-11 w-full rounded-xl border border-white/10 bg-[#141518] px-3 text-sm text-white outline-none"
                            >
                                <option value="">No customer (internal task)</option>
                                {customerOptions.map((c) => (
                                    <option key={c.id} value={c.id}>
                                        {c.full_name}
                                    </option>
                                ))}
                            </select>

                            <select
                                name="employeeId"
                                required
                                defaultValue=""
                                className="h-11 w-full rounded-xl border border-white/10 bg-[#141518] px-3 text-sm text-white outline-none"
                            >
                                <option value="" disabled>
                                    Select employee
                                </option>
                                {employeeOptions.map((e) => (
                                    <option key={e.id} value={e.id}>
                                        {e.full_name}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div className="grid gap-3 sm:grid-cols-3">
                            <input
                                type="date"
                                name="scheduledDate"
                                className="h-11 w-full rounded-xl border border-white/10 bg-white/8 px-3 text-sm text-white outline-none"
                            />
                            <input
                                name="zone"
                                placeholder="Zone"
                                className="h-11 w-full rounded-xl border border-white/10 bg-white/8 px-3 text-sm text-white outline-none placeholder:text-white/30"
                            />
                            <select
                                name="priority"
                                defaultValue="low"
                                className="h-11 w-full rounded-xl border border-white/10 bg-[#141518] px-3 text-sm text-white outline-none"
                            >
                                <option value="low">Low</option>
                                <option value="medium">Medium</option>
                                <option value="high">High</option>
                            </select>
                        </div>

                        <button
                            type="submit"
                            className="w-full rounded-2xl bg-amber-400 px-4 py-2.5 font-bold text-black transition hover:bg-amber-300"
                        >
                            Assign Task
                        </button>
                    </form>
                </div>
            </SectionCard>
        </DashboardShell>
    );
}
