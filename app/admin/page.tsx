import { createClient } from "@/utils/supabase/server";
import { requireDashboardAccess } from "@/lib/dashboard/requireDashboardAccess";
import DashboardShell from "@/components/dashboard/DashboardShell";
import StatCard from "@/components/dashboard/StatCard";
import { UserCheck, Users, Briefcase, Wallet } from "lucide-react";

export default async function AdminPage() {
    const { profile, unreadCount } = await requireDashboardAccess("admin");
    const supabase = await createClient();

    const { data: pendingUsers } = await supabase
        .from("profiles")
        .select("id")
        .eq("status", "pending");

    const { data: customersData } = await supabase.from("customers").select("id");
    const customers = customersData ?? [];

    const { data: employeesData } = await supabase
        .from("profiles")
        .select("id")
        .eq("role", "employee")
        .eq("status", "approved");

    const employees = employeesData ?? [];

    const { data: unpaidPaymentsData } = await supabase
        .from("payments")
        .select("amount, status")
        .neq("status", "paid");

    const totalBalance = (unpaidPaymentsData ?? []).reduce(
        (sum, p) => sum + Number(p.amount ?? 0),
        0
    );

    return (
        <DashboardShell
            role="admin"
            profileId={profile.id}
            title="Admin Dashboard"
            subtitle="Manage operations, approvals, customers, tasks, uploads, messages, and payments."
            unreadCount={unreadCount}
        >
            <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
                <StatCard
                    icon={UserCheck}
                    label="Pending approvals"
                    value={String(pendingUsers?.length ?? 0)}
                    helper="Users waiting for admin approval"
                />
                <StatCard
                    icon={Users}
                    label="Total customers"
                    value={String(customers.length)}
                    helper="Active and inactive clients"
                />
                <StatCard
                    icon={Briefcase}
                    label="Employees"
                    value={String(employees.length)}
                    helper="Approved field staff and supervisors"
                />
                <StatCard
                    icon={Wallet}
                    label="Outstanding balance"
                    value={`₦${totalBalance.toLocaleString()}`}
                    helper="Total unpaid customer balances"
                />
            </div>
        </DashboardShell>
    );
}
