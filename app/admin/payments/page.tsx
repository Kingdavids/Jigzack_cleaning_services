import Link from "next/link";
import { requireDashboardAccess } from "@/lib/dashboard/requireDashboardAccess";
import { generateAllInvoices } from "../actions";
import { formatDate, naira } from "@/lib/customer/billing";
import { amountPaid, balanceOf, groupInstallments, invoiceTotal, loadInstallmentsChunked } from "@/lib/billing/balance";
import { billingMonthKey, billingMonthLabel } from "@/lib/billing/pricing";
import DashboardShell from "@/components/dashboard/DashboardShell";
import SectionCard from "@/components/dashboard/SectionCard";
import BillingActionButton from "@/components/dashboard/BillingActionButton";
import AdminInvoiceCard, { type AdminInvoiceRow } from "@/components/dashboard/AdminInvoiceCard";
import NonCustomerInvoiceForm from "@/components/dashboard/NonCustomerInvoiceForm";
import SuspendedTag, { isSuspended } from "@/components/dashboard/SuspendedTag";
import OneOffInvoiceForm, { type InvoiceCustomerOption } from "@/components/dashboard/OneOffInvoiceForm";
import { ALL_FACILITIES, facilityCount, type FacilityDetails } from "@/lib/customer/facilities";
import { billToOf } from "@/lib/billing/billTo";
import MoveToCustomerControl from "@/components/dashboard/MoveToCustomerControl";
import EditBillToForm from "@/components/dashboard/EditBillToForm";
import type { BillTo } from "@/lib/billing/billTo";
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

// How the customer groups on this page are ordered (?sort=).
const SORTS = [
    { key: "action", label: "Needs action first" },
    { key: "owed", label: "Most owed" },
    { key: "newest", label: "Newest" },
    { key: "oldest", label: "Oldest" },
    { key: "name", label: "Name A–Z" },
] as const;

type SortKey = (typeof SORTS)[number]["key"];

