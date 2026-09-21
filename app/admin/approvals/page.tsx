import { requireDashboardAccess } from "@/lib/dashboard/requireDashboardAccess";
import ApprovalsList from "../ApprovalsList";
import DashboardShell from "@/components/dashboard/DashboardShell";
import SectionCard from "@/components/dashboard/SectionCard";

export default async function AdminApprovalsPage() {
    const { supabase, unreadCount } = await requireDashboardAccess("admin");

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

    return (
        <DashboardShell
            role="admin"
            title="Signup Approvals"
            subtitle="Approve or decline new users."
            unreadCount={unreadCount}
        >
            <SectionCard title="Signup approvals" description="Approve or decline new users.">
                <ApprovalsList
                    users={pendingUsers ?? []}
                    customerDetailsByProfileId={customerDetailsByProfileId}
                    employeeDetailsByProfileId={employeeDetailsByProfileId}
                />
            </SectionCard>
        </DashboardShell>
    );
}
