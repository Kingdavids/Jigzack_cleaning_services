import { requireDashboardAccess } from "@/lib/dashboard/requireDashboardAccess";
import { createTask } from "../actions";
import DashboardShell from "@/components/dashboard/DashboardShell";
import SectionCard from "@/components/dashboard/SectionCard";
import StatusBadge from "@/components/dashboard/StatusBadge";
import AssignTaskForm from "@/components/dashboard/AssignTaskForm";
import CustomerScheduleGenerator from "@/components/dashboard/CustomerScheduleGenerator";
import TaskAdminControls from "@/components/dashboard/TaskAdminControls";
import { BulkCheckbox, BulkSelectProvider } from "@/components/dashboard/BulkSelect";
import { deleteTasks } from "../cleanup-actions";
import { isFullAdmin } from "@/lib/auth/roles";
import { deletedProfileIds } from "@/lib/admin/deletedCustomers";
import { loadTaskTeams, taskDisplayStatus, teamNames } from "@/lib/tasks";
import RevertTaskButton from "@/components/dashboard/RevertTaskButton";
import MarkServicedButton from "@/components/dashboard/MarkServicedButton";
import { TaskFilter, TaskGroup } from "@/components/dashboard/TaskGroups";
import { customerFrequency, describeFrequency } from "@/lib/billing/schedule";

type ProfileRef = { full_name: string | null } | null;

