import { createClient } from "@/utils/supabase/server";
import ApprovalsList from "./ApprovalsList";
import { getUserProfile } from "@/lib/auth/getUserProfile";
import { redirect } from "next/navigation";
import DashboardShell from "@/components/dashboard/DashboardShell";
import SectionCard from "@/components/dashboard/SectionCard";
import StatCard from "@/components/dashboard/StatCard";
import StatusBadge from "@/components/dashboard/StatusBadge";
import { createInvoice, createTask, sendMessage } from "./actions";
import { UserCheck, Users, Briefcase, Wallet } from "lucide-react";

type ProfileRef = { full_name: string | null } | null;

type TaskRow = {
    id: string;
    title: string;
    status: string | null;
    scheduled_date: string | null;
    customer: ProfileRef;
    employee: ProfileRef;
};

type UploadRow = {
    id: string;
    task_title: string | null;
    image_url: string;
    employee: ProfileRef;
};

type PaymentRow = {
    id: string;
    amount: number;
    status: string;
    invoice_month: string | null;
    created_at: string;
    customer: ProfileRef;
};

type MessageRow = {
    id: string;
    subject: string;
    body: string;
    created_at: string;
    from_profile: ProfileRef;
    to_profile: ProfileRef;
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

    const customerDetailsByProfileId = Object.fromEntries(
        customers
            .filter((c) => c.profile_id)
            .map((c) => [c.profile_id as string, c])
    );

    const { data: employeesData } = await supabase
        .from("employees")
        .select("*")
        .order("created_at", { ascending: false });

    const employees = employeesData ?? [];

    const employeeDetailsByProfileId = Object.fromEntries(
        employees
            .filter((e) => e.profile_id)
            .map((e) => [e.profile_id as string, e])
    );

    const { data: unpaidPaymentsData } = await supabase
        .from("payments")
        .select("amount, status")
        .neq("status", "paid");

    const totalBalance = (unpaidPaymentsData ?? []).reduce(
        (sum, p) => sum + Number(p.amount ?? 0),
        0
    );

    const { data: directoryData } = await supabase
        .from("profiles")
        .select("id, full_name, role")
        .in("role", ["employee", "customer"])
        .eq("status", "approved")
        .order("full_name", { ascending: true });

    const directory = directoryData ?? [];
    const employeeOptions = directory.filter((p) => p.role === "employee");
    const customerOptions = directory.filter((p) => p.role === "customer");

    const { data: tasksData } = await supabase
        .from("tasks")
        .select(
            "id, title, status, scheduled_date, customer:profiles!tasks_customer_id_fkey(full_name), employee:profiles!tasks_employee_id_fkey(full_name)"
        )
        .order("created_at", { ascending: false })
        .limit(10);

    const tasks = (tasksData ?? []) as unknown as TaskRow[];

    const { data: uploadsData } = await supabase
        .from("uploads")
        .select(
            "id, task_title, image_url, employee:profiles!uploads_employee_id_fkey(full_name)"
        )
        .order("created_at", { ascending: false })
        .limit(6);

    const uploads = (uploadsData ?? []) as unknown as UploadRow[];

    const { data: paymentsData } = await supabase
        .from("payments")
        .select(
            "id, amount, status, invoice_month, created_at, customer:profiles!payments_customer_id_fkey(full_name)"
        )
        .order("created_at", { ascending: false })
        .limit(10);

    const payments = (paymentsData ?? []) as unknown as PaymentRow[];

    const { data: messagesData } = await supabase
        .from("messages")
        .select(
            "id, subject, body, created_at, from_profile:profiles!messages_from_profile_id_fkey(full_name), to_profile:profiles!messages_to_profile_id_fkey(full_name)"
        )
        .order("created_at", { ascending: false })
        .limit(10);

    const messages = (messagesData ?? []) as unknown as MessageRow[];

    return (
        <DashboardShell
            role="admin"
            title="Admin Dashboard"
            subtitle="Manage operations, approvals, customers, tasks, uploads, messages, and payments."
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
                    value={String(employeeOptions.length)}
                    helper="Approved field staff and supervisors"
                />
                <StatCard
                    icon={Wallet}
                    label="Outstanding balance"
                    value={`₦${totalBalance.toLocaleString()}`}
                    helper="Total unpaid customer balances"
                />
            </div>

            <div className="grid gap-6 2xl:grid-cols-2">
                <SectionCard
                    id="approvals"
                    title="Signup approvals"
                    description="Approve or decline new users."
                >
                    <ApprovalsList
                        users={pendingUsers ?? []}
                        customerDetailsByProfileId={customerDetailsByProfileId}
                        employeeDetailsByProfileId={employeeDetailsByProfileId}
                    />
                </SectionCard>

                <SectionCard
                    id="tasks"
                    title="Task progress"
                    description="Live overview of assigned service tasks."
                >
                    <div className="space-y-4">
                        {tasks.length === 0 ? (
                            <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5 text-sm text-white/60">
                                No tasks yet.
                            </div>
                        ) : (
                            tasks.map((task) => (
                                <div
                                    key={task.id}
                                    className="rounded-3xl border border-white/10 bg-white/[0.03] p-5 transition hover:border-white/20"
                                >
                                    <div className="flex flex-col gap-3 md:flex-row md:justify-between">
                                        <div>
                                            <p className="font-bold text-lg">{task.title}</p>
                                            <p className="text-sm text-white/60">
                                                {task.customer?.full_name ?? "Unassigned customer"} •{" "}
                                                {task.employee?.full_name ?? "Unassigned employee"}
                                            </p>
                                            <p className="text-xs text-white/40 mt-2">
                                                {formatDate(task.scheduled_date)}
                                            </p>
                                        </div>

                                        <StatusBadge status={task.status ?? "pending"} />
                                    </div>
                                </div>
                            ))
                        )}

                        <form
                            action={createTask}
                            className="space-y-3 rounded-3xl border border-white/10 bg-black/20 p-5"
                        >
                            <p className="text-xs uppercase tracking-[0.2em] text-white/45">
                                Assign new task
                            </p>

                            <input
                                name="title"
                                placeholder="Task title"
                                required
                                className="h-11 w-full rounded-xl border border-white/10 bg-white/8 px-3 text-sm text-white outline-none placeholder:text-white/30 focus:border-amber-300/50"
                            />

                            <div className="grid gap-3 sm:grid-cols-2">
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

                                <select
                                    name="employeeId"
                                    required
                                    defaultValue=""
                                    className="h-11 w-full rounded-xl border border-white/10 bg-[#141518] px-3 text-sm text-white outline-none"
                                >
                                    <option value="" disabled>
                                        Select employee
                                    </option>
                                    {employeeOptions.map((e) => (
                                        <option key={e.id} value={e.id}>
                                            {e.full_name}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div className="grid gap-3 sm:grid-cols-3">
                                <input
                                    type="date"
                                    name="scheduledDate"
                                    className="h-11 w-full rounded-xl border border-white/10 bg-white/8 px-3 text-sm text-white outline-none"
                                />
                                <input
                                    name="zone"
                                    placeholder="Zone"
                                    className="h-11 w-full rounded-xl border border-white/10 bg-white/8 px-3 text-sm text-white outline-none placeholder:text-white/30"
                                />
                                <select
                                    name="priority"
                                    defaultValue="low"
                                    className="h-11 w-full rounded-xl border border-white/10 bg-[#141518] px-3 text-sm text-white outline-none"
                                >
                                    <option value="low">Low</option>
                                    <option value="medium">Medium</option>
                                    <option value="high">High</option>
                                </select>
                            </div>

                            <button
                                type="submit"
                                className="w-full rounded-2xl bg-amber-400 px-4 py-2.5 font-bold text-black transition hover:bg-amber-300"
                            >
                                Assign Task
                            </button>
                        </form>
                    </div>
                </SectionCard>
            </div>

            <div className="grid gap-6 2xl:grid-cols-2">
                <SectionCard
                    id="customers"
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
                                    className="border-t border-white/5 hover:bg-white/[0.03] transition"
                                >
                                    <td className="py-4">
                                        <p className="font-semibold">{customer.full_name}</p>
                                        <p className="text-white/50 text-xs">
                                            {customer.address}
                                        </p>
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

                <SectionCard
                    id="uploads"
                    title="Task uploads"
                    description="Photos uploaded by employees."
                >
                    <div className="grid gap-4 md:grid-cols-2">
                        {uploads.length === 0 ? (
                            <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5 text-sm text-white/60">
                                No uploads yet.
                            </div>
                        ) : (
                            uploads.map((upload) => (
                                <div
                                    key={upload.id}
                                    className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03] transition hover:border-white/20"
                                >
                                    <img
                                        src={upload.image_url}
                                        alt={upload.task_title ?? "Task upload"}
                                        className="h-44 w-full object-cover transition duration-700 hover:scale-105"
                                    />

                                    <div className="p-4">
                                        <p className="font-bold">{upload.task_title ?? "Task upload"}</p>
                                        <p className="text-sm text-white/60">
                                            {upload.employee?.full_name ?? "Unknown employee"}
                                        </p>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </SectionCard>
            </div>

            <div className="grid gap-6 2xl:grid-cols-2">
                <SectionCard id="messages" title="Messages" description="Recent communication">
                    <div className="space-y-4">
                        {messages.length === 0 ? (
                            <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5 text-sm text-white/60">
                                No messages yet.
                            </div>
                        ) : (
                            messages.map((message) => (
                                <div
                                    key={message.id}
                                    className="rounded-3xl border border-white/10 bg-white/[0.03] p-5 transition hover:border-white/20"
                                >
                                    <p className="font-bold">{message.subject}</p>
                                    <p className="text-sm text-white/50 mt-1">
                                        {message.from_profile?.full_name ?? "Admin"} →{" "}
                                        {message.to_profile?.full_name ?? "Unknown recipient"}
                                    </p>
                                    <p className="text-sm text-white/70 mt-3">{message.body}</p>
                                </div>
                            ))
                        )}

                        <form
                            action={sendMessage}
                            className="space-y-3 rounded-3xl border border-white/10 bg-black/20 p-5"
                        >
                            <p className="text-xs uppercase tracking-[0.2em] text-white/45">
                                Send message
                            </p>

                            <select
                                name="toProfileId"
                                required
                                defaultValue=""
                                className="h-11 w-full rounded-xl border border-white/10 bg-[#141518] px-3 text-sm text-white outline-none"
                            >
                                <option value="" disabled>
                                    Select recipient
                                </option>
                                {directory.map((p) => (
                                    <option key={p.id} value={p.id}>
                                        {p.full_name} ({p.role})
                                    </option>
                                ))}
                            </select>

                            <input
                                name="subject"
                                placeholder="Subject"
                                required
                                className="h-11 w-full rounded-xl border border-white/10 bg-white/8 px-3 text-sm text-white outline-none placeholder:text-white/30"
                            />

                            <textarea
                                name="body"
                                placeholder="Message"
                                required
                                className="min-h-[90px] w-full rounded-xl border border-white/10 bg-white/8 px-3 py-2 text-sm text-white outline-none placeholder:text-white/30"
                            />

                            <button
                                type="submit"
                                className="w-full rounded-2xl bg-amber-400 px-4 py-2.5 font-bold text-black transition hover:bg-amber-300"
                            >
                                Send Message
                            </button>
                        </form>
                    </div>
                </SectionCard>

                <SectionCard id="payments" title="Payments" description="Recent transactions">
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
            </div>
        </DashboardShell>
    );
}
