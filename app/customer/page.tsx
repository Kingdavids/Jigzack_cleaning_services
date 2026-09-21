import { requireDashboardAccess } from "@/lib/dashboard/requireDashboardAccess";
import DashboardShell from "@/components/dashboard/DashboardShell";
import StatCard from "@/components/dashboard/StatCard";
import { CalendarClock, CalendarCheck, Camera, Wallet } from "lucide-react";

function formatDate(value: string | null | undefined) {
    if (!value) return "Not available";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleDateString("en-CA", {
        year: "numeric",
        month: "short",
        day: "numeric",
    });
}

export default async function CustomerPage() {
    const { profile, supabase, unreadCount, customer } = await requireDashboardAccess("customer");

    const { data: pickupsData } = await supabase
        .from("tasks")
        .select("scheduled_date")
        .eq("customer_id", profile.id)
        .order("scheduled_date", { ascending: true });

    const pickups = pickupsData ?? [];

    const { count: uploadsCount } = await supabase
        .from("uploads")
        .select("id", { count: "exact", head: true })
        .eq("customer_id", profile.id);

    const { data: invoicesData } = await supabase
        .from("payments")
        .select("amount, status")
        .eq("customer_id", profile.id);

    const invoices = invoicesData ?? [];

    const now = new Date();

    const nextPickup =
        pickups.find((pickup) => {
            if (!pickup.scheduled_date) return false;
            return new Date(pickup.scheduled_date) >= now;
        }) ?? null;

    const outstandingBalance = invoices
        .filter((invoice) => (invoice.status ?? "").toLowerCase() !== "paid")
        .reduce((sum, invoice) => sum + Number(invoice.amount ?? 0), 0);

    return (
        <DashboardShell
            role="customer"
            title="Customer Dashboard"
            subtitle={`Welcome back, ${profile.full_name ?? customer?.full_name ?? "there"} — track service history, upcoming pickups, photos, and invoices.`}
            unreadCount={unreadCount}
        >
            <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
                <StatCard
                    icon={CalendarCheck}
                    label="Last Serviced"
                    value={customer?.last_serviced ? formatDate(customer.last_serviced) : "Not available"}
                    helper="Most recent completed pickup"
                />
                <StatCard
                    icon={CalendarClock}
                    label="Next Pickup"
                    value={nextPickup?.scheduled_date ? formatDate(nextPickup.scheduled_date) : "Not scheduled"}
                    helper="Nearest upcoming service date"
                />
                <StatCard
                    icon={Camera}
                    label="Photos"
                    value={String(uploadsCount ?? 0)}
                    helper="Before and after service uploads"
                />
                <StatCard
                    icon={Wallet}
                    label="Outstanding Balance"
                    value={`₦${outstandingBalance.toLocaleString()}`}
                    helper="Current unpaid invoices"
                />
            </div>
        </DashboardShell>
    );
}