type TaskRow = {
    id: string;
    title: string;
    status: string | null;
    scheduled_date: string | null;
    zone: string | null;
    customer_id: string | null;
    employee_id: string | null;
    auto_generated: boolean;
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
    const { profile, supabase, unreadCount } = await requireDashboardAccess("admin");

    const { data: directoryData } = await supabase
        .from("profiles")
        .select("id, full_name, role")
        .in("role", ["employee", "customer"])
        .eq("status", "approved")
        .order("full_name", { ascending: true });

    const hidden = await deletedProfileIds(supabase);
    const directory = (directoryData ?? []).filter((p) => !hidden.has(p.id));
    const employeeOptions = directory.filter((p) => p.role === "employee");
    const customerOptions = directory.filter((p) => p.role === "customer");

    // Tenants are covered by their estate's schedule, so only customers with
    // their own pickups can have one generated.
    const { data: ownScheduleData } = await supabase.from("customers").select("profile_id").is("unit_id", null);
    const ownSchedule = new Set((ownScheduleData ?? []).map((c) => c.profile_id as string));
    const scheduleCustomers = customerOptions.filter((c) => ownSchedule.has(c.id));

    // Pickups whose date has passed are marked serviced. Quietly does nothing for
    // view-only admins, or before the crew SQL has been run.
    if (isFullAdmin(profile)) {
        await supabase.rpc("mark_past_tasks_serviced");
    }

    const columns =
        "id, title, status, scheduled_date, zone, customer_id, employee_id, auto_generated, customer:profiles!tasks_customer_id_fkey(full_name), employee:profiles!tasks_employee_id_fkey(full_name)";

    // Work still to do, soonest first. Serviced work is loaded separately, so a long
    // history never pushes upcoming pickups out of the list.
    const [{ data: openData }, { data: servicedData }] = await Promise.all([
        supabase
            .from("tasks")
            .select(columns)
            .not("status", "in", "(completed,declined)")
            .order("scheduled_date", { ascending: true, nullsFirst: false })
            .limit(600),
        supabase.from("tasks").select(columns).eq("status", "completed").order("scheduled_date", { ascending: false }).limit(200),
    ]);

    const openTasks = (openData ?? []) as unknown as TaskRow[];
    const servicedTasks = (servicedData ?? []) as unknown as TaskRow[];
    const tasks = [...openTasks, ...servicedTasks];
    const canBulk = isFullAdmin(profile);
    const unassigned = openTasks.filter((t) => !t.employee_id).length;
    const teams = await loadTaskTeams(supabase, tasks.map((t) => t.id));

    // Each customer's pickup pattern, for the heading of their group.
    const groupCustomerIds = [...new Set(tasks.map((t) => t.customer_id).filter((id): id is string => Boolean(id)))];
    const { data: patternRows } = groupCustomerIds.length
        ? await supabase.from("customers").select("*").in("profile_id", groupCustomerIds)
        : { data: [] as Record<string, unknown>[] };
    const patternByCustomer = new Map(
        (patternRows ?? []).map((row) => [
            row.profile_id as string,
            describeFrequency(customerFrequency(row as { preferred_pickup_frequency?: string | null; pickup_days?: number[] | null })),
        ])
    );

    type Group = { key: string; name: string; pattern: string | null; open: TaskRow[]; serviced: TaskRow[] };
    const groupMap = new Map<string, Group>();

    for (const task of tasks) {
        const key = task.customer_id ?? "internal";
        const group =
            groupMap.get(key) ??
            ({
                key,
                name: task.customer?.full_name ?? "Internal tasks (no customer)",
                pattern: task.customer_id ? patternByCustomer.get(task.customer_id) ?? null : null,
                open: [],
                serviced: [],
            } as Group);

        if ((task.status ?? "pending") === "completed") group.serviced.push(task);
        else group.open.push(task);

        groupMap.set(key, group);
    }

    // Customers with pickups still to assign first, then by name.
    const needsOf = (group: Group) => group.open.filter((t) => !t.employee_id).length;
    const groups = [...groupMap.values()].sort((a, b) => Number(needsOf(b) > 0) - Number(needsOf(a) > 0) || a.name.localeCompare(b.name));

    const renderTask = (task: TaskRow) => (
        <div
            key={task.id}
            className={`relative rounded-2xl border border-white/10 bg-white/[0.03] p-4 transition hover:border-white/20 ${canBulk ? "pl-11" : ""}`}
        >
            <div className="absolute left-4 top-5">
                <BulkCheckbox id={task.id} label="Select task" />
            </div>
            <div className="flex flex-col gap-2 md:flex-row md:justify-between">
                <div>
                    <p className="font-bold">
                        {formatDate(task.scheduled_date)}
                        <span className="ml-2 text-sm font-normal text-white/50">{task.title}</span>
                    </p>
                    <p className="text-sm text-white/60">
                        {teamNames(teams.get(task.id)) || task.employee?.full_name || "Unassigned employee"}
                        {task.zone ? ` • ${task.zone}` : ""}
                    </p>
                </div>

                <div className="self-start">
                    <StatusBadge status={taskDisplayStatus(task.status, Boolean(task.employee_id))} />
                </div>
            </div>

            {(task.status ?? "pending") === "pending" && isFullAdmin(profile) && (
                <TaskAdminControls
                    taskId={task.id}
                    employeeId={task.employee_id}
                    crewIds={(teams.get(task.id) ?? []).filter((m) => !m.is_lead).map((m) => m.employee_id)}
                    teamText={teamNames(teams.get(task.id)) || task.employee?.full_name || ""}
                    scheduledDate={task.scheduled_date}
                    zone={task.zone}
                    employees={employeeOptions.map((e) => ({ id: e.id, full_name: e.full_name }))}
                />
            )}

            {["pending", "in progress"].includes(task.status ?? "pending") && isFullAdmin(profile) && (
                <MarkServicedButton taskId={task.id} title={task.title} scheduledDate={task.scheduled_date} />
            )}

            {(task.status ?? "pending") === "completed" && isFullAdmin(profile) && (
                <RevertTaskButton taskId={task.id} title={task.title} dateText={formatDate(task.scheduled_date)} />
            )}
        </div>
    );

    return (
        <DashboardShell
            role="admin"
            profileId={profile.id}
            title="Task Progress"
            subtitle="Live overview of assigned service tasks."
            unreadCount={unreadCount}
        >
            <div className="space-y-6">
            <SectionCard
                title="Schedule"
                description="Generate pickups for one customer at a time from their stated frequency. Assign staff, change dates, or remove any of them below."
            >
                <div className="space-y-3">
                    {isFullAdmin(profile) ? (
                        <CustomerScheduleGenerator customers={scheduleCustomers.map((c) => ({ id: c.id, full_name: c.full_name }))} />
                    ) : (
                        <p className="text-sm text-white/50">You have view-only access, so schedules can&apos;t be generated from your account.</p>
                    )}
                    <p className="text-sm text-white/50">
                        {unassigned > 0 ? `${unassigned} upcoming pickups still need a driver.` : "Every upcoming pickup has someone assigned."}
                    </p>
                </div>
            </SectionCard>

            <SectionCard
                title="Schedule by customer"
                description="Each customer's pickups together, upcoming first. Open a customer to assign, change or revert their pickups."
            >
                <div className="space-y-4">
                    <BulkSelectProvider
                        enabled={canBulk && tasks.length > 0}
                        allIds={tasks.map((t) => t.id)}
                        action={deleteTasks}
                        noun="task"
                    >
                        {groups.length === 0 ? (
                            <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5 text-sm text-white/60">No tasks yet.</div>
                        ) : (
                            <TaskFilter>
                                {groups.map((group) => {
                                    const needs = needsOf(group);
                                    const assigned = group.open.length - needs;

                                    return (
                                        <TaskGroup
                                            key={group.key}
                                            name={group.name}
                                            needs={needs}
                                            defaultOpen={needs > 0 && groups.length <= 6}
                                            header={
                                                <div>
                                                    <p className="truncate text-lg font-bold">{group.name}</p>
                                                    <p className="mt-0.5 text-sm text-white/55">
                                                        {group.pattern ? `${group.pattern} · ` : ""}
                                                        {group.open.length} upcoming
                                                        {needs > 0 && <span className="font-semibold text-amber-300"> · {needs} to assign</span>}
                                                        {assigned > 0 && <span> · {assigned} assigned</span>}
                                                        {group.serviced.length > 0 && <span> · {group.serviced.length} serviced</span>}
                                                    </p>
                                                </div>
                                            }
                                        >
                                            {group.open.length === 0 ? (
                                                <p className="text-sm text-white/45">Nothing upcoming for this customer.</p>
                                            ) : (
                                                group.open.map(renderTask)
                                            )}
                                            {group.serviced.length > 0 && (
                                                <div className="space-y-3 pt-2">
                                                    <p className="text-xs font-semibold uppercase tracking-[0.15em] text-white/40">Recently serviced</p>
                                                    {group.serviced.slice(0, 5).map(renderTask)}
                                                </div>
                                            )}
                                        </TaskGroup>
                                    );
                                })}
                            </TaskFilter>
                        )}
                    </BulkSelectProvider>

                    <AssignTaskForm action={createTask}>
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

                        {employeeOptions.length > 1 && (
                            <fieldset>
                                <legend className="text-xs text-white/50">Also on this task (optional, when two or more go together)</legend>
                                <div className="mt-1.5 flex flex-wrap gap-2">
                                    {employeeOptions.map((e) => (
                                        <label
                                            key={e.id}
                                            className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-white/75 sm:min-h-9 sm:text-xs"
                                        >
                                            <input type="checkbox" name="crewIds" value={e.id} className="h-4 w-4 accent-amber-400" />
                                            {e.full_name}
                                        </label>
                                    ))}
                                </div>
                            </fieldset>
                        )}

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
                    </AssignTaskForm>
                </div>
            </SectionCard>
            </div>
        </DashboardShell>
    );
}
