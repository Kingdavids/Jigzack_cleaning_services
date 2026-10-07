import Link from "next/link";
import { ChevronRight, Search } from "lucide-react";
import { requireDashboardAccess } from "@/lib/dashboard/requireDashboardAccess";
import { formatDate, naira } from "@/lib/customer/billing";
import DashboardShell from "@/components/dashboard/DashboardShell";
import SectionCard from "@/components/dashboard/SectionCard";
import StatusBadge from "@/components/dashboard/StatusBadge";
import OrphanCustomerActions from "@/components/dashboard/OrphanCustomerActions";
import { isFullAdmin, isOwner } from "@/lib/auth/roles";
import { daysLeft } from "@/lib/admin/deletedCustomers";
import RecentlyDeletedList, { type DeletedCustomer } from "@/components/dashboard/RecentlyDeletedList";
import EmailProfileButton from "@/components/dashboard/EmailProfileButton";
import DeleteSignupButton from "@/components/dashboard/DeleteSignupButton";
import ConfirmEmailButton from "@/components/dashboard/ConfirmEmailButton";
import { balanceOf, loadWithPaid } from "@/lib/billing/balance";
import { discountInfo, type DiscountableCustomer } from "@/lib/billing/generate";
import type { EstateUnit } from "@/lib/billing/pricing";
import LiveRefresh from "@/components/dashboard/LiveRefresh";
import SuspendedTag, { isSuspended } from "@/components/dashboard/SuspendedTag";
import { billToOf } from "@/lib/billing/billTo";
import { customerFilter } from "@/lib/admin/search";
import EmailStatusBadge, { EmailStatusUnavailable } from "@/components/dashboard/EmailStatusBadge";
import { loadEmailStatus } from "@/lib/admin/emailStatus.server";

type CustomerRow = {
    id: string;
    profile_id: string | null;
    full_name: string;
    email: string | null;
    phone: string | null;
    address: string | null;
    lga: string | null;
    property_type: string | null;
    preferred_pickup_frequency: string | null;
    account_code: string | null;
    last_serviced: string | null;
    status: string;
    is_estate: boolean;
    unit_id: string | null;
    created_at: string;
    // monthly_rate comes from billing-installments-2026-09.sql, the rest from
    // customer-discount-2026-09.sql; a row loads without them until those have run.
    monthly_rate?: number | string | null;
    facility_details?: DiscountableCustomer["facility_details"];
    vacancies?: DiscountableCustomer["vacancies"];
    discount_type?: "percent" | "amount" | null;
    discount_value?: number | string | null;
    discount_reason?: string | null;
};

