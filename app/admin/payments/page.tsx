import { requireDashboardAccess } from "@/lib/dashboard/requireDashboardAccess";
import { generateAllInvoices } from "../actions";
import { formatDate, naira } from "@/lib/customer/billing";
import { amountPaid, balanceOf, groupInstallments, invoiceTotal, loadInstallmentsChunked } from "@/lib/billing/balance";
import { monthLabel } from "@/lib/billing/pricing";
import DashboardShell from "@/components/dashboard/DashboardShell";
import SectionCard from "@/components/dashboard/SectionCard";
import BillingActionButton from "@/components/dashboard/BillingActionButton";
import AdminInvoiceCard, { type AdminInvoiceRow } from "@/components/dashboard/AdminInvoiceCard";
import NonCustomerInvoiceForm from "@/components/dashboard/NonCustomerInvoiceForm";
import OneOffInvoiceForm, { type InvoiceCustomerOption } from "@/components/dashboard/OneOffInvoiceForm";
import { DOMESTIC_FACILITIES, facilityCount, type FacilityDetails } from "@/lib/customer/facilities";
import { billToOf } from "@/lib/billing/billTo";
import { PAYMENT_RECEIPT_BUCKET } from "@/lib/bank-details";
import { deletedProfileIds } from "@/lib/admin/deletedCustomers";
import { BulkSelectProvider } from "@/components/dashboard/BulkSelect";
import { deleteInvoices } from "../cleanup-actions";
import { isFullAdmin, isOwner } from "@/lib/auth/roles";
import RegistrationFeeControls from "@/components/dashboard/RegistrationFeeControls";
import { CustomerGroup, GroupFilter } from "@/components/dashboard/CustomerGroups";

type ProfileRef = { full_name: string | null } | null;

const PAID_LIMIT = 300;

type PaymentRow = AdminInvoiceRow & { customer: ProfileRef };

