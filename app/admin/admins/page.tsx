import { requireDashboardAccess } from "@/lib/dashboard/requireDashboardAccess";
import { isOwner } from "@/lib/auth/roles";
import { siteOrigin } from "@/lib/site-origin";
import { formatDate } from "@/lib/customer/billing";
import DashboardShell from "@/components/dashboard/DashboardShell";
import SectionCard from "@/components/dashboard/SectionCard";
import AdminInviteForm from "@/components/dashboard/AdminInviteForm";
import { AdminAccessButtons, AdminInviteButtons } from "@/components/dashboard/AdminRowActions";

type AdminRow = {
    id: string;
    full_name: string | null;
    email: string | null;
    status: string;
    read_only: boolean | null;
    is_owner?: boolean | null;
    created_at: string;
};

type InviteRow = { id: string; token: string; email: string; role: string; expires_at: string; created_at: string };

export default async function AdminAdminsPage() {
    const { profile, supabase, unreadCount } = await requireDashboardAccess("admin");
    // Only owners invite or change admins.
    const canManage = isOwner(profile);
    const origin = await siteOrigin();

    // Before supabase/admins-activity-2026-09.sql is run the read_only column
    // does not exist, so fall back to the plain list.
    let adminsResult = await supabase
        .from("profiles")
        .select("id, full_name, email, status, read_only, is_owner, created_at")
        .eq("role", "admin")
        .order("created_at", { ascending: true });

    // Before the owner update has been run there is no is_owner column.
    if (adminsResult.error) {
        adminsResult = (await supabase
            .from("profiles")
            .select("id, full_name, email, status, read_only, created_at")
            .eq("role", "admin")
            .order("created_at", { ascending: true })) as unknown as typeof adminsResult;
    }

    let switchedOn = true;
    if (adminsResult.error) {
        switchedOn = false;
        adminsResult = (await supabase
            .from("profiles")
            .select("id, full_name, email, status, created_at")
            .eq("role", "admin")
            .order("created_at", { ascending: true })) as typeof adminsResult;
    }

    const admins = (adminsResult.data ?? []) as unknown as AdminRow[];

    const { data: inviteData } = await supabase
        .from("admin_invites")
        .select("id, token, email, role, expires_at, created_at")
        .is("used_at", null)
        .gt("expires_at", new Date().toISOString())
        .order("created_at", { ascending: false });

    const invites = (inviteData ?? []) as InviteRow[];

    // Other admins do not see owners in this list.
    const visible = canManage ? admins : admins.filter((a) => !a.is_owner);
    const active = visible.filter((a) => a.status === "approved");
    const removed = visible.filter((a) => a.status !== "approved");

    return (
        <DashboardShell
            role="admin"
            profileId={profile.id}
            title="Admins"
            subtitle="Who can run the business, and who can only look."
            unreadCount={unreadCount}
        >
            <div className="space-y-6">
                {switchedOn && !canManage && (
                    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-sm text-white/65">
                        Only an owner can invite, change or remove admins. Ask an owner if you need something changed here.
                    </div>
                )}

                {!switchedOn && (
                    <div className="rounded-2xl border border-amber-300/30 bg-amber-300/10 p-4 text-sm text-amber-100">
                        Admin invites are not switched on yet. Run <code>supabase/admins-activity-2026-09.sql</code> in the
                        Supabase SQL editor to turn them on.
                    </div>
                )}

                {canManage && switchedOn && (
                    <SectionCard
                        title="Invite someone"
                        description="They get a link tied to their email address. It works once and expires in 3 days. A full admin can change anything. A supervisor can see everything and change nothing."
                    >
                        <AdminInviteForm />
                    </SectionCard>
                )}

                <SectionCard title="Current admins" description={`${active.length} with access.`}>
                    <div className="space-y-3">
                        {active.map((admin) => (
                            <div
                                key={admin.id}
                                className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4 md:flex-row md:items-center md:justify-between"
                            >
                                <div className="min-w-0">
                                    <p className="font-bold">
                                        {admin.full_name ?? "Unnamed"}{" "}
                                        <span
                                            className={`ml-1 rounded-full border px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide ${
                                                admin.read_only
                                                    ? "border-sky-400/30 bg-sky-400/10 text-sky-300"
                                                    : "border-amber-300/30 bg-amber-300/10 text-amber-200"
                                            }`}
                                        >
                                            {admin.read_only ? "Supervisor, view only" : admin.is_owner ? "Owner" : "Full admin"}
                                        </span>
                                    </p>
                                    <p className="truncate text-sm text-white/55">{admin.email}</p>
                                    <p className="text-xs text-white/40">Joined {formatDate(admin.created_at)}</p>
                                </div>

                                {canManage && (
                                    <AdminAccessButtons
                                        userId={admin.id}
                                        isViewOnly={Boolean(admin.read_only)}
                                        isRemoved={false}
                                        isSelf={admin.id === profile.id}
                                        isOwnerTarget={Boolean(admin.is_owner)}
                                    />
                                )}
                            </div>
                        ))}
                    </div>
                </SectionCard>

                {canManage && invites.length > 0 && (
                    <SectionCard title="Waiting to join" description="Invites that have not been used yet.">
                        <div className="space-y-3">
                            {invites.map((invite) => (
                                <div
                                    key={invite.id}
                                    className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4 md:flex-row md:items-center md:justify-between"
                                >
                                    <div className="min-w-0">
                                        <p className="font-bold">{invite.email}</p>
                                        <p className="text-xs text-white/50">
                                            {invite.role === "supervisor" ? "Supervisor (view only)" : "Full admin"} · expires{" "}
                                            {formatDate(invite.expires_at)}
                                        </p>
                                    </div>
                                    {canManage && (
                                        <AdminInviteButtons inviteId={invite.id} link={`${origin}/auth/admin-invite?token=${invite.token}`} />
                                    )}
                                </div>
                            ))}
                        </div>
                    </SectionCard>
                )}

                {removed.length > 0 && (
                    <SectionCard title="Removed" description="These people can no longer open the admin area. Their records and history stay.">
                        <div className="space-y-3">
                            {removed.map((admin) => (
                                <div
                                    key={admin.id}
                                    className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4 md:flex-row md:items-center md:justify-between"
                                >
                                    <div className="min-w-0">
                                        <p className="font-bold text-white/70">{admin.full_name ?? "Unnamed"}</p>
                                        <p className="truncate text-sm text-white/45">{admin.email}</p>
                                    </div>
                                    {canManage && (
                                        <AdminAccessButtons userId={admin.id} isViewOnly={false} isRemoved isSelf={false} />
                                    )}
                                </div>
                            ))}
                        </div>
                    </SectionCard>
                )}
            </div>
        </DashboardShell>
    );
}
