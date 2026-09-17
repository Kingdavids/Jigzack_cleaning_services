import { createClient } from "@/utils/supabase/server";
import ApprovalsList from "./ApprovalsList";
import { getUserProfile } from "@/lib/auth/getUserProfile";
import { redirect } from "next/navigation";
import DashboardShell from "@/components/dashboard/DashboardShell";
import SectionCard from "@/components/dashboard/SectionCard";
import StatCard from "@/components/dashboard/StatCard";
import StatusBadge from "@/components/dashboard/StatusBadge";
import {
    employees,
    messages,
    payments,
    tasks,
    uploads,
} from "@/lib/dashboard-data";

export default async function AdminPage() {
    const profile = await getUserProfile();

    if (profile.status !== "approved") {
        redirect("/auth/pending");
    }

    if (profile.role !== "admin") {
        redirect(`/${profile.role}`);
    }

    const supabase = await createClient();

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

    const totalBalance = customers.reduce((sum, c) => sum + c.balance, 0);

    return (
        <DashboardShell
            role="admin"
            title="Admin Dashboard"
            subtitle="Manage operations, approvals, customers, tasks, uploads, messages, and payments."
        >
            <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
                <StatCard
                    label="Pending approvals"
                    value={String(pendingUsers?.length ?? 0)}
                    helper="Users waiting for admin approval"
                />
                <StatCard
                    label="Total customers"
                    value={String(customers.length)}
                    helper="Active and inactive clients"
                />
                <StatCard
                    label="Employees"
                    value={String(employees.length)}
                    helper="Field staff and supervisors"
                />
                <StatCard
                    label="Outstanding balance"
                    value={`₦${totalBalance.toLocaleString()}`}
                    helper="Total unpaid customer balances"
                />
            </div>

            <div className="grid gap-6 2xl:grid-cols-2">
                <SectionCard
                    title="Signup approvals"
                    description="Approve or decline new users."
                >
                    <ApprovalsList users={pendingUsers ?? []} />
                </SectionCard>

                <SectionCard
                    title="Task progress"
                    description="Live overview of assigned service tasks."
                >
                    <div className="space-y-4">
                        {tasks.map((task) => (
                            <div
                                key={task.id}
                                className="rounded-3xl border border-white/10 bg-white/[0.04] p-5 backdrop-blur-xl shadow transition hover:border-amber-300/20"
                            >
                                <div className="flex flex-col gap-3 md:flex-row md:justify-between">
                                    <div>
                                        <p className="font-bold text-lg">{task.title}</p>
                                        <p className="text-sm text-white/60">
                                            {task.customerName} • {task.employeeName}
                                        </p>
                                        <p className="text-xs text-white/40 mt-2">
                                            {task.scheduledDate}
                                        </p>
                                    </div>

                                    <StatusBadge status={task.status} />
                                </div>
                            </div>
                        ))}
                    </div>
                </SectionCard>
            </div>

            <div className="grid gap-6 2xl:grid-cols-2">
                <SectionCard
                    title="Customers"
                    description="Customer records, service activity, and balances."
                >
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
                                    className="border-t border-white/5 hover:bg-white/[0.04] transition"
                                >
                                    <td className="py-4">
                                        <p className="font-semibold">{customer.fullName}</p>
                                        <p className="text-white/50 text-xs">
                                            {customer.address}
                                        </p>
                                    </td>

                                    <td>{customer.lastServiced}</td>

                                    <td className="font-semibold text-amber-300">
                                        ₦{customer.balance.toLocaleString()}
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

                <SectionCard
                    title="Task uploads"
                    description="Photos uploaded by employees."
                >
                    <div className="grid gap-4 md:grid-cols-2">
                        {uploads.map((upload) => (
                            <div
                                key={upload.id}
                                className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.04] shadow transition hover:-translate-y-1 hover:border-amber-300/20"
                            >
                                <img
                                    src={upload.imageUrl}
                                    alt={upload.taskTitle}
                                    className="h-44 w-full object-cover transition duration-700 hover:scale-105"
                                />

                                <div className="p-4">
                                    <p className="font-bold">{upload.taskTitle}</p>
                                    <p className="text-sm text-white/60">
                                        {upload.employeeName}
                                    </p>
                                </div>
                            </div>
                        ))}
                    </div>
                </SectionCard>
            </div>

            <div className="grid gap-6 2xl:grid-cols-2">
                <SectionCard title="Messages" description="Recent communication">
                    <div className="space-y-4">
                        {messages.map((message) => (
                            <div
                                key={message.id}
                                className="rounded-3xl border border-white/10 bg-white/[0.04] p-5 backdrop-blur-xl transition hover:border-amber-300/20"
                            >
                                <p className="font-bold">{message.subject}</p>
                                <p className="text-sm text-white/50 mt-1">
                                    {message.from} → {message.to}
                                </p>
                                <p className="text-sm text-white/70 mt-3">
                                    {message.preview}
                                </p>
                            </div>
                        ))}

                        <button className="w-full rounded-2xl bg-amber-400 px-4 py-3 font-bold text-black hover:bg-amber-300 transition shadow">
                            Send Message
                        </button>
                    </div>
                </SectionCard>

                <SectionCard title="Payments" description="Recent transactions">
                    <div className="space-y-4">
                        {payments.map((payment) => (
                            <div
                                key={payment.id}
                                className="rounded-3xl border border-white/10 bg-white/[0.04] p-5 backdrop-blur-xl transition hover:border-amber-300/20"
                            >
                                <div className="flex justify-between items-center">
                                    <div>
                                        <p className="font-bold">{payment.customerName}</p>
                                        <p className="text-xs text-white/50">
                                            {payment.date}
                                        </p>
                                    </div>

                                    <div className="text-right">
                                        <p className="font-bold text-amber-300">
                                            ₦{payment.amount.toLocaleString()}
                                        </p>
                                        <StatusBadge status={payment.status} />
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </SectionCard>
            </div>
        </DashboardShell>
    );
}