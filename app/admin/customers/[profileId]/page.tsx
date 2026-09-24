import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireDashboardAccess } from "@/lib/dashboard/requireDashboardAccess";
import { isFullAdmin } from "@/lib/auth/roles";
import CustomerAccountControls from "@/components/dashboard/CustomerAccountControls";
import {
    generateCustomerBilling,
    saveVacancies,
    updateCustomerDetails,
} from "../../actions";
import { formatDate, naira } from "@/lib/customer/billing";
import { describeFacilities, facilityCount } from "@/lib/customer/facilities";
import { describeFrequency, parseFrequency } from "@/lib/billing/schedule";
import DashboardShell from "@/components/dashboard/DashboardShell";
import SectionCard from "@/components/dashboard/SectionCard";
import StatusBadge from "@/components/dashboard/StatusBadge";
import CustomerDetailsForm from "@/components/dashboard/CustomerDetailsForm";
import VacancyForm from "@/components/dashboard/VacancyForm";
import BillingActionButton from "@/components/dashboard/BillingActionButton";

function DetailList({ items }: { items: { label: string; value: React.ReactNode }[] }) {
    return (
        <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
            {items.map((item) => (
                <div key={item.label}>
                    <dt className="text-xs uppercase tracking-[0.12em] text-white/40">{item.label}</dt>
                    <dd className="mt-0.5 break-words text-white/90">{item.value || <span className="text-white/30">Not provided</span>}</dd>
                </div>
            ))}
        </dl>
    );
}

