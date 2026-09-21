import { requireDashboardAccess } from "@/lib/dashboard/requireDashboardAccess";
import DashboardShell from "@/components/dashboard/DashboardShell";
import SectionCard from "@/components/dashboard/SectionCard";
import StatusBadge from "@/components/dashboard/StatusBadge";

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

export default async function AdminCustomersPage() {
    const { supabase, unreadCount } = await requireDashboardAccess("admin");

    const { data: customersData } = await supabase
        .from("customers")
        .select("*")
        .order("created_at", { ascending: false });

    const customers = customersData ?? [];

    return (
        <DashboardShell
            role="admin"
            title="Customers"
            subtitle="Customer records, service activity, and balances."
            unreadCount={unreadCount}
        >
            <SectionCard title="Customers" description="Customer records, service activity, and balances.">
                <div className="overflow-x-auto rounded-3xl border border-white/10 bg-white/[0.03] p-3">
                    <table className="min-w-full text-left text-sm">
                        <thead className="text-white/50">
                        <tr>
                            <th className="pb-3">Customer</th>
                            <th className="pb-3">Last Service</th>
                            <th className="pb-3">Balance</th>
                            <th className="pb-3">Status</th>
                        </tr>
                        </thead>
                        <tbody>
                        {customers.map((customer) => (
                            <tr
                                key={customer.id}
                                className="border-t border-white/5 hover:bg-white/[0.03] transition"
                            >
                                <td className="py-4">
                                    <p className="font-semibold">{customer.full_name}</p>
                                    <p className="text-white/50 text-xs">{customer.address}</p>
                                </td>

                                <td>{formatDate(customer.last_serviced)}</td>

                                <td className="font-semibold text-amber-300">
                                    ₦{Number(customer.balance).toLocaleString()}
                                </td>

                                <td>
                                    <StatusBadge status={customer.status} />
                                </td>
                            </tr>
                        ))}
                        </tbody>
                    </table>
                </div>
            </SectionCard>
        </DashboardShell>
    );
}
