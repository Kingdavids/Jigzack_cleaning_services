import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireDashboardAccess } from "@/lib/dashboard/requireDashboardAccess";
import { isFullAdmin, isOwner } from "@/lib/auth/roles";
import CustomerAccountControls from "@/components/dashboard/CustomerAccountControls";
import InvitePropertyButton from "@/components/dashboard/InvitePropertyButton";
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
import DiscountControl from "@/components/dashboard/DiscountControl";
import EmailCustomerForm from "@/components/dashboard/EmailCustomerForm";
import PrepaymentForm from "@/components/dashboard/PrepaymentForm";
import CustomerArrearsControl from "@/components/dashboard/CustomerArrearsControl";
import { loadCombinedOutstanding } from "@/lib/dashboard/propertyLinks";
import { loadPrepayments, prepaidUntil } from "@/lib/billing/prepaid";
import { chargeItems, discountInfo, loadEstateUnits, type BillableCustomer, type DiscountableCustomer } from "@/lib/billing/generate";
import { buildLineItems, itemsTotal, unitLineItems, unitsCoverBilling } from "@/lib/billing/pricing";
import { amountPaid, balanceOf, groupInstallments, invoiceTotal, loadInstallments } from "@/lib/billing/balance";
import { billingMonthLabel, INVOICE_DAY, monthLabel } from "@/lib/billing/pricing";
import AdminInvoiceCard, { type AdminInvoiceRow } from "@/components/dashboard/AdminInvoiceCard";
import LiveRefresh from "@/components/dashboard/LiveRefresh";

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

    // Other properties this customer manages from this one login, and whether
    // this account is itself a property someone else manages. Empty until
    // property-links-2026-09.sql has run.
    const [ownedLinksResult, linkedAsResult] = await Promise.all([
        supabase.from("property_links").select("linked_profile_id, created_at").eq("primary_profile_id", profileId),
        supabase.from("property_links").select("primary_profile_id").eq("linked_profile_id", profileId).maybeSingle(),
    ]);

    const ownedPropertyIds = (ownedLinksResult.data ?? []).map((row) => row.linked_profile_id as string);
    const ownedProperties = ownedPropertyIds.length
        ? ((await supabase.from("customers").select("profile_id, full_name, address, status").in("profile_id", ownedPropertyIds)).data ?? [])
        : [];
    const managedByProfileId = (linkedAsResult.data as { primary_profile_id?: string } | null)?.primary_profile_id ?? null;
    const managedByCustomer = managedByProfileId
        ? (await supabase.from("customers").select("full_name").eq("profile_id", managedByProfileId).maybeSingle()).data
        : null;

    // What this customer owes across this property and every other one linked
    // to their login, added together.
    const combinedOutstanding =
        ownedPropertyIds.length > 0 ? await loadCombinedOutstanding(supabase, [profileId, ...ownedPropertyIds]) : null;

    // An estate's own units, if it has any, so its total reflects their own
    // prices once every one of them has a type (see loadEstateUnits).
    const estateUnits = customer.is_estate ? await loadEstateUnits(supabase, profileId) : [];
    const unitPricingActive = customer.is_estate ? unitsCoverBilling(estateUnits) : false;

    // What monthly invoices use: the amount an admin set, or else each unit's
    // own price (for an estate with one), or the per-unit prices on the form.
    const calculatedMonthly = itemsTotal(
        unitPricingActive ? unitLineItems(estateUnits) : buildLineItems(customer.facility_details, customer.vacancies)
    );
    const customRate = Number((customer as { monthly_rate?: number | string | null }).monthly_rate ?? 0);
    const hasCustomRate = Number.isFinite(customRate) && customRate > 0;
    const monthlyCharge = hasCustomRate ? customRate : calculatedMonthly;

    // The discount an admin has given this customer, if any, always expressed
    // as a percentage even when it was set as a flat amount.
    const currentDiscount = discountInfo(customer as unknown as DiscountableCustomer, estateUnits);

    // What this month's invoice actually comes to once the discount is taken off,
    // the same figure chargeItems uses to generate it.
    const netMonthly = itemsTotal(chargeItems(customer as unknown as BillableCustomer, estateUnits));

    const allInvoices = (invoices ?? []) as AdminInvoiceRow[];

    // Shown as the same cards as the Payments page: everything still owed, then
    // the most recent settled ones.
    const RECENT_PAID = 6;
    const openInvoices = allInvoices.filter((i) => i.status !== "paid");
    const shownInvoices = [...openInvoices, ...allInvoices.filter((i) => i.status === "paid").slice(0, RECENT_PAID)];
    const hiddenPaid = allInvoices.length - shownInvoices.length;
    const installmentsByInvoice = groupInstallments(await loadInstallments(supabase, shownInvoices.map((i) => i.id)));

    // Receipts customers uploaded for a transfer are private, so each opens through a link that expires in an hour.
    const transferPaths = openInvoices.map((i) => i.transfer_receipt_path).filter((path): path is string => Boolean(path));
    const transferLinks = new Map(
        (transferPaths.length ? (await supabase.storage.from(PAYMENT_RECEIPT_BUCKET).createSignedUrls(transferPaths, 3600)).data ?? [] : []).map(
            (link) => [link.path, link.signedUrl]
        )
    );

    // The current invoice as it actually stands, which can differ from the
    // standard monthly charge once it has been edited. It changes on the 20th:
    // until then it is last month's. Falls back to their latest invoice.
    const currentInvoice = allInvoices.find((i) => i.invoice_month === billingMonthLabel()) ?? allInvoices[0] ?? null;
    // This calendar month's invoice, if it has been made yet (normally on the 20th).
    const calendarInvoice = allInvoices.find((i) => i.invoice_month === monthLabel()) ?? null;
    const beforeInvoiceDay = Number(new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Lagos" }).slice(8, 10)) < INVOICE_DAY;

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
            {/* Invoices edited or paid on the Payments page show up here straight away. */}
            <LiveRefresh tables={["payments", "tasks"]} />
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
                        {currentDiscount && (
                            <span className="rounded-full bg-emerald-400/10 px-3 py-1 text-xs font-bold uppercase tracking-wide text-emerald-300">
                                {currentDiscount.percent}% discount
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

                {isFullAdmin(profile) && !customer.is_estate && !customer.unit_id && (
                    <SectionCard
                        title="Multiple properties"
                        description="Let this customer manage more than one billed property from this same login."
                    >
                        {managedByCustomer ? (
                            <p className="text-sm text-white/60">
                                This is itself a property managed from{" "}
                                <span className="font-semibold text-white">{managedByCustomer.full_name}</span>&apos;s login.
                            </p>
                        ) : (
                            <div className="space-y-4">
                                {combinedOutstanding !== null && (
                                    <p className="text-sm text-white/70">
                                        Owed across this and {ownedProperties.length} other propert{ownedProperties.length === 1 ? "y" : "ies"}:{" "}
                                        <span className="font-bold text-amber-300">{naira(combinedOutstanding)}</span>
                                    </p>
                                )}
                                {ownedProperties.length > 0 && (
                                    <div className="space-y-2">
                                        {ownedProperties.map((p) => (
                                            <Link
                                                key={p.profile_id}
                                                href={`/admin/customers/${p.profile_id}`}
                                                className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm hover:border-white/20"
                                            >
                                                <span>{p.full_name}</span>
                                                <span className="text-xs text-white/40">{p.address || "No address yet"}</span>
                                            </Link>
                                        ))}
                                    </div>
                                )}
                                <InvitePropertyButton profileId={profileId} name={customer.full_name} />
                            </div>
                        )}
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

                {isFullAdmin(profile) && (
                    <SectionCard title="Email this customer" description="A one-off email to their inbox, separate from the in-app message thread.">
                        <EmailCustomerForm profileId={profileId} email={customer.email} />
                    </SectionCard>
                )}

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
                        {customer.is_estate && (
                            <p className="mb-4 text-sm text-white/60">
                                {unitPricingActive ? (
                                    <>Billed from its units below. <Link href="/admin/estates" className="text-amber-300 underline underline-offset-2">Manage unit prices</Link>.</>
                                ) : estateUnits.length > 0 ? (
                                    <>
                                        {estateUnits.filter((u) => !u.property_type).length} of {estateUnits.length} units still need a type, so this
                                        estate is still billed by the counts below.{" "}
                                        <Link href="/admin/estates" className="text-amber-300 underline underline-offset-2">
                                            Set unit prices
                                        </Link>
                                        .
                                    </>
                                ) : (
                                    <>
                                        Billed by the counts below. Give its units their own prices on the{" "}
                                        <Link href="/admin/estates" className="text-amber-300 underline underline-offset-2">
                                            Estates page
                                        </Link>{" "}
                                        if they are not all the same.
                                    </>
                                )}
                            </p>
                        )}
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
                                net={netMonthly}
                            />
                        ) : (
                            <p className="text-sm text-white/70">
                                Monthly charge: <span className="font-semibold text-amber-300">{netMonthly > 0 ? naira(netMonthly) : "Not set"}</span>
                            </p>
                        )}

                        {currentInvoice && (
                            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm">
                                <div>
                                    <p className="text-xs uppercase tracking-[0.12em] text-white/40">Current invoice: {currentInvoice.invoice_month}</p>
                                    <p className="mt-0.5">
                                        <span className="font-bold text-amber-300">{naira(invoiceTotal(currentInvoice))}</span>
                                        {Number(currentInvoice.arrears ?? 0) > 0 && (
                                            <span className="text-white/50">
                                                {" "}
                                                ({naira(Number(currentInvoice.amount))} + {naira(Number(currentInvoice.arrears))} arrears)
                                            </span>
                                        )}
                                    </p>
                                    {Math.abs(Number(currentInvoice.amount) - netMonthly) >= 0.01 && (
                                        <p className="mt-1 text-xs text-white/50">
                                            Edited, so it differs from the monthly charge above. New invoices still use the monthly charge.
                                        </p>
                                    )}
                                </div>
                                <div className="flex items-center gap-3">
                                    <StatusBadge
                                        status={currentInvoice.status !== "paid" && amountPaid(currentInvoice) > 0 ? "part_paid" : currentInvoice.status}
                                    />
                                    <a href="#invoices" className="text-xs font-semibold text-amber-300 underline underline-offset-2">
                                        See or edit it
                                    </a>
                                </div>
                            </div>
                        )}

                        <div className="mt-6 border-t border-white/10 pt-6">
                            {isFullAdmin(profile) ? (
                                <DiscountControl profileId={profileId} customName={customer.full_name ?? "this customer"} current={currentDiscount} />
                            ) : (
                                <p className="text-sm text-white/70">
                                    Discount: <span className="font-semibold text-emerald-300">{currentDiscount ? `${currentDiscount.percent}% off` : "None"}</span>
                                </p>
                            )}
                        </div>

                        <div className="mt-6 border-t border-white/10 pt-6">
                            {isFullAdmin(profile) ? (
                                <CustomerArrearsControl
                                    profileId={profileId}
                                    customName={customer.full_name ?? "this customer"}
                                    current={Number((customer as { arrears?: number | string | null }).arrears ?? 0)}
                                />
                            ) : (
                                <p className="text-sm text-white/70">
                                    Arrears waiting to be charged:{" "}
                                    <span className="font-semibold text-amber-300">
                                        {naira(Number((customer as { arrears?: number | string | null }).arrears ?? 0))}
                                    </span>
                                </p>
                            )}
                        </div>
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
                            monthlyCharge={netMonthly}
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
                    <div className="mb-5 flex flex-wrap items-center gap-3">
                        <BillingActionButton run={generateCustomerBilling.bind(null, profileId, "schedule")}>
                            Extend schedule (next 4 weeks)
                        </BillingActionButton>
                        <BillingActionButton run={generateCustomerBilling.bind(null, profileId, "invoice")} variant="secondary">
                            {calendarInvoice
                                ? `${monthLabel()} invoice already made`
                                : `Generate ${monthLabel()} invoice${beforeInvoiceDay ? ` now (normally on the ${INVOICE_DAY}th)` : ""}`}
                        </BillingActionButton>
                        {currentInvoice && (
                            <Link
                                href={`/admin/invoices/${currentInvoice.id}`}
                                className="text-sm font-semibold text-amber-300 underline underline-offset-2"
                            >
                                Preview current invoice ({currentInvoice.invoice_month})
                            </Link>
                        )}
                        {!calendarInvoice && (
                            <Link
                                href={`/admin/invoices/preview/${profileId}`}
                                className="text-sm font-semibold text-amber-300 underline underline-offset-2"
                            >
                                Preview {monthLabel()} invoice before it&apos;s made
                            </Link>
                        )}
                    </div>

                    <div className="space-y-6">
                        <div id="invoices" className="scroll-mt-24">
                            <p className="mb-2 text-xs uppercase tracking-[0.12em] text-white/40">Invoices</p>
                            {shownInvoices.length === 0 ? (
                                <p className="text-sm text-white/40">No invoices yet.</p>
                            ) : (
                                <div className="space-y-3">
                                    {shownInvoices.map((invoice) => (
                                        <AdminInvoiceCard
                                            key={invoice.id}
                                            payment={{ ...invoice, customer: { full_name: customer.full_name } }}
                                            installments={installmentsByInvoice.get(invoice.id) ?? []}
                                            canAct={isFullAdmin(profile)}
                                            showCustomer={false}
                                            receiptUrl={invoice.transfer_receipt_path ? transferLinks.get(invoice.transfer_receipt_path) ?? null : null}
                                        />
                                    ))}
                                </div>
                            )}
                            <Link href="/admin/payments" className="mt-3 inline-block text-xs text-amber-300 hover:text-amber-200">
                                {hiddenPaid > 0 ? `${hiddenPaid} older paid invoice${hiddenPaid === 1 ? "" : "s"} on the Payments page` : "All invoices on the Payments page"}
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