export default async function AdminCustomersPage({
                                                     searchParams,
                                                 }: {
    searchParams: Promise<{ q?: string; fee?: string; status?: string; email?: string }>;
}) {
    const { q, fee, status: statusFilter, email: emailFilter } = await searchParams;
    // ?status=suspended or ?status=active narrows the list.
    const show = statusFilter === "suspended" || statusFilter === "active" ? statusFilter : "all";
    const { profile, supabase, unreadCount } = await requireDashboardAccess("admin");

    // Strip characters that have meaning inside a PostgREST or() filter.
    const term = (q ?? "").replace(/[,()%*]/g, " ").trim().slice(0, 60);

    const BASE_COLUMNS =
        "id, profile_id, full_name, email, phone, address, lga, property_type, preferred_pickup_frequency, account_code, last_serviced, status, is_estate, unit_id, created_at, facility_details, vacancies";
    // monthly_rate and the discount fields work out the "X% discount" badge on
    // each row; both come from SQL run after the base columns above.
    const FULL_COLUMNS = `${BASE_COLUMNS}, monthly_rate, discount_type, discount_value, discount_reason`;

    const buildQuery = (select: string) => {
        let q = supabase
            .from("customers")
            .select(select)
            .neq("status", "deleted")
            .order("full_name", { ascending: true })
            .limit(1000);

        const filter = customerFilter(term);
        if (filter) q = q.or(filter);

        // ?fee=reported: customers who say they paid the registration fee and are
        // waiting for an admin to confirm it.
        if (fee === "reported") {
            q = q.not("registration_fee_submitted_at", "is", null).eq("registration_fee_paid", false);
        }

        return q;
    };

    const fullResult = await buildQuery(FULL_COLUMNS);
    const customersData = fullResult.error ? (await buildQuery(BASE_COLUMNS)).data : fullResult.data;

    const allCustomers = (customersData ?? []) as unknown as CustomerRow[];
    const suspendedCount = allCustomers.filter((c) => isSuspended(c.status)).length;
    const byStatus = allCustomers.filter((c) => (show === "suspended" ? isSuspended(c.status) : show === "active" ? !isSuspended(c.status) : true));

    // Keeps the search and the other filter when switching between All, Active and Suspended.
    const filterHref = (value: "all" | "active" | "suspended") => {
        const params = new URLSearchParams();
        if (term) params.set("q", term);
        if (fee) params.set("fee", fee);
        if (value !== "all") params.set("status", value);
        if (emailFilter === "unconfirmed") params.set("email", "unconfirmed");
        const query = params.toString();
        return `/admin/customers${query ? `?${query}` : ""}`;
    };

    // Customers waiting in Recently deleted (an owner can restore them).
    const { data: deletedData } = await supabase
        .from("customers")
        .select("id, profile_id, full_name, email, deleted_at")
        .eq("status", "deleted")
        .order("deleted_at", { ascending: false });

    const deletedCustomers: DeletedCustomer[] = ((deletedData ?? []) as unknown as Omit<DeletedCustomer, "daysLeft">[]).map((c) => ({
        ...c,
        daysLeft: daysLeft(c.deleted_at),
    }));

    // People who created a login as a customer but never finished the property form
    // have no customer record, so they were missing from every list above. Pending
    // ones are also in Signup approvals; approved ones were only visible in Supabase.
    const [{ data: customerLogins }, { data: recordOwners }] = await Promise.all([
        supabase
            .from("profiles")
            .select("id, full_name, email, status, created_at")
            .eq("role", "customer")
            .order("created_at", { ascending: false })
            .limit(1000),
        supabase.from("customers").select("profile_id").not("profile_id", "is", null).limit(10000),
    ]);

    const haveRecord = new Set((recordOwners ?? []).map((row) => row.profile_id as string));
    const noDetails = ((customerLogins ?? []) as { id: string; full_name: string | null; email: string | null; status: string; created_at: string }[]).filter(
        (person) => !haveRecord.has(person.id) && person.status !== "declined"
    );

    // Only the owner sees whether each email is confirmed, for helping anyone who
    // can't sign in or never got the email.
    const ownerView = isOwner(profile);
    const emailStatus = ownerView ? await loadEmailStatus([...allCustomers.map((c) => c.profile_id as string), ...noDetails.map((p) => p.id)]) : null;
    const isUnconfirmed = (id: string | null) => Boolean(id && emailStatus?.[id] && !emailStatus[id].confirmed);
    const unconfirmedCount = byStatus.filter((c) => isUnconfirmed(c.profile_id)).length + noDetails.filter((p) => isUnconfirmed(p.id)).length;
    const onlyUnconfirmed = emailFilter === "unconfirmed" && Boolean(emailStatus);
    const customers = onlyUnconfirmed ? byStatus.filter((c) => isUnconfirmed(c.profile_id)) : byStatus;
    const shownNoDetails = onlyUnconfirmed ? noDetails.filter((p) => isUnconfirmed(p.id)) : noDetails;

    // Invoices made out to someone before they had an account, matched to these
    // signups by email (as their property form will be) or else by name.
    const unregisteredRows = noDetails.length
        ? ((await loadWithPaid(
              (select) => supabase.from("payments").select(select).is("customer_id", null).not("bill_to", "is", null),
              "id, amount, arrears, status, bill_to"
          )) as { amount: number; arrears: number | null; status: string | null; amount_paid?: number | string | null; bill_to: unknown }[])
        : [];

    const earlierInvoicesFor = (person: { email: string | null; full_name: string | null }) => {
        const email = person.email?.trim().toLowerCase();
        const name = person.full_name?.trim().toLowerCase();
        const byEmail = unregisteredRows.filter((row) => email && billToOf(row)?.email?.trim().toLowerCase() === email);
        const rows = byEmail.length > 0 ? byEmail : unregisteredRows.filter((row) => name && billToOf(row)?.full_name.trim().toLowerCase() === name);

        return rows.length === 0
            ? null
            : { count: rows.length, owed: rows.reduce((sum, row) => sum + balanceOf(row), 0), byEmail: byEmail.length > 0 };
    };

    // Arrears count toward what a customer owes, and money already paid on a part
    // paid invoice is subtracted, so this matches the balance shown everywhere else.
    const unpaidData = await loadWithPaid(
        (select) => supabase.from("payments").select(select).neq("status", "paid"),
        "customer_id, amount, arrears, status"
    );

    const owed = new Map<string, number>();
    for (const row of unpaidData as { customer_id: string | null; amount: number; arrears: number | null; status: string | null; amount_paid?: number | string | null }[]) {
        if (!row.customer_id) continue;
        owed.set(row.customer_id, (owed.get(row.customer_id) ?? 0) + balanceOf(row));
    }

    // Estates' own units, so a discount badge reads against their real
    // per-unit priced total rather than the older count-based one.
    const estateIds = customers.filter((c) => c.is_estate && c.profile_id).map((c) => c.profile_id as string);
    const unitsByEstate = new Map<string, EstateUnit[]>();
    if (estateIds.length > 0) {
        const FULL_UNIT_COLUMNS = "id, label, estate_profile_id, property_type, monthly_rate, is_vacant";
        const BASE_UNIT_COLUMNS = "id, label, estate_profile_id";

        const fullUnits = await supabase.from("units").select(FULL_UNIT_COLUMNS).in("estate_profile_id", estateIds);
        const unitRows = fullUnits.error
            ? ((await supabase.from("units").select(BASE_UNIT_COLUMNS).in("estate_profile_id", estateIds)).data ?? []).map((u) => ({
                  ...u,
                  property_type: null,
                  monthly_rate: null,
                  is_vacant: false,
              }))
            : (fullUnits.data ?? []);

        for (const unit of unitRows as unknown as (EstateUnit & { estate_profile_id: string })[]) {
            const list = unitsByEstate.get(unit.estate_profile_id) ?? [];
            list.push(unit);
            unitsByEstate.set(unit.estate_profile_id, list);
        }
    }

    return (
        <DashboardShell
            role="admin"
            profileId={profile.id}
            title="Customers"
            subtitle="Every customer's details, property, schedule and billing."
            unreadCount={unreadCount}
        >
            {/* What each customer owes follows invoice edits and payments on the Payments page. */}
            <LiveRefresh tables={["payments"]} />
            <SectionCard title="Customers" description="Open a customer to see and edit everything on file.">
                <form className="mb-5 flex gap-2" action="/admin/customers">
                    <div className="relative flex-1">
                        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/35" />
                        <input
                            name="q"
                            defaultValue={term}
                            placeholder="Search by name, phone, email, address or account code"
                            className="h-11 w-full rounded-xl border border-white/10 bg-white/8 pl-9 pr-3 text-sm text-white outline-none placeholder:text-white/30 focus:border-amber-300/50"
                        />
                    </div>
                    <button
                        type="submit"
                        className="rounded-xl bg-amber-400 px-5 text-sm font-bold text-black transition hover:bg-amber-300"
                    >
                        Search
                    </button>
                </form>

                {ownerView && !emailStatus && (
                    <div className="mb-5">
                        <EmailStatusUnavailable />
                    </div>
                )}

                <nav aria-label="Filter customers" className="mb-5 flex flex-wrap gap-2">
                    {([
                        { value: "all", label: "All", count: allCustomers.length },
                        { value: "active", label: "Active", count: allCustomers.length - suspendedCount },
                        { value: "suspended", label: "Suspended", count: suspendedCount },
                    ] as const).map((f) => {
                        const active = show === f.value;
                        const red = f.value === "suspended" && f.count > 0;

                        return (
                            <Link
                                key={f.value}
                                href={filterHref(f.value)}
                                aria-current={active ? "page" : undefined}
                                className={`inline-flex min-h-10 items-center gap-2 rounded-full border px-4 text-sm transition ${
                                    active
                                        ? red
                                            ? "border-red-500 bg-red-500 font-semibold text-white"
                                            : "border-amber-400 bg-amber-400 font-semibold text-black"
                                        : red
                                            ? "border-red-400/40 bg-red-500/10 text-red-300 hover:bg-red-500/20"
                                            : "border-white/10 bg-white/5 text-white/70 hover:bg-white/10"
                                }`}
                            >
                                {f.label}
                                <span className={active ? "opacity-70" : "text-white/40"}>{f.count}</span>
                            </Link>
                        );
                    })}
                {emailStatus && (
                        <Link
                            href={(() => {
                                const params = new URLSearchParams();
                                if (term) params.set("q", term);
                                if (fee) params.set("fee", fee);
                                if (show !== "all") params.set("status", show);
                                if (!onlyUnconfirmed) params.set("email", "unconfirmed");
                                const query = params.toString();
                                return `/admin/customers${query ? `?${query}` : ""}`;
                            })()}
                            aria-current={onlyUnconfirmed ? "page" : undefined}
                            className={`inline-flex min-h-10 items-center gap-2 rounded-full border px-4 text-sm transition ${
                                onlyUnconfirmed
                                    ? "border-amber-400 bg-amber-400 font-semibold text-black"
                                    : unconfirmedCount > 0
                                        ? "border-amber-400/40 bg-amber-400/10 text-amber-200 hover:bg-amber-400/20"
                                        : "border-white/10 bg-white/5 text-white/70 hover:bg-white/10"
                            }`}
                        >
                            Email not confirmed
                            <span className={onlyUnconfirmed ? "opacity-70" : "text-white/40"}>{unconfirmedCount}</span>
                        </Link>
                    )}
                </nav>

                {customers.length === 0 ? (
                    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 text-sm text-white/60">
                        {term ? `No customers match "${term}".` : show === "suspended" ? "No suspended customers." : "No customers yet."}
                    </div>
                ) : (
                    <div className="space-y-3">
                        {customers.map((customer) => {
                            const outstanding = customer.profile_id ? owed.get(customer.profile_id) ?? 0 : 0;
                            const suspended = isSuspended(customer.status);
                            const discount = discountInfo(
                                customer as unknown as DiscountableCustomer,
                                customer.profile_id ? unitsByEstate.get(customer.profile_id) : undefined
                            );

                            return (
                                (customer.profile_id ? (
                                    <Link
                                        key={customer.id}
                                        href={`/admin/customers/${customer.profile_id}`}
                                        className={`block rounded-2xl border p-4 transition hover:bg-white/[0.05] ${
                                            suspended
                                                ? "border-red-400/30 border-l-4 border-l-red-500 bg-red-500/[0.04] opacity-80 hover:opacity-100"
                                                : "border-white/10 bg-white/[0.03] hover:border-white/25"
                                        }`}
                                    >
                                    <div className="flex items-start justify-between gap-4">
                                        <div className="min-w-0">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <p className="font-bold">{customer.full_name}</p>
                                                {suspended && <SuspendedTag />}
                                                {customer.is_estate && (
                                                    <span className="rounded-full bg-sky-400/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-sky-300">
                                                        Estate
                                                    </span>
                                                )}
                                                {customer.unit_id && (
                                                    <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white/60">
                                                        Tenant
                                                    </span>
                                                )}
                                                {discount && (
                                                    <span className="rounded-full bg-emerald-400/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-300">
                                                        {discount.percent}% discount
                                                    </span>
                                                )}
                                                {emailStatus && customer.profile_id && <EmailStatusBadge status={emailStatus[customer.profile_id]} />}
                                            </div>
                                            <p className="mt-1 truncate text-sm text-white/55">
                                                {[customer.address, customer.lga].filter(Boolean).join(", ") || "No address"}
                                            </p>
                                            <p className="mt-1 text-xs text-white/40">
                                                {[customer.phone, customer.email].filter(Boolean).join(" · ")}
                                            </p>
                                            <p className="mt-2 text-xs text-white/40">
                                                <span className="capitalize">{customer.property_type ?? "property"}</span>
                                                {customer.preferred_pickup_frequency ? ` · ${customer.preferred_pickup_frequency}` : ""}
                                                {customer.account_code ? ` · ${customer.account_code}` : ""}
                                                {` · last serviced ${formatDate(customer.last_serviced, "never")}`}
                                            </p>
                                        </div>

                                        <div className="flex shrink-0 items-center gap-3">
                                            <div className="text-right">
                                                <p className={`font-bold ${outstanding > 0 ? "text-amber-300" : "text-white/40"}`}>
                                                    {naira(outstanding)}
                                                </p>
                                                <p className="text-[11px] text-white/35">outstanding</p>
                                                <div className="mt-2">
                                                    <StatusBadge status={customer.status} />
                                                </div>
                                            </div>
                                            <ChevronRight className="h-4 w-4 text-white/30" />
                                        </div>
                                    </div>
                                    </Link>
                                ) : (
                                    <div key={customer.id} className="rounded-2xl border border-amber-300/25 bg-white/[0.03] p-4">
                                    <div className="flex items-start justify-between gap-4">
                                        <div className="min-w-0">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <p className="font-bold">{customer.full_name}</p>
                                                {customer.is_estate && (
                                                    <span className="rounded-full bg-sky-400/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-sky-300">
                                                        Estate
                                                    </span>
                                                )}
                                                {customer.unit_id && (
                                                    <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white/60">
                                                        Tenant
                                                    </span>
                                                )}
                                                {discount && (
                                                    <span className="rounded-full bg-emerald-400/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-300">
                                                        {discount.percent}% discount
                                                    </span>
                                                )}
                                            </div>
                                            <p className="mt-1 truncate text-sm text-white/55">
                                                {[customer.address, customer.lga].filter(Boolean).join(", ") || "No address"}
                                            </p>
                                            <p className="mt-1 text-xs text-white/40">
                                                {[customer.phone, customer.email].filter(Boolean).join(" · ")}
                                            </p>
                                            <p className="mt-2 text-xs text-white/40">
                                                <span className="capitalize">{customer.property_type ?? "property"}</span>
                                                {customer.preferred_pickup_frequency ? ` · ${customer.preferred_pickup_frequency}` : ""}
                                                {customer.account_code ? ` · ${customer.account_code}` : ""}
                                                {` · last serviced ${formatDate(customer.last_serviced, "never")}`}
                                            </p>
                                        </div>

                                        <div className="flex shrink-0 items-center gap-3">
                                            <div className="text-right">
                                                <p className={`font-bold ${outstanding > 0 ? "text-amber-300" : "text-white/40"}`}>
                                                    {naira(outstanding)}
                                                </p>
                                                <p className="text-[11px] text-white/35">outstanding</p>
                                                <div className="mt-2">
                                                    <StatusBadge status={customer.status} />
                                                </div>
                                            </div>
                                            <ChevronRight className="h-4 w-4 text-white/30" />
                                        </div>
                                    </div>
                                        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-white/10 pt-3">
                                            <p className="text-xs text-amber-200/80">
                                                No login is attached to this record, so it cannot be opened. You can remove it.
                                            </p>
                                            {isOwner(profile) ? (
                                                <OrphanCustomerActions customerId={customer.id} fullName={customer.full_name} />
                                            ) : (
                                                <span className="text-xs text-white/40">An owner can remove it.</span>
                                            )}
                                        </div>
                                    </div>
                                ))
                            );
                        })}
                    </div>
                )}
            </SectionCard>

            {noDetails.length > 0 && (
                <div className="mt-6">
                    <SectionCard
                        title="Signed up, no details yet"
                        description="These people created a login but have not filled in their property form, so there is no customer record to open. Pending ones can be reviewed in Signup approvals."
                    >
                        <div className="space-y-2">
                            {shownNoDetails.map((person) => {
                                const earlier = earlierInvoicesFor(person);

                                return (
                                <div
                                    key={person.id}
                                    className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm"
                                >
                                    <div className="min-w-0">
                                        <p className="font-semibold">{person.full_name ?? "No name"}</p>
                                        <p className="truncate text-xs text-white/50">
                                            {person.email ?? "No email"} · signed up {formatDate(person.created_at)}
                                        </p>
                                        {earlier && (
                                            <p className="mt-1 text-xs text-sky-300">
                                                Has {earlier.count} invoice{earlier.count === 1 ? "" : "s"} from before they registered ·{" "}
                                                <span className="font-semibold">{naira(earlier.owed)} owed</span> ·{" "}
                                                <Link href="/admin/payments#not-registered" className="underline underline-offset-2">
                                                    View
                                                </Link>
                                                <span className="block text-white/45">
                                                    {earlier.byEmail
                                                        ? "Same email: their property form will be filled in from these, and the invoices move to them once they send it."
                                                        : "Same name only: check it's them, then use Move to customer on the Payments page."}
                                                </span>
                                            </p>
                                        )}
                                    </div>
                                    <div className="flex flex-wrap items-center gap-3">
                                        <StatusBadge status={person.status} />
                                        {person.status === "pending" ? (
                                            <Link
                                                href={`/admin/approvals#user-${person.id}`}
                                                className="text-xs font-semibold text-amber-300 underline underline-offset-2"
                                            >
                                                Review
                                            </Link>
                                        ) : (
                                            <span className="text-xs text-white/45">Waiting for them to finish setup</span>
                                        )}
                                        {isFullAdmin(profile) && <EmailProfileButton profileId={person.id} email={person.email} />}
                                        {emailStatus && <EmailStatusBadge status={emailStatus[person.id]} showSignIn />}
                                        {isOwner(profile) && (!emailStatus || !emailStatus[person.id] || !emailStatus[person.id].confirmed) && (
                                            <ConfirmEmailButton profileId={person.id} name={person.full_name ?? person.email ?? "This signup"} />
                                        )}
                                        {isFullAdmin(profile) && (
                                            <DeleteSignupButton profileId={person.id} name={person.full_name ?? person.email ?? "This signup"} />
                                        )}
                                    </div>
                                </div>
                                );
                            })}
                        </div>
                    </SectionCard>
                </div>
            )}

            {deletedCustomers.length > 0 && (
                <div className="mt-6">
                    <SectionCard
                        title="Recently deleted"
                        description="Kept for 30 days, then erased for good. An owner can restore anyone here."
                    >
                        <RecentlyDeletedList customers={deletedCustomers} isOwner={isOwner(profile)} />
                    </SectionCard>
                </div>
            )}
        </DashboardShell>
    );
}
