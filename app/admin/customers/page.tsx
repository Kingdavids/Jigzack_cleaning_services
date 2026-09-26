import Link from "next/link";
import { ChevronRight, Search } from "lucide-react";
import { requireDashboardAccess } from "@/lib/dashboard/requireDashboardAccess";
import { formatDate, naira } from "@/lib/customer/billing";
import DashboardShell from "@/components/dashboard/DashboardShell";
import SectionCard from "@/components/dashboard/SectionCard";
import StatusBadge from "@/components/dashboard/StatusBadge";
import OrphanCustomerActions from "@/components/dashboard/OrphanCustomerActions";
import { isOwner } from "@/lib/auth/roles";
import { daysLeft } from "@/lib/admin/deletedCustomers";
import RecentlyDeletedList, { type DeletedCustomer } from "@/components/dashboard/RecentlyDeletedList";

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
};

export default async function AdminCustomersPage({
                                                     searchParams,
                                                 }: {
    searchParams: Promise<{ q?: string; fee?: string }>;
}) {
    const { q, fee } = await searchParams;
    const { profile, supabase, unreadCount } = await requireDashboardAccess("admin");

    // Strip characters that have meaning inside a PostgREST or() filter.
    const term = (q ?? "").replace(/[,()%*]/g, " ").trim().slice(0, 60);

    let query = supabase
        .from("customers")
        .select(
            "id, profile_id, full_name, email, phone, address, lga, property_type, preferred_pickup_frequency, account_code, last_serviced, status, is_estate, unit_id, created_at"
        )
        .neq("status", "deleted")
        .order("created_at", { ascending: false })
        .limit(1000);

    if (term) {
        query = query.or(
            ["full_name", "email", "phone", "address", "lga", "account_code", "property_code"]
                .map((column) => `${column}.ilike.%${term}%`)
                .join(",")
        );
    }

    // ?fee=reported: customers who say they paid the registration fee and are
    // waiting for an admin to confirm it.
    if (fee === "reported") {
        query = query.not("registration_fee_submitted_at", "is", null).eq("registration_fee_paid", false);
    }

    const { data: customersData } = await query;
    const customers = (customersData ?? []) as CustomerRow[];

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

    const { data: unpaidData } = await supabase
        .from("payments")
        .select("customer_id, amount")
        .neq("status", "paid");

    const owed = new Map<string, number>();
    for (const row of unpaidData ?? []) {
        owed.set(row.customer_id as string, (owed.get(row.customer_id as string) ?? 0) + Number(row.amount ?? 0));
    }

    return (
        <DashboardShell
            role="admin"
            profileId={profile.id}
            title="Customers"
            subtitle="Every customer's details, property, schedule and billing."
            unreadCount={unreadCount}
        >
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

                {customers.length === 0 ? (
                    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 text-sm text-white/60">
                        {term ? `No customers match "${term}".` : "No customers yet."}
                    </div>
                ) : (
                    <div className="space-y-3">
                        {customers.map((customer) => {
                            const outstanding = customer.profile_id ? owed.get(customer.profile_id) ?? 0 : 0;

                            return (
                                (customer.profile_id ? (
                                    <Link
                                        key={customer.id}
                                        href={`/admin/customers/${customer.profile_id}`}
                                        className="block rounded-2xl border border-white/10 bg-white/[0.03] p-4 transition hover:border-white/25 hover:bg-white/[0.05]"
                                    >
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
                            {noDetails.map((person) => (
                                <div
                                    key={person.id}
                                    className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm"
                                >
                                    <div className="min-w-0">
                                        <p className="font-semibold">{person.full_name ?? "No name"}</p>
                                        <p className="truncate text-xs text-white/50">
                                            {person.email ?? "No email"} · signed up {formatDate(person.created_at)}
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-3">
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
                                    </div>
                                </div>
                            ))}
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