export default async function AdminCustomerDetailPage({
                                                          params,
                                                      }: {
    params: Promise<{ profileId: string }>;
}) {
    const { profileId } = await params;
    const { profile, supabase, unreadCount } = await requireDashboardAccess("admin");

    const { data: customer } = await supabase.from("customers").select("*").eq("profile_id", profileId).single();
    if (!customer) notFound();

    const [{ data: account }, { data: unit }, { data: invoices }, { data: tasks }, { count: photoCount }] =
        await Promise.all([
            supabase.from("profiles").select("status, created_at").eq("id", profileId).single(),
            customer.unit_id
                ? supabase
                    .from("units")
                    .select("label, estate:profiles!units_estate_profile_id_fkey(full_name)")
                    .eq("id", customer.unit_id)
                    .single()
                : Promise.resolve({ data: null }),
            supabase
                .from("payments")
                .select("id, amount, arrears, status, invoice_month, created_at")
                .eq("customer_id", profileId)
                .order("created_at", { ascending: false })
                .limit(6),
            supabase
                .from("tasks")
                .select("id, title, status, scheduled_date")
                .eq("customer_id", profileId)
                .order("scheduled_date", { ascending: false })
                .limit(8),
            supabase.from("uploads").select("id", { count: "exact", head: true }).eq("customer_id", profileId),
        ]);

    const { counted, notes } = describeFacilities(customer.facility_details);
    const vacancyList = describeFacilities(customer.vacancies).counted;
    const frequency = parseFrequency(customer.preferred_pickup_frequency);
    const tenantUnit = unit as unknown as { label: string; estate: { full_name: string | null } | null } | null;

    return (
        <DashboardShell
            role="admin"
            profileId={profile.id}
            title={customer.full_name}
            subtitle="Everything on file for this customer."
            unreadCount={unreadCount}
        >
            <div className="space-y-6">
                <Link
                    href="/admin/customers"
                    className="inline-flex items-center gap-2 text-sm text-white/55 transition hover:text-white"
                >
                    <ArrowLeft className="h-4 w-4" />
                    All customers
                </Link>

                <SectionCard title="Account" description="Status, codes and how they joined.">
                    <div className="mb-4 flex flex-wrap items-center gap-3">
                        <StatusBadge status={customer.status} />
                        {account?.status && <StatusBadge status={account.status} />}
                        {customer.is_estate && (
                            <span className="rounded-full bg-sky-400/10 px-3 py-1 text-xs font-bold uppercase tracking-wide text-sky-300">
                                Estate
                            </span>
                        )}
                        {tenantUnit && (
                            <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-bold uppercase tracking-wide text-white/70">
                                Tenant: {tenantUnit.estate?.full_name ?? "Estate"} / {tenantUnit.label}
                            </span>
                        )}
                    </div>
                    <DetailList
                        items={[
                            { label: "Account code", value: customer.account_code },
                            { label: "Property code", value: customer.property_code },
                            { label: "Joined", value: formatDate(account?.created_at ?? customer.created_at) },
                            {
                                label: "Registration fee",
                                value: tenantUnit ? "Waived (tenant)" : customer.registration_fee_paid
                                    ? `Paid ${formatDate(customer.registration_fee_paid_at)}`
                                    : "Not paid yet",
                            },
                            { label: "Last serviced", value: formatDate(customer.last_serviced, "Never") },
                            { label: "Photos on file", value: String(photoCount ?? 0) },
                        ]}
                    />
                </SectionCard>

                {isFullAdmin(profile) && (
                    <SectionCard title="Suspend or delete" description="Pause this customer, or remove them completely.">
                        <CustomerAccountControls
                            profileId={profileId}
                            fullName={customer.full_name}
                            suspended={customer.status === "inactive"}
                        />
                    </SectionCard>
                )}

                <SectionCard title="Account holder" description="Contact details from their setup form.">
                    <DetailList
                        items={[
                            { label: "Name", value: customer.full_name },
                            { label: "Email", value: customer.email },
                            { label: "Phone", value: customer.phone },
                            { label: "WhatsApp", value: customer.whatsapp_number },
                        ]}
                    />
                </SectionCard>

                <SectionCard title="Property" description="Where the service takes place and what's on the property.">
                    <DetailList
                        items={[
                            { label: "Address", value: customer.address },
                            { label: "L.G.A", value: customer.lga },
                            { label: "State", value: customer.state },
                            { label: "Landmark", value: customer.landmark },
                            { label: "Property type", value: <span className="capitalize">{customer.property_type}</span> },
                            { label: "Property class", value: customer.property_class },
                        ]}
                    />

                    <div className="mt-5 border-t border-white/10 pt-4">
                        <p className="text-xs uppercase tracking-[0.12em] text-white/40">Facilities</p>
                        {counted.length === 0 && notes.length === 0 ? (
                            <p className="mt-2 text-sm text-white/40">None recorded.</p>
                        ) : (
                            <div className="mt-2 flex flex-wrap gap-2">
                                {counted.map((f) => (
                                    <span key={f.label} className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-sm">
                                        {f.label}: <strong>{f.count}</strong>
                                    </span>
                                ))}
                            </div>
                        )}
                        {notes.map((n) => (
                            <p key={n.label} className="mt-2 text-sm text-white/65">
                                <span className="text-white/40">{n.label}:</span> {n.text}
                            </p>
                        ))}
                    </div>
                </SectionCard>

                <SectionCard title="Service preferences" description="Used to build their pickup schedule.">
                    <DetailList
                        items={[
                            { label: "Pickup frequency (as entered)", value: customer.preferred_pickup_frequency },
                            { label: "Read as", value: describeFrequency(frequency) },
                            { label: "Waste type", value: customer.waste_type },
                            { label: "Special notes", value: customer.special_notes },
                        ]}
                    />
                </SectionCard>

                <SectionCard title="Edit customer" description="Correct any detail. Unit counts drive the monthly invoice.">
                    <CustomerDetailsForm
                        action={updateCustomerDetails}
                        profileId={profileId}
                        defaults={customer}
                    />
                </SectionCard>

                <SectionCard
                    id="vacancies"
                    title="Vacant units"
                    description="The landlord tells us when a tenant moves out. Vacant units are left off the invoice."
                >
                    {vacancyList.length > 0 && (
                        <div className="mb-4 flex flex-wrap gap-2">
                            {vacancyList.map((v) => (
                                <span key={v.label} className="rounded-full border border-amber-300/25 bg-amber-400/10 px-3 py-1 text-sm text-amber-200">
                                    {v.label}: {v.count} vacant (of {facilityCount(customer.facility_details, DOMESTIC_KEY[v.label] ?? "")})
                                </span>
                            ))}
                        </div>
                    )}
                    <VacancyForm
                        action={saveVacancies}
                        profileId={profileId}
                        facilityDetails={customer.facility_details}
                        vacancies={customer.vacancies}
                        note={customer.vacancy_note}
                    />
                </SectionCard>

                <SectionCard title="Schedule and invoices" description="Generated from the details above. Both stay editable.">
                    <div className="mb-5 flex flex-wrap gap-3">
                        <BillingActionButton run={generateCustomerBilling.bind(null, profileId, "schedule")}>
                            Extend schedule (next 4 weeks)
                        </BillingActionButton>
                        <BillingActionButton run={generateCustomerBilling.bind(null, profileId, "invoice")} variant="secondary">
                            Generate this month&apos;s invoice
                        </BillingActionButton>
                    </div>

                    <div className="grid gap-6 lg:grid-cols-2">
                        <div>
                            <p className="mb-2 text-xs uppercase tracking-[0.12em] text-white/40">Recent invoices</p>
                            {(invoices ?? []).length === 0 ? (
                                <p className="text-sm text-white/40">No invoices yet.</p>
                            ) : (
                                <div className="space-y-2">
                                    {(invoices ?? []).map((invoice) => (
                                        <div key={invoice.id} className="flex items-center justify-between rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm">
                                            <span>{invoice.invoice_month ?? formatDate(invoice.created_at)}</span>
                                            <span className="flex items-center gap-3">
                                                <span className="font-semibold text-amber-300">
                                                    {naira(Number(invoice.amount ?? 0) + Number(invoice.arrears ?? 0))}
                                                </span>
                                                <StatusBadge status={invoice.status ?? "pending"} />
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            )}
                            <Link href="/admin/payments" className="mt-3 inline-block text-xs text-amber-300 hover:text-amber-200">
                                Edit invoices on the Payments page
                            </Link>
                        </div>

                        <div>
                            <p className="mb-2 text-xs uppercase tracking-[0.12em] text-white/40">Schedule</p>
                            {(tasks ?? []).length === 0 ? (
                                <p className="text-sm text-white/40">No pickups scheduled.</p>
                            ) : (
                                <div className="space-y-2">
                                    {(tasks ?? []).map((task) => (
                                        <div key={task.id} className="flex items-center justify-between rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm">
                                            <span>{formatDate(task.scheduled_date, "Date to be confirmed")}</span>
                                            <StatusBadge status={(task.status ?? "pending").replace(" ", "_")} />
                                        </div>
                                    ))}
                                </div>
                            )}
                            <Link href="/admin/tasks" className="mt-3 inline-block text-xs text-amber-300 hover:text-amber-200">
                                Assign staff and edit dates on the Tasks page
                            </Link>
                        </div>
                    </div>
                </SectionCard>
            </div>
        </DashboardShell>
    );
}

const DOMESTIC_KEY: Record<string, string> = {
    Duplex: "duplexCount",
    Flats: "flatsCount",
    "Mini flats": "miniFlatsCount",
    Bungalows: "bungalowCount",
    Terraces: "terraceCount",
    Shops: "shopsCount",
};
