import { requireDashboardAccess } from "@/lib/dashboard/requireDashboardAccess";
import { createInvoice } from "../actions";
import DashboardShell from "@/components/dashboard/DashboardShell";
import SectionCard from "@/components/dashboard/SectionCard";
import StatusBadge from "@/components/dashboard/StatusBadge";

type ProfileRef = { full_name: string | null } | null;

type PaymentRow = {
    id: string;
    amount: number;
    status: string;
    invoice_month: string | null;
    created_at: string;
    customer: ProfileRef;
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

export default async function AdminPaymentsPage() {
    const { profile, supabase, unreadCount } = await requireDashboardAccess("admin");

    const { data: directoryData } = await supabase
        .from("profiles")
        .select("id, full_name, role")
        .eq("role", "customer")
        .eq("status", "approved")
        .order("full_name", { ascending: true });

    const customerOptions = directoryData ?? [];

    const { data: paymentsData } = await supabase
        .from("payments")
        .select(
            "id, amount, status, invoice_month, created_at, customer:profiles!payments_customer_id_fkey(full_name)"
        )
        .order("created_at", { ascending: false })
        .limit(10);

    const payments = (paymentsData ?? []) as unknown as PaymentRow[];

    return (
        <DashboardShell
            role="admin"
            profileId={profile.id}
            title="Payments"
            subtitle="Recent transactions."
            unreadCount={unreadCount}
        >
            <SectionCard title="Payments" description="Recent transactions">
                <div className="space-y-4">
                    {payments.length === 0 ? (
                        <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5 text-sm text-white/60">
                            No invoices yet.
                        </div>
                    ) : (
                        payments.map((payment) => (
                            <div
                                key={payment.id}
                                className="rounded-3xl border border-white/10 bg-white/[0.03] p-5 transition hover:border-white/20"
                            >
                                <div className="flex justify-between items-center">
                                    <div>
                                        <p className="font-bold">
                                            {payment.customer?.full_name ?? "Unknown customer"}
                                        </p>
                                        <p className="text-xs text-white/50">
                                            {payment.invoice_month ?? formatDate(payment.created_at)}
                                        </p>
                                    </div>

                                    <div className="text-right">
                                        <p className="font-bold text-amber-300">
                                            ₦{Number(payment.amount).toLocaleString()}
                                        </p>
                                        <StatusBadge status={payment.status} />
                                    </div>
                                </div>
                            </div>
                        ))
                    )}

                    <form
                        action={createInvoice}
                        className="space-y-3 rounded-3xl border border-white/10 bg-black/20 p-5"
                    >
                        <p className="text-xs uppercase tracking-[0.2em] text-white/45">
                            Create invoice
                        </p>

                        <select
                            name="customerId"
                            required
                            defaultValue=""
                            className="h-11 w-full rounded-xl border border-white/10 bg-[#141518] px-3 text-sm text-white outline-none"
                        >
                            <option value="" disabled>
                                Select customer
                            </option>
                            {customerOptions.map((c) => (
                                <option key={c.id} value={c.id}>
                                    {c.full_name}
                                </option>
                            ))}
                        </select>

                        <div className="grid gap-3 sm:grid-cols-2">
                            <input
                                type="number"
                                name="amount"
                                placeholder="Amount (₦)"
                                required
                                min="0"
                                step="0.01"
                                className="h-11 w-full rounded-xl border border-white/10 bg-white/8 px-3 text-sm text-white outline-none placeholder:text-white/30"
                            />
                            <input
                                name="invoiceMonth"
                                placeholder="e.g. March 2026"
                                className="h-11 w-full rounded-xl border border-white/10 bg-white/8 px-3 text-sm text-white outline-none placeholder:text-white/30"
                            />
                        </div>

                        <input
                            name="description"
                            placeholder="Description"
                            className="h-11 w-full rounded-xl border border-white/10 bg-white/8 px-3 text-sm text-white outline-none placeholder:text-white/30"
                        />

                        <button
                            type="submit"
                            className="w-full rounded-2xl bg-amber-400 px-4 py-2.5 font-bold text-black transition hover:bg-amber-300"
                        >
                            Create Invoice
                        </button>
                    </form>
                </div>
            </SectionCard>
        </DashboardShell>
    );
}
