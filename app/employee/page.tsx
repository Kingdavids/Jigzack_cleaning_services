import { requireDashboardAccess } from "@/lib/dashboard/requireDashboardAccess";
import { Truck, ClipboardList, CheckCircle2, AlertTriangle } from "lucide-react";
import DashboardShell from "@/components/dashboard/DashboardShell";
import StatCard from "@/components/dashboard/StatCard";

type TaskRow = {
    status: string | null;
    priority: string | null;
};

export default async function EmployeePage() {
    const { profile, supabase, unreadCount } = await requireDashboardAccess("employee");

    const { data: taskData } = await supabase
        .from("tasks")
        .select("status, priority")
        .eq("employee_id", profile.id);

    const tasks: TaskRow[] = taskData ?? [];

    const completed = tasks.filter((t) => (t.status ?? "").toLowerCase() === "completed").length;
    const pending = tasks.filter((t) => (t.status ?? "").toLowerCase() !== "completed").length;
    const highPriority = tasks.filter((t) => (t.priority ?? "").toLowerCase() === "high").length;

    return (
        <DashboardShell
            role="employee"
            profileId={profile.id}
            title="Employee Dashboard"
            subtitle="Track pickups, upload photos, and stay in touch with admin."
            unreadCount={unreadCount}
        >
            <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
                <StatCard
                    icon={Truck}
                    label="Assigned Pickups"
                    value={String(tasks.length)}
                    helper="Total assigned tasks"
                />
                <StatCard
                    icon={ClipboardList}
                    label="Pending Jobs"
                    value={String(pending)}
                    helper="Includes scheduled and active"
                />
                <StatCard
                    icon={CheckCircle2}
                    label="Completed"
                    value={String(completed)}
                    helper="Finished service tasks"
                />
                <StatCard
                    icon={AlertTriangle}
                    label="High Priority"
                    value={String(highPriority)}
                    helper="Urgent work orders"
                />
            </div>
        </DashboardShell>
    );
}