export default async function AdminPaymentsPage({ searchParams }: { searchParams: Promise<{ sort?: string }> }) {
    const { sort: sortParam } = await searchParams;
    const sort: SortKey = SORTS.some((s) => s.key === sortParam) ? (sortParam as SortKey) : "action";

    // The newest invoice first inside each customer's group.
    const newestFirst = (a: { created_at: string }, b: { created_at: string }) => b.created_at.localeCompare(a.created_at);

    const { profile, supabase, unreadCount } = await requireDashboardAccess("admin");

    const { data: directoryData } = await supabase
        .from("profiles")
        .select("id, full_name, role, email")
        .eq("role", "customer")
        .eq("status", "approved")
        .order("full_name", { ascending: true });

    const hidden = await deletedProfileIds(supabase);
    const customerOptions = (directoryData ?? []).filter((c) => !hidden.has(c.id));

    // Each customer's billable units (vacant ones left out), so a one-off
    // invoice can start from their property details.
    const { data: propertyRows } = customerOptions.length
        ? await supabase
              .from("customers")
              .select("profile_id, facility_details, vacancies, phone, whatsapp_number, email, status")
              .in("profile_id", customerOptions.map((c) => c.id))
        : { data: [] };
    type PropertyRow = {
        profile_id: string;
        facility_details: FacilityDetails;
        vacancies: FacilityDetails;
        phone: string | null;
        whatsapp_number: string | null;
        email: string | null;
        status: string | null;
    };
    const propertyByProfile = new Map(((propertyRows ?? []) as PropertyRow[]).map((row) => [row.profile_id, row]));
    // Suspended customers are tagged wherever their invoices appear.
    const suspendedIds = new Set(((propertyRows ?? []) as PropertyRow[]).filter((row) => isSuspended(row.status)).map((row) => row.profile_id));
    const invoiceCustomers: InvoiceCustomerOption[] = customerOptions.map((c) => {
        const property = propertyByProfile.get(c.id);
        const counts: Record<string, number> = {};

        for (const f of ALL_FACILITIES) {
            const billable = facilityCount(property?.facility_details, f.key) - facilityCount(property?.vacancies, f.key);
            if (billable > 0) counts[f.key] = billable;
        }

        return { id: c.id, full_name: c.full_name, counts };
    });

    // One-off invoices start from the billing month: last month's until the 25th.
    const startMonth = billingMonthKey();

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
    // Invoices for people not registered on the app have their own section, so
    // they are kept out of the customer lists here.
    const isUnregistered = (p: PaymentRow) => !p.customer_id && billToOf(p) !== null;
    const unpaidList = rawUnpaid.filter((p) => !isUnregistered(p) && amountPaid(p) === 0);
    const partPaidList = rawUnpaid.filter((p) => !isUnregistered(p) && amountPaid(p) > 0);
    const paidList = [...rawPaid.filter((p) => !isUnregistered(p)), ...partPaidList];

    const payments = [...rawUnpaid, ...rawPaid];

    // The not registered, one group per person: matched on email, then phone,
    // then name, so a second invoice for the same person lands in their group.
    const digits = (value: string | null | undefined) => (value ?? "").replace(/\D/g, "").slice(-10);
    type PersonGroup = {
        key: string;
        name: string;
        contact: string;
        // Their details as on their invoices, for the edit form.
        details: BillTo;
        email: string | null;
        phones: string[];
        items: PaymentRow[];
        billed: number;
        paid: number;
        owed: number;
    };
    const people = new Map<string, PersonGroup>();

    for (const invoice of [...rawUnpaid, ...rawPaid].filter(isUnregistered)) {
        const billTo = billToOf(invoice)!;
        const key = billTo.email?.toLowerCase() || digits(billTo.phone) || billTo.full_name.trim().toLowerCase();
        const group = people.get(key) ?? {
            key,
            name: billTo.property_name ? `${billTo.property_name} (${billTo.full_name})` : billTo.full_name,
            contact: [billTo.phone, billTo.email, billTo.address].filter(Boolean).join(" · "),
            details: billTo,
            email: billTo.email?.toLowerCase() ?? null,
            phones: [digits(billTo.phone), digits(billTo.whatsapp_number)].filter(Boolean),
            items: [],
            billed: 0,
            paid: 0,
            owed: 0,
        };

        group.items.push(invoice);
        group.billed += invoiceTotal(invoice);
        group.paid += amountPaid(invoice);
        group.owed += balanceOf(invoice);
        people.set(key, group);
    }

    // Whoever owes most first; unpaid invoices before settled ones inside each group.
    const personNewest = (g: PersonGroup) => g.items.reduce((latest, i) => (i.created_at > latest ? i.created_at : latest), "");
    const personOldest = (g: PersonGroup) => g.items.reduce((first, i) => (!first || i.created_at < first ? i.created_at : first), "");
    const personGroups = [...people.values()].sort((a, b) =>
        sort === "newest"
            ? personNewest(b).localeCompare(personNewest(a))
            : sort === "oldest"
                ? personOldest(a).localeCompare(personOldest(b))
                : sort === "name"
                    ? a.name.localeCompare(b.name)
                    : b.owed - a.owed || a.name.localeCompare(b.name)
    );
    // Unpaid invoices first inside each group, newest first within each.
    for (const group of personGroups) group.items.sort((a, b) => Number(a.status === "paid") - Number(b.status === "paid") || newestFirst(a, b));

    const unregisteredTotals = personGroups.reduce(
        (sum, g) => ({ billed: sum.billed + g.billed, paid: sum.paid + g.paid, owed: sum.owed + g.owed }),
        { billed: 0, paid: 0, owed: 0 }
    );

    // A registered customer with the same email or phone has probably signed up since.
    const suggestMatch = (group: PersonGroup) => {
        for (const c of customerOptions) {
            const row = propertyByProfile.get(c.id);
            if (!row) continue;

            if (group.email && row.email?.toLowerCase() === group.email) {
                return { id: c.id, full_name: c.full_name, reason: "same email address" };
            }

            const theirs = [digits(row.phone), digits(row.whatsapp_number)].filter(Boolean);
            if (group.phones.some((phone) => theirs.includes(phone))) {
                return { id: c.id, full_name: c.full_name, reason: "same phone number" };
            }
        }

        // Someone who signed up but hasn't filled in their property form yet
        // has no customer record, only their login: match on that.
        const sameName = (name: string | null) => Boolean(name) && name!.trim().toLowerCase() === group.details.full_name.trim().toLowerCase();

        for (const c of customerOptions) {
            if (group.email && (c.email as string | null)?.toLowerCase() === group.email) {
                return { id: c.id, full_name: c.full_name, reason: "same sign-up email" };
            }
        }

        for (const c of customerOptions) {
            if (sameName(c.full_name)) {
                return { id: c.id, full_name: c.full_name, reason: "same name, so check it is the same person" };
            }
        }

        return null;
    };
    const canBulk = isOwner(profile);
    const canAct = isFullAdmin(profile);
    const installmentsByInvoice = groupInstallments(await loadInstallmentsChunked(supabase, payments.map((p) => p.id)));

    // Group by customer. Unpaid: customers who reported a payment first, then the largest balance.
    type InvoiceGroup = {
        key: string;
        name: string;
        items: PaymentRow[];
        owed: number;
        total: number;
        reported: number;
        // When their newest and oldest invoices were made, and their latest payment.
        newest: string;
        oldest: string;
        lastPaid: string;
    };
    const groupBy = (list: PaymentRow[]) => {
        const map = new Map<string, InvoiceGroup>();

        for (const invoice of list) {
            const billTo = billToOf(invoice);
            const name = invoice.customer?.full_name ?? (billTo ? `${billTo.full_name} (not registered)` : "Unknown customer");
            const key = invoice.customer_id ?? `bill-to:${name}`;
            const group = map.get(key) ?? { key, name, items: [], owed: 0, total: 0, reported: 0, newest: "", oldest: "", lastPaid: "" };

            group.items.push(invoice);
            if (invoice.created_at > group.newest) group.newest = invoice.created_at;
            if (!group.oldest || invoice.created_at < group.oldest) group.oldest = invoice.created_at;
            if ((invoice.paid_at ?? "") > group.lastPaid) group.lastPaid = invoice.paid_at ?? "";
            group.owed += balanceOf(invoice);
            group.total += invoiceTotal(invoice);
            if (invoice.transfer_reported_at) group.reported += 1;
            map.set(key, group);
        }

        const groups = [...map.values()];
        for (const group of groups) group.items.sort(newestFirst);
        return groups;
    };

    // The chosen order, falling back to each list's own "needs action" order.
    const byChoice = (a: InvoiceGroup, b: InvoiceGroup) =>
        sort === "owed"
            ? b.owed - a.owed
            : sort === "newest"
                ? b.newest.localeCompare(a.newest)
                : sort === "oldest"
                    ? a.oldest.localeCompare(b.oldest)
                    : sort === "name"
                        ? a.name.localeCompare(b.name)
                        : 0;

    // Needs action: customers who reported a payment, then whoever owes most.
    const unpaidGroups = groupBy(unpaidList).sort(
        (a, b) => byChoice(a, b) || Number(b.reported > 0) - Number(a.reported > 0) || b.owed - a.owed || a.name.localeCompare(b.name)
    );
    // Needs action: part-paid customers (still owing) first, then the most recently paid.
    const paidGroups = groupBy(paidList).sort(
        (a, b) => byChoice(a, b) || Number(b.owed > 0) - Number(a.owed > 0) || b.lastPaid.localeCompare(a.lastPaid) || a.name.localeCompare(b.name)
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
            suspended={Boolean(payment.customer_id && suspendedIds.has(payment.customer_id))}
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
                    description={`Creates a ${billingMonthLabel()} invoice for every active customer that doesn't have one yet: flat ₦5,000, mini flat ₦5,000, studio apartment ₦5,000, shop ₦2,000, duplex ₦8,000, bungalow ₦7,000, terrace ₦10,000, minus any vacant units.`}
                >
                    <BillingActionButton run={generateAllInvoices}>Generate {billingMonthLabel()} invoices</BillingActionButton>
                </SectionCard>

                <BulkSelectProvider
                    enabled={canBulk && payments.length > 0}
                    allIds={payments.map((p) => p.id)}
                    paidIds={paidList.map((p) => p.id)}
                    action={deleteInvoices}
                    noun="invoice"
                >
                    <nav aria-label="Sort invoices" className="mb-4 flex flex-wrap items-center gap-2">
                        <span className="text-xs font-semibold uppercase tracking-[0.15em] text-white/45">Sort by</span>
                        {SORTS.map((option) => (
                            <Link
                                key={option.key}
                                href={option.key === "action" ? "/admin/payments" : `/admin/payments?sort=${option.key}`}
                                aria-current={sort === option.key ? "page" : undefined}
                                className={`inline-flex min-h-9 items-center rounded-full border px-3 text-xs transition ${
                                    sort === option.key
                                        ? "border-amber-400 bg-amber-400 font-semibold text-black"
                                        : "border-white/10 bg-white/5 text-white/70 hover:bg-white/10"
                                }`}
                            >
                                {option.label}
                            </Link>
                        ))}
                    </nav>

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
                                                <p className="flex flex-wrap items-center gap-2 text-lg font-bold">
                                                    <span className="truncate">{group.name}</span>
                                                    {suspendedIds.has(group.key) && <SuspendedTag />}
                                                </p>
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
                                                    <p className="flex flex-wrap items-center gap-2 text-lg font-bold">
                                                        <span className="truncate">{group.name}</span>
                                                        {suspendedIds.has(group.key) && <SuspendedTag />}
                                                    </p>
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

                    <div id="not-registered" className="mt-6 scroll-mt-24">
                        <SectionCard
                            title="Not registered"
                            collapsible
                            defaultOpen={unregisteredTotals.owed > 0}
                            badge={
                                personGroups.length > 0 ? (
                                    <span className="rounded-full border border-sky-400/25 bg-sky-400/10 px-3 py-1 text-xs font-bold text-sky-300">
                                        {personGroups.length} {personGroups.length === 1 ? "person" : "people"} · {naira(unregisteredTotals.owed)} owed
                                    </span>
                                ) : null
                            }
                            description="Invoices for people without an account. Record their payments here as usual. Once they register, move their invoices to their customer account."
                        >
                            {personGroups.length === 0 ? (
                                <p className="text-sm text-white/55">No invoices for unregistered people. Create one below.</p>
                            ) : (
                                <>
                                    <div className="mb-5 grid gap-3 sm:grid-cols-3">
                                        {[
                                            { label: "Total billed", value: naira(unregisteredTotals.billed), tone: "text-white" },
                                            { label: "Paid", value: naira(unregisteredTotals.paid), tone: "text-emerald-300" },
                                            { label: "Still owed", value: naira(unregisteredTotals.owed), tone: "text-amber-300" },
                                        ].map((item) => (
                                            <div key={item.label} className="rounded-xl border border-white/10 bg-black/20 px-4 py-3">
                                                <p className="text-xs uppercase tracking-[0.15em] text-white/40">{item.label}</p>
                                                <p className={`mt-1 text-xl font-bold ${item.tone}`}>{item.value}</p>
                                            </div>
                                        ))}
                                    </div>

                                    <GroupFilter placeholder="Search by name">
                                        {personGroups.map((group) => {
                                            const match = suggestMatch(group);

                                            return (
                                                <CustomerGroup
                                                    key={group.key}
                                                    name={group.name}
                                                    defaultOpen={personGroups.length <= 4}
                                                    header={
                                                        <div>
                                                            <p className="truncate text-lg font-bold">{group.name}</p>
                                                            <p className="mt-0.5 text-sm text-white/55">
                                                                {group.items.length} invoice{group.items.length === 1 ? "" : "s"} ·{" "}
                                                                <span className="font-semibold text-amber-300">{naira(group.owed)} owed</span> ·{" "}
                                                                <span className="text-emerald-300">{naira(group.paid)} paid</span>
                                                                {match && (
                                                                    <span className="ml-2 rounded-full bg-sky-400/15 px-2 py-0.5 text-[11px] font-bold text-sky-300">
                                                                        may have registered
                                                                    </span>
                                                                )}
                                                            </p>
                                                            {group.contact && <p className="mt-0.5 truncate text-xs text-white/40">{group.contact}</p>}
                                                        </div>
                                                    }
                                                >
                                                    {canAct && <EditBillToForm invoiceIds={group.items.map((i) => i.id)} defaults={group.details} />}
                                                    {canAct && (
                                                        <MoveToCustomerControl
                                                            personName={group.name}
                                                            invoiceIds={group.items.map((i) => i.id)}
                                                            customers={customerOptions.map((c) => ({ id: c.id, full_name: c.full_name }))}
                                                            suggested={match}
                                                        />
                                                    )}
                                                    {group.items.map(renderInvoice)}
                                                </CustomerGroup>
                                            );
                                        })}
                                    </GroupFilter>
                                </>
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
