import { requireDashboardAccess } from "@/lib/dashboard/requireDashboardAccess";
import { createEmployeeInvite } from "../actions";
import DashboardShell from "@/components/dashboard/DashboardShell";
import SectionCard from "@/components/dashboard/SectionCard";
import EmployeeInviteForm from "@/components/dashboard/EmployeeInviteForm";
import InviteRowActions from "@/components/dashboard/InviteRowActions";

type InviteRow = {
    id: string;
    token: string;
    email: string | null;
    used_at: string | null;
    expires_at: string;
    created_at: string;
};

function formatDate(value: string) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleDateString("en-CA", { year: "numeric", month: "short", day: "numeric" });
}

export default async function AdminEmployeesPage() {
    const { profile, supabase, unreadCount } = await requireDashboardAccess("admin");

    const { data: invitesData } = await supabase
        .from("employee_invites")
        .select("id, token, email, used_at, expires_at, created_at")
        .order("created_at", { ascending: false })
        .limit(30);

    const invites = (invitesData ?? []) as InviteRow[];
    const now = Date.now();

    const { data: employeesData } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .eq("role", "employee")
        .eq("status", "approved")
        .order("full_name", { ascending: true });

    const employees = employeesData ?? [];

    return (
        <DashboardShell
            role="admin"
            profileId={profile.id}
            title="Employees"
            subtitle="Employee accounts are invite-only. Invite people here; they can't sign up on their own."
            unreadCount={unreadCount}
        >
            <div className="space-y-6">
                <SectionCard
                    title="Invite an employee"
                    description="Generates a single-use link. Add their email to lock it to that address and send it to them."
                >
                    <EmployeeInviteForm action={createEmployeeInvite} />
                </SectionCard>

                <SectionCard title="Invites" description="Links you've created. Used and expired ones can't be reused.">
                    {invites.length === 0 ? (
                        <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5 text-sm text-white/60">
                            No invites yet.
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {invites.map((invite) => {
                                const used = Boolean(invite.used_at);
                                const expired = !used && new Date(invite.expires_at).getTime() < now;

                                return (
                                    <div
                                        key={invite.id}
                                        className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4 sm:flex-row sm:items-center sm:justify-between"
                                    >
                                        <div>
                                            <p className="text-sm font-semibold">{invite.email ?? "Open invite (any email)"}</p>
                                            <p className="mt-1 text-xs text-white/45">
                                                Created {formatDate(invite.created_at)}
                                                {used
                                                    ? ` · used ${formatDate(invite.used_at as string)}`
                                                    : ` · ${expired ? "expired" : "expires"} ${formatDate(invite.expires_at)}`}
                                            </p>
                                        </div>

                                        {used ? (
                                            <span className="w-fit rounded-full bg-emerald-400/10 px-3 py-1 text-xs font-semibold text-emerald-300">
                                                Used
                                            </span>
                                        ) : expired ? (
                                            <span className="w-fit rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white/50">
                                                Expired
                                            </span>
                                        ) : (
                                            <InviteRowActions inviteId={invite.id} token={invite.token} />
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </SectionCard>

                <SectionCard title="Active employees" description="Approved staff who can be assigned tasks.">
                    {employees.length === 0 ? (
                        <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5 text-sm text-white/60">
                            No approved employees yet.
                        </div>
                    ) : (
                        <div className="grid gap-3 sm:grid-cols-2">
                            {employees.map((employee) => (
                                <div key={employee.id} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                                    <p className="text-sm font-semibold">{employee.full_name}</p>
                                    <p className="mt-0.5 text-xs text-white/45">{employee.email}</p>
                                </div>
                            ))}
                        </div>
                    )}
                </SectionCard>
            </div>
        </DashboardShell>
    );
}
