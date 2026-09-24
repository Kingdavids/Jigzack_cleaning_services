import type { SupabaseClient } from "@supabase/supabase-js";
import { CalendarCheck, Coins, PiggyBank, Receipt, TrendingUp, UserPlus, UserX, Users } from "lucide-react";
import StatCard from "@/components/dashboard/StatCard";
import HighlightPanel, { PanelRow } from "@/components/dashboard/HighlightPanel";
import { formatDate, naira } from "@/lib/customer/billing";
import { daysLeft } from "@/lib/admin/deletedCustomers";

// The owner's view of the whole business: money, customers, pickups, what
// needs the owner, and what the admins have been doing. Shown above the
// day-to-day cards, and only to owners.
export default async function OwnerOverview({
                                                supabase,
                                                collected,
                                                outstanding,
                                            }: {
    supabase: SupabaseClient;
    collected: number;
    outstanding: number;
}) {
    const today = new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Lagos" });
    const month = today.slice(0, 7);
    const [year, mon] = month.split("-").map(Number);
    const start = `${month}-01`;
    const next = mon === 12 ? `${year + 1}-01-01` : `${year}-${String(mon + 1).padStart(2, "0")}-01`;

    const [expenses, fresh, active, suspended, deleted, planned, done, invites, activity, admins] = await Promise.all([
        supabase.from("expenses").select("amount, status").gte("expense_date", start).lt("expense_date", next),
        supabase
            .from("customers")
            .select("id", { count: "exact", head: true })
            .gte("created_at", `${start}T00:00:00+01:00`)
            .neq("status", "deleted"),
        supabase.from("customers").select("id", { count: "exact", head: true }).eq("status", "active"),
        supabase.from("customers").select("id", { count: "exact", head: true }).eq("status", "inactive"),
        supabase.from("customers").select("deleted_at").eq("status", "deleted"),
        supabase.from("tasks").select("id", { count: "exact", head: true }).gte("scheduled_date", start).lt("scheduled_date", next),
        supabase
            .from("tasks")
            .select("id", { count: "exact", head: true })
            .gte("scheduled_date", start)
            .lt("scheduled_date", next)
            .eq("status", "completed"),
        // Errors (the table not existing yet) simply leave these at zero.
        supabase
            .from("admin_invites")
            .select("id", { count: "exact", head: true })
            .is("used_at", null)
            .gt("expires_at", new Date().toISOString()),
        supabase.from("activity_log").select("id, actor_name, summary, created_at").order("created_at", { ascending: false }).limit(8),
        supabase.from("profiles").select("id, read_only, is_owner").eq("role", "admin").eq("status", "approved"),
    ]);

    const spent = (expenses.data ?? [])
        .filter((e) => e.status !== "rejected")
        .reduce((sum, e) => sum + Number(e.amount ?? 0), 0);

    const totalPickups = planned.count ?? 0;
    const donePickups = done.count ?? 0;
    const donePercent = totalPickups > 0 ? Math.round((donePickups / totalPickups) * 100) : 0;

    const binned = (deleted.data ?? []) as { deleted_at: string | null }[];
    const soonest = binned.length > 0 ? Math.min(...binned.map((b) => daysLeft(b.deleted_at))) : null;

    // Everyone with admin access except the owners themselves.
    const adminRows = ((admins.data ?? []) as { id: string; read_only: boolean | null; is_owner?: boolean | null }[]).filter((a) => !a.is_owner);
    const fullAdmins = adminRows.filter((a) => !a.read_only).length;
    const viewers = adminRows.length - fullAdmins;

    const recent = (activity.data ?? []) as { id: string; actor_name: string | null; summary: string; created_at: string }[];

    return (
        <section className="space-y-5" aria-label="Owner overview">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-300/80">Owner overview</p>

            <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
                <StatCard icon={Coins} label="Collected this month" value={naira(collected)} helper="Payments received since the 1st" href="/admin/payments" />
                <StatCard icon={Receipt} label="Still owed" value={naira(outstanding)} helper="All unpaid invoices" href="/admin/payments" />
                <StatCard icon={PiggyBank} label="Staff expenses this month" value={naira(spent)} helper="Not counting rejected entries" href="/admin/expenses" />
                <StatCard
                    icon={TrendingUp}
                    label="Net after expenses"
                    value={naira(collected - spent)}
                    helper="Collected minus staff expenses"
                    tone={collected - spent < 0 ? "alert" : "default"}
                />
            </div>

            <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
                <StatCard icon={Users} label="Active customers" value={String(active.count ?? 0)} helper="Billed and scheduled" href="/admin/customers" />
                <StatCard icon={UserPlus} label="New this month" value={String(fresh.count ?? 0)} helper="Joined since the 1st" href="/admin/customers" />
                <StatCard icon={UserX} label="Suspended" value={String(suspended.count ?? 0)} helper="Paused, can be reactivated" href="/admin/customers" />
                <StatCard
                    icon={CalendarCheck}
                    label="Pickups completed"
                    value={`${donePickups} of ${totalPickups}`}
                    helper={totalPickups > 0 ? `${donePercent}% of this month's pickups` : "None scheduled this month"}
                    href="/admin/tasks"
                />
            </div>

            <div className="grid gap-5 lg:grid-cols-2">
                <HighlightPanel title="Needs the owner" href="/admin/admins" linkLabel="Admins">
                    <PanelRow
                        href="/admin/customers"
                        primary={`${binned.length} customer${binned.length === 1 ? "" : "s"} in Recently deleted`}
                        secondary={soonest === null ? "Nothing waiting to be erased" : `The next is erased for good in ${soonest} day${soonest === 1 ? "" : "s"}`}
                    />
                    <PanelRow
                        href="/admin/admins"
                        primary={`${invites.count ?? 0} admin invite${invites.count === 1 ? "" : "s"} not used yet`}
                        secondary="Sent by you, expire after 3 days"
                    />
                    <PanelRow
                        href="/admin/admins"
                        primary={`${fullAdmins} full admin${fullAdmins === 1 ? "" : "s"}, ${viewers} view only`}
                        secondary="The other people who can sign in to this area"
                    />
                </HighlightPanel>

                <HighlightPanel
                    title="What the admins have been doing"
                    href="/admin/activity"
                    linkLabel="Full log"
                    empty={recent.length === 0 ? "Nothing recorded yet." : undefined}
                >
                    {recent.map((entry) => (
                        <PanelRow
                            key={entry.id}
                            href="/admin/activity"
                            primary={`${entry.actor_name ?? "An admin"} ${entry.summary}`}
                            secondary={formatDate(entry.created_at)}
                        />
                    ))}
                </HighlightPanel>
            </div>

            <p className="pt-2 text-xs font-semibold uppercase tracking-[0.2em] text-white/40">Day to day</p>
        </section>
    );
}
