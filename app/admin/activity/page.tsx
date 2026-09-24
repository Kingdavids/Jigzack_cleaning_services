import { requireDashboardAccess } from "@/lib/dashboard/requireDashboardAccess";
import DashboardShell from "@/components/dashboard/DashboardShell";
import SectionCard from "@/components/dashboard/SectionCard";
import ClearActivityCard from "@/components/dashboard/ClearActivityCard";
import { isOwner } from "@/lib/auth/roles";

type LogRow = {
    id: string;
    actor_id: string | null;
    actor_name: string | null;
    action: string;
    summary: string;
    created_at: string;
};

const when = (value: string) =>
    new Date(value).toLocaleString("en-GB", {
        timeZone: "Africa/Lagos",
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    });

export default async function AdminActivityPage({
                                                     searchParams,
                                                 }: {
    searchParams: Promise<{ who?: string; q?: string }>;
}) {
    const { profile, supabase, unreadCount } = await requireDashboardAccess("admin");
    const params = await searchParams;

    const who = /^[0-9a-f-]{36}$/i.test(params.who ?? "") ? (params.who as string) : "";
    const q = (params.q ?? "").trim().slice(0, 80).replace(/[%,()]/g, " ");

    const { data: adminData } = await supabase
        .from("profiles")
        .select("id, full_name")
        .eq("role", "admin")
        .order("full_name", { ascending: true });

    let query = supabase
        .from("activity_log")
        .select("id, actor_id, actor_name, action, summary, created_at")
        .order("created_at", { ascending: false })
        .limit(200);

    if (who) query = query.eq("actor_id", who);
    if (q) query = query.ilike("summary", `%${q}%`);

    const { data, error } = await query;
    const rows = (error ? [] : (data ?? [])) as LogRow[];

    return (
        <DashboardShell
            role="admin"
            profileId={profile.id}
            title="Activity"
            subtitle="Who changed what in the admin area. Entries cannot be edited, and only an owner can clear them."
            unreadCount={unreadCount}
        >
            <div className="space-y-6">
                {error && (
                    <div className="rounded-2xl border border-amber-300/30 bg-amber-300/10 p-4 text-sm text-amber-100">
                        The activity log is not switched on yet. Run <code>supabase/admins-activity-2026-09.sql</code> in the
                        Supabase SQL editor to turn it on.
                    </div>
                )}

                <SectionCard title="Filter" description="Choose an admin or search the text.">
                    <form method="get" className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
                        <select
                            name="who"
                            defaultValue={who}
                            aria-label="Admin"
                            className="h-11 rounded-xl border border-white/10 bg-[#141518] px-3 text-sm text-white outline-none"
                        >
                            <option value="">All admins</option>
                            {(adminData ?? []).map((a) => (
                                <option key={a.id} value={a.id}>
                                    {a.full_name}
                                </option>
                            ))}
                        </select>
                        <input
                            name="q"
                            defaultValue={q}
                            aria-label="Search"
                            placeholder="Search, for example invoice"
                            className="h-11 rounded-xl border border-white/10 bg-white/8 px-3 text-sm text-white outline-none placeholder:text-white/30"
                        />
                        <button type="submit" className="h-11 rounded-xl bg-amber-400 px-5 text-sm font-bold text-black hover:bg-amber-300">
                            Apply
                        </button>
                    </form>
                </SectionCard>

                <SectionCard title="Recent activity" description={`${rows.length} entr${rows.length === 1 ? "y" : "ies"}, newest first. Times are Lagos time.`}>
                    {rows.length === 0 ? (
                        <p className="text-sm text-white/50">Nothing recorded yet.</p>
                    ) : (
                        <div className="divide-y divide-white/8">
                            {rows.map((row) => (
                                <div key={row.id} className="flex flex-col gap-1 py-3 md:flex-row md:items-baseline md:justify-between">
                                    <p className="text-sm text-white/85">
                                        <span className="font-bold text-amber-200">{row.actor_name ?? "Unknown admin"}</span>{" "}
                                        {row.summary}
                                    </p>
                                    <p className="shrink-0 text-xs text-white/40">{when(row.created_at)}</p>
                                </div>
                            ))}
                        </div>
                    )}
                </SectionCard>

                {isOwner(profile) && (
                    <SectionCard title="Clear the log" description="Owners only. Remove old entries, or everything.">
                        <ClearActivityCard />
                    </SectionCard>
                )}
            </div>
        </DashboardShell>
    );
}
