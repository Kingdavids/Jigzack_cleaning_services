import Link from "next/link";
import { CalendarCheck, CalendarClock, CreditCard, Repeat } from "lucide-react";
import { requireDashboardAccess } from "@/lib/dashboard/requireDashboardAccess";
import { formatDate, naira, resolveBilling } from "@/lib/customer/billing";
import { balanceOf, loadWithPaid } from "@/lib/billing/balance";
import { taskDisplayStatus } from "@/lib/tasks";
import { describeFacilities } from "@/lib/customer/facilities";
import { describeFrequency, parseFrequency, todayKey } from "@/lib/billing/schedule";
import DashboardShell from "@/components/dashboard/DashboardShell";
import StatCard from "@/components/dashboard/StatCard";
import SectionCard from "@/components/dashboard/SectionCard";
import StatusBadge from "@/components/dashboard/StatusBadge";

type TaskRow = {
    id: string;
    title: string | null;
    status: string | null;
    scheduled_date: string | null;
    zone: string | null;
    employee_id?: string | null;
    completed_at: string | null;
};

function DetailList({ items }: { items: { label: string; value: React.ReactNode }[] }) {
    return (
        <dl className="grid gap-x-6 gap-y-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
            {items.map((item) => (
                <div key={item.label}>
                    <dt className="text-xs uppercase tracking-[0.12em] text-white/40">{item.label}</dt>
                    <dd className="mt-0.5 break-words text-white/90">
                        {item.value || <span className="text-white/30">Not provided</span>}
                    </dd>
                </div>
            ))}
        </dl>
    );
}

