import { requireDashboardAccess } from "@/lib/dashboard/requireDashboardAccess";
import ApprovalsList from "../ApprovalsList";
import DashboardShell from "@/components/dashboard/DashboardShell";
import SectionCard from "@/components/dashboard/SectionCard";
import DeclinedList, { type DeclinedUser } from "@/components/dashboard/DeclinedList";

export default async function AdminApprovalsPage() {
    const { profile, supabase, unreadCount } = await requireDashboardAccess("admin");

    const { data: pendingUsers } = await supabase
        .from("profiles")
        .select("id, full_name, email, role, created_at")
        .eq("status", "pending")
        .order("created_at", { ascending: false });

    const { data: customersData } = await supabase
        .from("customers")
        .select("*")
        .order("created_at", { ascending: false });

    const customers = customersData ?? [];

    const customerDetailsByProfileId = Object.fromEntries(
        customers.filter((c) => c.profile_id).map((c) => [c.profile_id as string, c])
    );

    const { data: employeesData } = await supabase
        .from("employees")
        .select("*")
        .order("created_at", { ascending: false });

    const employees = employeesData ?? [];

    const employeeDetailsByProfileId = Object.fromEntries(
        employees.filter((e) => e.profile_id).map((e) => [e.profile_id as string, e])
    );

    const { data: unitsData } = await supabase
        .from("units")
        .select("id, label, estate_profile_id, estate:profiles!units_estate_profile_id_fkey(full_name)")
        .order("label", { ascending: true });

    const units = ((unitsData ?? []) as unknown as {
        id: string;
        label: string;
        estate_profile_id: string;
        estate: { full_name: string | null } | null;
    }[]).map((u) => ({
        id: u.id,
        label: u.label,
        estateName: u.estate?.full_name ?? "Estate",
    }));

    // Declined applications, newest first. The reason columns arrive with
    // supabase/declined-and-expenses-2026-09.sql; until then fall back to the
    // basics so this page never breaks.
    let declinedResult = await supabase
        .from("profiles")
        .select("id, full_name, email, role, decline_reason, declined_at")
        .eq("status", "declined")
        .neq("role", "admin")
        .order("created_at", { ascending: false });

    if (declinedResult.error) {
        declinedResult = (await supabase
            .from("profiles")
            .select("id, full_name, email, role")
            .eq("status", "declined")
            .neq("role", "admin")
            .order("created_at", { ascending: false })) as typeof declinedResult;
    }

    const declined = (declinedResult.data ?? []) as unknown as DeclinedUser[];

    return (
        <DashboardShell
            role="admin"
            profileId={profile.id}
            title="Signup Approvals"
            subtitle="Approve or decline new users."
            unreadCount={unreadCount}
        >
            <SectionCard title="Signup approvals" description="Approve or decline new users.">
                <ApprovalsList
                    users={pendingUsers ?? []}
                    customerDetailsByProfileId={customerDetailsByProfileId}
                    employeeDetailsByProfileId={employeeDetailsByProfileId}
                    units={units}
                />
            </SectionCard>

            <div className="mt-6">
                <SectionCard
                    title="Declined applications"
                    description="If someone contacts you after being declined, move them back to pending and review them again."
                >
                    <DeclinedList users={declined} />
                </SectionCard>
            </div>
        </DashboardShell>
    );
}
