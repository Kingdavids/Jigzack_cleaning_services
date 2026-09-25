import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireDashboardAccess } from "@/lib/dashboard/requireDashboardAccess";
import { isFullAdmin, isOwner } from "@/lib/auth/roles";
import CustomerAccountControls from "@/components/dashboard/CustomerAccountControls";
import RegistrationFeeControls from "@/components/dashboard/RegistrationFeeControls";
import { PAYMENT_RECEIPT_BUCKET } from "@/lib/bank-details";
import { daysLeft } from "@/lib/admin/deletedCustomers";
import {
    generateCustomerBilling,
    saveVacancies,
    updateCustomerDetails,
} from "../../actions";
import { formatDate, naira } from "@/lib/customer/billing";
import { describeFacilities, facilityCount } from "@/lib/customer/facilities";
import { customerFrequency, describeFrequency } from "@/lib/billing/schedule";
import DashboardShell from "@/components/dashboard/DashboardShell";
import SectionCard from "@/components/dashboard/SectionCard";
import StatusBadge from "@/components/dashboard/StatusBadge";
import CustomerDetailsForm from "@/components/dashboard/CustomerDetailsForm";
import VacancyForm from "@/components/dashboard/VacancyForm";
import BillingActionButton from "@/components/dashboard/BillingActionButton";
import MonthlyChargeControl from "@/components/dashboard/MonthlyChargeControl";
import PrepaymentForm from "@/components/dashboard/PrepaymentForm";
import { loadPrepayments, prepaidUntil } from "@/lib/billing/prepaid";
import { buildLineItems, itemsTotal } from "@/lib/billing/pricing";
import { amountPaid, balanceOf, invoiceTotal } from "@/lib/billing/balance";

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

    // Everything for this page is fetched in one parallel batch. The unit (only
    // tenants have one) and the private receipt link depend on the customer row,
    // so they follow straight after, together.
    const [{ data: customer }, { data: account }, { data: invoices }, { data: tasks }, { count: photoCount }] =
        await Promise.all([
            supabase.from("customers").select("*").eq("profile_id", profileId).single(),
            supabase.from("profiles").select("status, created_at").eq("id", profileId).single(),
            // Every invoice, so the totals add up. "*" also brings the part payment column.
            supabase.from("payments").select("*").eq("customer_id", profileId).order("created_at", { ascending: false }).limit(500),
            supabase
                .from("tasks")
                .select("id, title, status, scheduled_date")
                .eq("customer_id", profileId)
                .order("scheduled_date", { ascending: false })
                .limit(8),
            supabase.from("uploads").select("id", { count: "exact", head: true }).eq("customer_id", profileId),
        ]);

    if (!customer) notFound();

    // A receipt the customer uploaded lives in a private bucket, so it is opened
    // through a link that expires after an hour.
    const feeReceiptPath = (customer as { registration_fee_receipt_path?: string | null }).registration_fee_receipt_path ?? null;

    const [{ data: unit }, receiptSigned] = await Promise.all([
        customer.unit_id
            ? supabase
                .from("units")
                .select("label, estate:profiles!units_estate_profile_id_fkey(full_name)")
                .eq("id", customer.unit_id)
                .single()
            : Promise.resolve({ data: null }),
        feeReceiptPath
            ? supabase.storage.from(PAYMENT_RECEIPT_BUCKET).createSignedUrl(feeReceiptPath, 3600)
            : Promise.resolve({ data: null }),
    ]);

    const feeReceiptUrl = receiptSigned.data?.signedUrl ?? null;
    const feeSubmittedAt = (customer as { registration_fee_submitted_at?: string | null }).registration_fee_submitted_at ?? null;

    const { counted, notes } = describeFacilities(customer.facility_details);
    const vacancyList = describeFacilities(customer.vacancies).counted;
    const frequency = customerFrequency(customer);
    const tenantUnit = unit as unknown as { label: string; estate: { full_name: string | null } | null } | null;

    // What monthly invoices use: the amount an admin set, or else the per-unit prices.
    const calculatedMonthly = itemsTotal(buildLineItems(customer.facility_details, customer.vacancies));
    const customRate = Number((customer as { monthly_rate?: number | string | null }).monthly_rate ?? 0);
    const hasCustomRate = Number.isFinite(customRate) && customRate > 0;
    const monthlyCharge = hasCustomRate ? customRate : calculatedMonthly;

    const allInvoices = invoices ?? [];

    // Months paid for in advance. Empty before the prepayments SQL has been run.
    const prepayments = await loadPrepayments(supabase, profileId);
    const paidUpTo = prepaidUntil(prepayments);
    const billed = allInvoices.reduce((sum, row) => sum + invoiceTotal(row), 0);
    const received = allInvoices.reduce((sum, row) => sum + amountPaid(row), 0);
    const owed = allInvoices.reduce((sum, row) => sum + balanceOf(row), 0);

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

                {!tenantUnit && (
                    <SectionCard title="Registration fee" description="The one-off fee, paid by bank transfer.">
                        {isFullAdmin(profile) ? (
                            <RegistrationFeeControls
                                profileId={profileId}
                                paid={Boolean(customer.registration_fee_paid)}
                                reported={Boolean(feeSubmittedAt)}
                                receiptUrl={feeReceiptUrl}
                                reportedNote={(customer as { registration_fee_note?: string | null }).registration_fee_note ?? null}
                                reportedAt={feeSubmittedAt ? formatDate(feeSubmittedAt) : null}
                                paidText={`Paid ${formatDate(customer.registration_fee_paid_at)}${customer.registration_fee_reference ? `. ${customer.registration_fee_reference}` : ""}`}
                            />
                        ) : (
                            <p className="text-sm text-white/70">
                                {customer.registration_fee_paid
                                    ? `Paid ${formatDate(customer.registration_fee_paid_at)}`
                                    : feeSubmittedAt
                                        ? "Reported as paid, waiting for an admin to confirm."
                                        : "Not paid yet."}
                            </p>
                        )}
                    </SectionCard>
                )}

                {isFullAdmin(profile) && (
                    <SectionCard title="Suspend or delete" description="Pause this customer, or move them to Recently deleted.">
                        <CustomerAccountControls
                            profileId={profileId}
                            fullName={customer.full_name}
                            suspended={customer.status === "inactive"}
                            deleted={customer.status === "deleted"}
                            daysLeft={daysLeft((customer as { deleted_at?: string | null }).deleted_at ?? null)}
                            isOwner={isOwner(profile)}
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

                {!tenantUnit && (
                    <SectionCard
                        title="Billing"
                        description="What this customer is charged each month, and what they have paid so far."
                    >
                        <div className="mb-5 grid gap-3 sm:grid-cols-3">
                            {[
                                { label: "Total billed", value: naira(billed), tone: "text-white" },
                                { label: "Paid", value: naira(received), tone: "text-emerald-300" },
                                { label: "Still owed", value: naira(owed), tone: "text-amber-300" },
                            ].map((item) => (
                                <div key={item.label} className="rounded-xl border border-white/10 bg-black/20 px-4 py-3">
                                    <p className="text-xs uppercase tracking-[0.15em] text-white/40">{item.label}</p>
                                    <p className={`mt-1 text-xl font-bold ${item.tone}`}>{item.value}</p>
                                </div>
                            ))}
                        </div>

                        {isFullAdmin(profile) ? (
                            <MonthlyChargeControl
                                profileId={profileId}
                                customName={customer.full_name ?? "this customer"}
                                current={monthlyCharge}
                                calculated={calculatedMonthly}
                                custom={hasCustomRate}
                            />
                        ) : (
                            <p className="text-sm text-white/70">
                                Monthly charge: <span className="font-semibold text-amber-300">{monthlyCharge > 0 ? naira(monthlyCharge) : "Not set"}</span>
                            </p>
                        )}
                    </SectionCard>
                )}

                {!tenantUnit && (
                    <SectionCard
                        title="Advance payments"
                        collapsible
                        badge={
                            paidUpTo ? (
                                <span className="rounded-full border border-emerald-400/25 bg-emerald-400/10 px-3 py-1 text-xs font-bold text-emerald-300">
                                    Paid until {paidUpTo}
                                </span>
                            ) : prepayments.length > 0 ? (
                                <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-bold text-white/60">{prepayments.length} recorded</span>
                            ) : null
                        }
                        description={
                            paidUpTo
                                ? `Paid in advance until ${paidUpTo}. No invoices are made for the months covered.`
                                : "For a customer who paid upfront for a number of months. No invoices are made for the months it covers."
                        }
                    >
                        <PrepaymentForm
                            profileId={profileId}
                            customName={customer.full_name ?? "this customer"}
                            monthlyCharge={monthlyCharge}
                            canRecord={isFullAdmin(profile)}
                            payments={prepayments.map((p) => ({
                                id: p.id,
                                months: p.months,
                                amount: Number(p.amount),
                                span: `${p.covered_months[0]}${p.covered_months.length > 1 ? ` to ${p.covered_months[p.covered_months.length - 1]}` : ""}`,
                                paidOn: formatDate(p.paid_at),
                                method: p.method,
                            }))}
                        />
                    </SectionCard>
                )}

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
                            {allInvoices.length === 0 ? (
                                <p className="text-sm text-white/40">No invoices yet.</p>
                            ) : (
                                <div className="space-y-2">
                                    {allInvoices.slice(0, 6).map((invoice) => {
                                        const partPaid = invoice.status !== "paid" && amountPaid(invoice) > 0;

                                        return (
                                            <div key={invoice.id} className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm">
                                                <span>
                                                    {invoice.invoice_month ?? formatDate(invoice.created_at)}
                                                    <Link
                                                        href={`/admin/invoices/${invoice.id}`}
                                                        className="ml-3 text-xs font-semibold text-amber-300 underline underline-offset-2"
                                                    >
                                                        Preview
                                                    </Link>
                                                </span>
                                                <span className="flex items-center gap-3">
                                                    <span className="font-semibold text-amber-300">
                                                        {naira(partPaid ? balanceOf(invoice) : invoiceTotal(invoice))}
                                                    </span>
                                                    <StatusBadge status={partPaid ? "part_paid" : invoice.status ?? "pending"} />
                                                </span>
                                            </div>
                                        );
                                    })}
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