export default async function CustomerPage() {
    const { profile, supabase, unreadCount, customer } = await requireDashboardAccess("customer");
    const { billingProfileId, billingCustomer, isTenant } = await resolveBilling(supabase, profile.id, customer);

    const [tasks, invoices] = await Promise.all([
        isTenant
            ? Promise.resolve([] as TaskRow[])
            : supabase
                .from("tasks")
                .select("id, title, status, scheduled_date, zone, employee_id, completed_at")
                .eq("customer_id", profile.id)
                .order("scheduled_date", { ascending: true })
                .limit(200)
                .then((r) => (r.data ?? []) as TaskRow[]),
        loadWithPaid(
            (select) => supabase.from("payments").select(select).eq("customer_id", billingProfileId).limit(200),
            "amount, arrears, status"
        ) as Promise<{ amount: number | string | null; arrears: number | string | null; status: string | null; amount_paid?: number | string | null }[]>,
    ]);

    const today = todayKey();

    const completed = tasks
        .filter((t) => (t.status ?? "").toLowerCase() === "completed")
        .sort((a, b) => (b.completed_at ?? b.scheduled_date ?? "").localeCompare(a.completed_at ?? a.scheduled_date ?? ""));

    const upcoming = tasks
        .filter((t) => !["completed", "declined"].includes((t.status ?? "pending").toLowerCase()))
        .sort((a, b) => (a.scheduled_date ?? "9999").localeCompare(b.scheduled_date ?? "9999"));

    const nextPickups = upcoming.filter((t) => t.scheduled_date && t.scheduled_date >= today).slice(0, 3);
    const lastService = completed[0] ?? null;

    // What is left to pay across all invoices, after any part payments.
    const outstanding = invoices.reduce((sum, i) => sum + balanceOf(i), 0);

    const { counted, notes } = describeFacilities(customer?.facility_details);
    const vacancies = describeFacilities(customer?.vacancies).counted;
    const frequency = parseFrequency(customer?.preferred_pickup_frequency);

    return (
        <DashboardShell
            role="customer"
            profileId={profile.id}
            title="Customer Dashboard"
            subtitle={`Welcome back, ${profile.full_name ?? customer?.full_name ?? "there"}.`}
            unreadCount={unreadCount}
        >
            <div className="space-y-6">
                {isTenant && (
                    <div className="rounded-xl border border-sky-400/20 bg-sky-400/[0.06] px-4 py-3 text-sm text-sky-200">
                        You&apos;re set up as a tenant. Use Messages to raise a complaint, and Payments to view or
                        download your estate&apos;s shared utility bill.
                    </div>
                )}

                {!isTenant && String(customer?.property_type ?? "").toLowerCase() === "commercial" && invoices.length === 0 && (
                    <div className="rounded-xl border border-amber-300/25 bg-amber-300/[0.06] px-4 py-3 text-sm text-amber-100">
                        <p className="font-semibold">Your site will be inspected before we quote</p>
                        <p className="mt-1 text-amber-100/80">
                            We survey every commercial facility first, because the right price depends on your waste. Our team will contact you to
                            arrange the visit. Use Messages if you would like to suggest a time.
                        </p>
                    </div>
                )}

                <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
                    {!isTenant && (
                        <>
                            <StatCard
                                icon={CalendarClock}
                                label="Next Pickup"
                                value={nextPickups[0]?.scheduled_date ? formatDate(nextPickups[0].scheduled_date) : "Not scheduled"}
                                helper={nextPickups[0]?.zone ?? "Nearest upcoming service date"}
                            />
                            <StatCard
                                icon={CalendarCheck}
                                label="Last Serviced"
                                value={
                                    lastService
                                        ? formatDate(lastService.completed_at ?? lastService.scheduled_date)
                                        : customer?.last_serviced
                                            ? formatDate(customer.last_serviced)
                                            : "Not yet"
                                }
                                helper={`${completed.length} services completed`}
                            />
                            <StatCard
                                icon={Repeat}
                                label="Pickup Plan"
                                value={customer?.preferred_pickup_frequency ?? "Not set"}
                                helper={describeFrequency(frequency)}
                            />
                        </>
                    )}
                    <Link href="/customer/payments" className="block">
                        <StatCard
                            icon={CreditCard}
                            label="Outstanding Balance"
                            value={naira(outstanding)}
                            helper={outstanding > 0 ? "Tap to view invoices" : "You're all paid up"}
                        />
                    </Link>
                </div>

                <SectionCard
                    id="details"
                    title="Your details"
                    description={
                        isTenant
                            ? "The details on your account."
                            : "What we have on file for your account and property. Contact us if anything needs correcting."
                    }
                >
                    <div className="space-y-6">
                        <div>
                            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-amber-300">Account holder</p>
                            <DetailList
                                items={[
                                    { label: "Name", value: customer?.full_name ?? profile.full_name },
                                    { label: "Email", value: customer?.email ?? profile.email },
                                    { label: "Phone", value: customer?.phone },
                                    { label: "WhatsApp", value: customer?.whatsapp_number },
                                ]}
                            />
                        </div>

                        {!isTenant && customer && (
                            <>
                                <div className="border-t border-white/10 pt-5">
                                    <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-amber-300">Property</p>
                                    <DetailList
                                        items={[
                                            { label: "Address", value: customer.address },
                                            { label: "L.G.A", value: customer.lga },
                                            { label: "State", value: customer.state },
                                            { label: "Landmark", value: customer.landmark },
                                            { label: "Property type", value: <span className="capitalize">{customer.property_type}</span> },
                                            { label: "Property class", value: customer.property_class },
                                            { label: "Account code", value: customer.account_code },
                                            { label: "Property code", value: customer.property_code },
                                        ]}
                                    />

                                    {(counted.length > 0 || notes.length > 0) && (
                                        <div className="mt-4">
                                            <p className="text-xs uppercase tracking-[0.12em] text-white/40">Units on the property</p>
                                            <div className="mt-2 flex flex-wrap gap-2">
                                                {counted.map((f) => (
                                                    <span key={f.label} className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-sm">
                                                        {f.label}: <strong>{f.count}</strong>
                                                    </span>
                                                ))}
                                            </div>
                                            {notes.map((n) => (
                                                <p key={n.label} className="mt-2 text-sm text-white/60">
                                                    <span className="text-white/40">{n.label}:</span> {n.text}
                                                </p>
                                            ))}
                                        </div>
                                    )}

                                    {vacancies.length > 0 && (
                                        <div className="mt-4 rounded-xl border border-amber-300/20 bg-amber-400/[0.06] px-4 py-3 text-sm text-amber-100">
                                            Vacant units on record (not billed):{" "}
                                            {vacancies.map((v) => `${v.label} ${v.count}`).join(", ")}
                                            {customer.vacancy_note ? `. ${customer.vacancy_note}` : ""}
                                        </div>
                                    )}
                                </div>

                                <div className="border-t border-white/10 pt-5">
                                    <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-amber-300">Service</p>
                                    <DetailList
                                        items={[
                                            { label: "Pickup frequency", value: customer.preferred_pickup_frequency },
                                            { label: "Waste type", value: customer.waste_type },
                                            { label: "Special notes", value: customer.special_notes },
                                        ]}
                                    />
                                </div>
                            </>
                        )}

                        {isTenant && billingCustomer && (
                            <div className="border-t border-white/10 pt-5">
                                <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-amber-300">Your estate</p>
                                <DetailList
                                    items={[
                                        { label: "Estate", value: billingCustomer.full_name },
                                        { label: "Address", value: billingCustomer.address },
                                    ]}
                                />
                            </div>
                        )}
                    </div>
                </SectionCard>

                {!isTenant && (
                    <SectionCard
                        id="next"
                        title="Next pickups"
                        description="Your next few scheduled services."
                    >
                        {nextPickups.length === 0 ? (
                            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 text-sm text-white/60">
                                No upcoming pickups scheduled yet.
                            </div>
                        ) : (
                            <div className="space-y-2">
                                {nextPickups.map((task) => (
                                    <div
                                        key={task.id}
                                        className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4"
                                    >
                                        <div>
                                            <p className="font-semibold">{formatDate(task.scheduled_date, "Date to be confirmed")}</p>
                                            <p className="mt-0.5 text-sm text-white/50">
                                                {task.title ?? "Scheduled pickup"}
                                                {task.zone ? ` · ${task.zone}` : ""}
                                            </p>
                                        </div>
                                        <StatusBadge status={taskDisplayStatus(task.status, Boolean(task.employee_id))} />
                                    </div>
                                ))}
                            </div>
                        )}

                        <Link
                            href="/customer/schedule"
                            className="mt-4 block rounded-xl border border-white/10 bg-white/[0.03] py-3 text-center text-sm font-semibold text-white/60 transition hover:border-white/20 hover:bg-white/[0.06] hover:text-white"
                        >
                            View full schedule and service photos
                        </Link>
                    </SectionCard>
                )}
            </div>
        </DashboardShell>
    );
}