export default async function AdminPaymentsPage() {
    const { profile, supabase, unreadCount } = await requireDashboardAccess("admin");

    const { data: directoryData } = await supabase
        .from("profiles")
        .select("id, full_name, role")
        .eq("role", "customer")
        .eq("status", "approved")
        .order("full_name", { ascending: true });

    const hidden = await deletedProfileIds(supabase);
    const customerOptions = (directoryData ?? []).filter((c) => !hidden.has(c.id));

    // Each customer's billable units (vacant ones left out), so a one-off
    // invoice can start from their property details.
    const { data: propertyRows } = customerOptions.length
        ? await supabase.from("customers").select("profile_id, facility_details, vacancies").in("profile_id", customerOptions.map((c) => c.id))
        : { data: [] };
    const propertyByProfile = new Map(
        ((propertyRows ?? []) as { profile_id: string; facility_details: FacilityDetails; vacancies: FacilityDetails }[]).map((row) => [row.profile_id, row])
    );
    const invoiceCustomers: InvoiceCustomerOption[] = customerOptions.map((c) => {
        const property = propertyByProfile.get(c.id);
        const counts: Record<string, number> = {};

        for (const f of DOMESTIC_FACILITIES) {
            const billable = facilityCount(property?.facility_details, f.key) - facilityCount(property?.vacancies, f.key);
            if (billable > 0) counts[f.key] = billable;
        }

        return { id: c.id, full_name: c.full_name, counts };
    });

    // One-off invoices start from the current month, Lagos time ("YYYY-MM").
    const startMonth = new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Lagos" }).slice(0, 7);

    // "*" picks up the transfer and part payment columns once they exist, so the
    // page works before and after the SQL files have been run. Unpaid and paid are
    // loaded separately, so a long history of paid invoices can never push unpaid
    // ones off the list.
    const withCustomer = "*, customer:profiles!payments_customer_id_fkey(full_name)";
    const [unpaidResult, paidResult] = await Promise.all([
        supabase.from("payments").select(withCustomer).neq("status", "paid").order("created_at", { ascending: true }).limit(500),
        supabase.from("payments").select(withCustomer).eq("status", "paid").order("paid_at", { ascending: false, nullsFirst: false }).limit(PAID_LIMIT),
    ]);

    // A customer in Recently deleted keeps their invoices in the database for the
    // record, but they no longer belong on the working Payments list.
    const notDeleted = (p: PaymentRow) => !p.customer_id || !hidden.has(p.customer_id);
    const rawUnpaid = ((unpaidResult.data ?? []) as unknown as PaymentRow[]).filter(notDeleted);
    const rawPaid = ((paidResult.data ?? []) as unknown as PaymentRow[]).filter(notDeleted);

    // A part payment already has money against it, so it reads with the settled
    // invoices below (still flagged, and sorted to the top there) instead of
    // crowding "Needs attention" with invoices nobody has paid anything on yet.
    const unpaidList = rawUnpaid.filter((p) => amountPaid(p) === 0);
    const partPaidList = rawUnpaid.filter((p) => amountPaid(p) > 0);
    const paidList = [...rawPaid, ...partPaidList];

    const payments = [...rawUnpaid, ...rawPaid];
    const canBulk = isOwner(profile);
    const canAct = isFullAdmin(profile);
    const installmentsByInvoice = groupInstallments(await loadInstallmentsChunked(supabase, payments.map((p) => p.id)));

    // Group by customer. Unpaid: customers who reported a payment first, then the largest balance.
    type InvoiceGroup = { key: string; name: string; items: PaymentRow[]; owed: number; total: number; reported: number };
    const groupBy = (list: PaymentRow[]) => {
        const map = new Map<string, InvoiceGroup>();

        for (const invoice of list) {
            const billTo = billToOf(invoice);
            const name = invoice.customer?.full_name ?? (billTo ? `${billTo.full_name} (not registered)` : "Unknown customer");
            const key = invoice.customer_id ?? `bill-to:${name}`;
            const group = map.get(key) ?? { key, name, items: [], owed: 0, total: 0, reported: 0 };

            group.items.push(invoice);
            group.owed += balanceOf(invoice);
            group.total += invoiceTotal(invoice);
            if (invoice.transfer_reported_at) group.reported += 1;
            map.set(key, group);
        }

        return [...map.values()];
    };

    const unpaidGroups = groupBy(unpaidList).sort(
        (a, b) => Number(b.reported > 0) - Number(a.reported > 0) || b.owed - a.owed || a.name.localeCompare(b.name)
    );
    // Part-paid customers (still owing something) come first, so they are not
    // buried under invoices that are fully settled and need nothing further.
    const paidGroups = groupBy(paidList).sort(
        (a, b) => Number(b.owed > 0) - Number(a.owed > 0) || a.name.localeCompare(b.name)
    );
    const paidTotal = paidList.reduce((sum, invoice) => sum + invoiceTotal(invoice), 0);
    const partPaidCount = partPaidList.length;

    // One-off registration fees still to be settled: approved customers who are
    // not tenants (tenants are waived) and have not been marked as paid.
    const { data: feeData } = await supabase
        .from("customers")
        .select("*")
        .in("profile_id", customerOptions.map((c) => c.id))
        .is("unit_id", null)
        .eq("registration_fee_paid", false);

    type FeeRow = {
        profile_id: string;
        full_name: string | null;
        phone: string | null;
        registration_fee_submitted_at?: string | null;
        registration_fee_note?: string | null;
        registration_fee_receipt_path?: string | null;
    };

    const feeRows = ((feeData ?? []) as unknown as FeeRow[]).sort((a, b) => {
        const aReported = a.registration_fee_submitted_at ? 0 : 1;
        const bReported = b.registration_fee_submitted_at ? 0 : 1;
        return aReported - bReported || (a.full_name ?? "").localeCompare(b.full_name ?? "");
    });
    const feeReported = feeRows.filter((f) => f.registration_fee_submitted_at);
    const feeOwing = feeRows.filter((f) => !f.registration_fee_submitted_at);

    // Receipts are private, so each one opens through a link that expires in an hour.
    const receiptPaths = [
        // Only an invoice that isn't fully paid can have a reported transfer waiting to be checked.
        ...rawUnpaid.map((p) => p.transfer_receipt_path),
        ...feeRows.map((f) => f.registration_fee_receipt_path),
    ].filter((p): p is string => Boolean(p));
    const signed = receiptPaths.length
        ? (await supabase.storage.from(PAYMENT_RECEIPT_BUCKET).createSignedUrls(receiptPaths, 3600)).data ?? []
        : [];
    const receiptUrl = new Map(signed.map((s) => [s.path, s.signedUrl]));

    const renderInvoice = (payment: PaymentRow) => (
        <AdminInvoiceCard
            key={payment.id}
            payment={payment}
            installments={installmentsByInvoice.get(payment.id) ?? []}
            canAct={canAct}
            bulk={canBulk}
            receiptUrl={payment.transfer_receipt_path ? receiptUrl.get(payment.transfer_receipt_path) ?? null : null}
        />
    );

    return (
        <DashboardShell
            role="admin"
            profileId={profile.id}
            title="Payments"
            subtitle="Invoices are generated from each customer's property details. Edit any of them before or after sending."
            unreadCount={unreadCount}
        >
            <div className="space-y-6">
                <div id="registration-fees" className="scroll-mt-24">
                    <SectionCard
                        title="Registration fees"
                        description="The one-off fee new customers pay by bank transfer. Confirm each one when the money arrives. Tenants and existing customers are not charged."
                    >
                        {feeRows.length === 0 ? (
                            <p className="text-sm text-white/55">No registration fees are waiting.</p>
                        ) : (
                            <div className="space-y-4">
                                {feeReported.length > 0 && (
                                    <p className="text-xs font-semibold uppercase tracking-[0.15em] text-amber-300">
                                        Waiting for you to confirm ({feeReported.length})
                                    </p>
                                )}
                                {feeReported.map((fee) => (
                                    <div key={fee.profile_id} className="rounded-2xl border border-amber-300/25 bg-white/[0.03] p-4">
                                        <p className="font-bold">{fee.full_name ?? "Unknown customer"}</p>
                                        {canAct ? (
                                            <div className="mt-3">
                                                <RegistrationFeeControls
                                                    profileId={fee.profile_id}
                                                    paid={false}
                                                    reported
                                                    receiptUrl={fee.registration_fee_receipt_path ? receiptUrl.get(fee.registration_fee_receipt_path) ?? null : null}
                                                    reportedNote={fee.registration_fee_note ?? null}
                                                    reportedAt={fee.registration_fee_submitted_at ? formatDate(fee.registration_fee_submitted_at) : null}
                                                    paidText=""
                                                />
                                            </div>
                                        ) : (
                                            <p className="mt-1 text-sm text-white/60">Reported as paid, waiting for an admin to confirm.</p>
                                        )}
                                    </div>
                                ))}

                                {feeOwing.length > 0 && (
                                    <details className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
                                        <summary className="cursor-pointer text-sm font-semibold text-white/80">
                                            Not paid yet ({feeOwing.length})
                                        </summary>
                                        <div className="mt-4 space-y-4">
                                            {feeOwing.map((fee) => (
                                                <div key={fee.profile_id} className="rounded-xl border border-white/10 p-4">
                                                    <p className="font-bold">{fee.full_name ?? "Unknown customer"}</p>
                                                    {canAct ? (
                                                        <div className="mt-3">
                                                            <RegistrationFeeControls
                                                                profileId={fee.profile_id}
                                                                paid={false}
                                                                reported={false}
                                                                receiptUrl={null}
                                                                reportedNote={null}
                                                                reportedAt={null}
                                                                paidText=""
                                                            />
                                                        </div>
                                                    ) : (
                                                        <p className="mt-1 text-sm text-white/60">Not paid yet.</p>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    </details>
                                )}
                            </div>
                        )}
                    </SectionCard>
                </div>

                <SectionCard
                    title="Monthly invoices"
                    description={`Creates a ${monthLabel()} invoice for every active customer that doesn't have one yet: flat ₦5,000, mini flat ₦5,000, shop ₦2,000, duplex ₦8,000, bungalow ₦7,000, terrace ₦10,000, minus any vacant units.`}
                >
                    <BillingActionButton run={generateAllInvoices}>Generate {monthLabel()} invoices</BillingActionButton>
                </SectionCard>

                <BulkSelectProvider
                    enabled={canBulk && payments.length > 0}
                    allIds={payments.map((p) => p.id)}
                    paidIds={paidList.map((p) => p.id)}
                    action={deleteInvoices}
                    noun="invoice"
                >
                    <SectionCard
                        title="Needs attention"
                        description="Invoices with nothing paid on them yet, grouped by customer. Customers who say they have paid come first, then whoever owes the most. A part payment moves to Paid below, still flagged there."
                    >
                        {unpaidGroups.length === 0 ? (
                            <p className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 text-sm text-white/60">
                                Nothing is waiting for payment.
                            </p>
                        ) : (
                            <GroupFilter onlyLabel="Only customers who reported a payment">
                                {unpaidGroups.map((group) => (
                                    <CustomerGroup
                                        key={group.key}
                                        name={group.name}
                                        needs={group.reported}
                                        defaultOpen={group.reported > 0 || unpaidGroups.length <= 6}
                                        header={
                                            <div>
                                                <p className="truncate text-lg font-bold">{group.name}</p>
                                                <p className="mt-0.5 text-sm text-white/55">
                                                    {group.items.length} unpaid invoice{group.items.length === 1 ? "" : "s"} ·{" "}
                                                    <span className="font-semibold text-amber-300">{naira(group.owed)} owed</span>
                                                    {group.reported > 0 && (
                                                        <span className="ml-2 rounded-full bg-sky-400/15 px-2 py-0.5 text-[11px] font-bold text-sky-300">
                                                            payment reported
                                                        </span>
                                                    )}
                                                </p>
                                            </div>
                                        }
                                    >
                                        {group.items.map(renderInvoice)}
                                    </CustomerGroup>
                                ))}
                            </GroupFilter>
                        )}
                    </SectionCard>

                    <div className="mt-6">
                        <SectionCard
                            title="Paid"
                            collapsible
                            defaultOpen={partPaidCount > 0}
                            badge={
                                <div className="flex flex-wrap justify-end gap-2">
                                    {partPaidCount > 0 && (
                                        <span className="rounded-full border border-amber-400/25 bg-amber-400/10 px-3 py-1 text-xs font-bold text-amber-300">
                                            {partPaidCount} part paid
                                        </span>
                                    )}
                                    <span className="rounded-full border border-emerald-400/25 bg-emerald-400/10 px-3 py-1 text-xs font-bold text-emerald-300">
                                        {paidList.length} invoice{paidList.length === 1 ? "" : "s"} · {naira(paidTotal)}
                                    </span>
                                </div>
                            }
                            description={
                                paidList.length >= PAID_LIMIT
                                    ? `The latest ${PAID_LIMIT} settled or part-paid invoices, grouped by customer. Search to find one.`
                                    : "Settled invoices and part payments, grouped by customer. A part payment is sorted to the top, still showing what's owed."
                            }
                        >
                            {paidGroups.length === 0 ? (
                                <p className="text-sm text-white/55">No paid invoices yet.</p>
                            ) : (
                                <GroupFilter>
                                    {paidGroups.map((group) => (
                                        <CustomerGroup
                                            key={group.key}
                                            name={group.name}
                                            defaultOpen={group.owed > 0}
                                            header={
                                                <div>
                                                    <p className="truncate text-lg font-bold">{group.name}</p>
                                                    <p className="mt-0.5 text-sm text-white/55">
                                                        {group.items.length} invoice{group.items.length === 1 ? "" : "s"} ·{" "}
                                                        <span className="font-semibold text-emerald-300">{naira(group.total)}</span>
                                                        {group.owed > 0 && (
                                                            <span className="ml-2 rounded-full bg-amber-400/15 px-2 py-0.5 text-[11px] font-bold text-amber-300">
                                                                {naira(group.owed)} still owed
                                                            </span>
                                                        )}
                                                    </p>
                                                </div>
                                            }
                                        >
                                            {group.items.map(renderInvoice)}
                                        </CustomerGroup>
                                    ))}
                                </GroupFilter>
                            )}
                        </SectionCard>
                    </div>
                </BulkSelectProvider>

                <SectionCard
                    title="Create a one-off invoice"
                    description="For anything outside the automatic monthly charge, including several months at once. Months it covers are skipped by the automatic invoice."
                    collapsible
                >
                    <OneOffInvoiceForm customers={invoiceCustomers} defaultStartMonth={startMonth} />
                </SectionCard>

                <SectionCard
                    title="Invoice someone who isn't registered"
                    description="For a one-off job or a client without an account. Fill in their details and the charges; the invoice opens ready to print, download or share with them."
                    collapsible
                >
                    <NonCustomerInvoiceForm defaultStartMonth={startMonth} />
                </SectionCard>
            </div>
        </DashboardShell>
    );
}
