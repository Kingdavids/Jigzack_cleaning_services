import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { requireDashboardAccess } from "@/lib/dashboard/requireDashboardAccess";
import { isFullAdmin } from "@/lib/auth/roles";
import { naira } from "@/lib/customer/billing";
import { INVOICE_DAY } from "@/lib/billing/pricing";
import DashboardShell from "@/components/dashboard/DashboardShell";
import SectionCard from "@/components/dashboard/SectionCard";
import UnregisteredCustomerForm from "@/components/dashboard/UnregisteredCustomerForm";
import UnregisteredRowActions from "@/components/dashboard/UnregisteredRowActions";
import {
    UNREGISTERED_COLUMNS,
    loadInvoiceHistory,
    monthlyChargeOf,
    registeredEmails,
    suggestFromInvoices,
    type UnregisteredCustomer,
} from "@/lib/billing/unregistered";

export default async function UnregisteredCustomersPage() {
    const { profile, supabase, unreadCount } = await requireDashboardAccess("admin");
    const canEdit = isFullAdmin(profile);

    const { data, error } = await supabase.from("unregistered_customers").select(UNREGISTERED_COLUMNS).order("full_name", { ascending: true }).limit(5000);
    const people = (data ?? []) as unknown as UnregisteredCustomer[];
    const registered = error ? new Set<string>() : await registeredEmails(supabase);
    // People with invoices under "not registered" who are not on the list yet.
    const suggestions = error ? [] : suggestFromInvoices(await loadInvoiceHistory(supabase), people, registered);

    const hasLogin = (person: UnregisteredCustomer) => Boolean(person.email && registered.has(person.email.trim().toLowerCase()));
    const billed = people.filter((person) => !person.paused && !hasLogin(person));
    const monthlyTotal = billed.reduce((sum, person) => sum + monthlyChargeOf(person), 0);

    return (
        <DashboardShell
            role="admin"
            profileId={profile.id}
            title="Unregistered customers"
            subtitle="People who are not on the app but are billed every month."
            unreadCount={unreadCount}
        >
            <Link href="/admin/customers" className="mb-4 inline-flex items-center gap-1 text-sm text-white/60 hover:text-white">
                <ChevronLeft className="h-4 w-4" />
                Customers
            </Link>

            {error ? (
                <div className="rounded-2xl border border-amber-300/30 bg-amber-300/[0.06] p-5 text-sm text-amber-100">
                    Not switched on yet. Run <code>supabase/unregistered-customers-2026-10.sql</code> in the Supabase SQL editor, then reload this page.
                </div>
            ) : (
                <>
                    <SectionCard
                        title="Billed on the 25th"
                        description={`On the ${INVOICE_DAY}th of each month the app makes one invoice for everyone below who is not paused, using their monthly charge, along with the registered customers' invoices. They are not emailed, because they cannot open invoices in the app. Share each invoice from Payments.`}
                    >
                        <dl className="grid gap-3 sm:grid-cols-3">
                            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                                <dt className="text-[11px] uppercase tracking-[0.12em] text-white/40">On the list</dt>
                                <dd className="mt-1 text-2xl font-bold">{people.length}</dd>
                            </div>
                            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                                <dt className="text-[11px] uppercase tracking-[0.12em] text-white/40">Billed each month</dt>
                                <dd className="mt-1 text-2xl font-bold">{billed.length}</dd>
                            </div>
                            <div className="rounded-xl border border-amber-300/25 bg-amber-300/[0.05] p-4">
                                <dt className="text-[11px] uppercase tracking-[0.12em] text-white/40">Total per month</dt>
                                <dd className="mt-1 text-2xl font-bold text-amber-300">{naira(monthlyTotal)}</dd>
                            </div>
                        </dl>
                    </SectionCard>

                    <div className="mt-6">
                        <SectionCard title="People on the list" description="The monthly charge is what goes on their invoice.">
                            {people.length === 0 ? (
                                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 text-sm text-white/60">
                                    Nobody yet. Add the first person below.
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {people.map((person) => {
                                        const login = hasLogin(person);

                                        return (
                                            <div
                                                key={person.id}
                                                className={`rounded-2xl border p-4 ${person.paused || login ? "border-white/10 bg-white/[0.02] opacity-80" : "border-white/10 bg-white/[0.03]"}`}
                                            >
                                                <div className="flex flex-wrap items-start justify-between gap-4">
                                                    <div className="min-w-0">
                                                        <div className="flex flex-wrap items-center gap-2">
                                                            <p className="font-bold">{person.property_name || person.full_name}</p>
                                                            {person.paused && (
                                                                <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white/60">
                                                                    Paused
                                                                </span>
                                                            )}
                                                            {login && (
                                                                <span className="rounded-full bg-sky-400/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-sky-300">
                                                                    Has a login
                                                                </span>
                                                            )}
                                                        </div>
                                                        {person.property_name && <p className="text-sm text-white/55">{person.full_name}</p>}
                                                        <p className="mt-1 truncate text-sm text-white/55">
                                                            {[person.address, person.lga].filter(Boolean).join(", ") || "No address"}
                                                        </p>
                                                        <p className="mt-1 text-xs text-white/40">{[person.phone, person.email].filter(Boolean).join(" · ")}</p>
                                                        {person.note && <p className="mt-1 text-xs text-white/45">{person.note}</p>}
                                                        {login && (
                                                            <p className="mt-2 text-xs text-sky-300">
                                                                They have registered with this email, so they are billed through their account now. Remove them from this list.
                                                            </p>
                                                        )}
                                                    </div>

                                                    <div className="text-right">
                                                        <p className="font-bold text-amber-300">{naira(monthlyChargeOf(person))}</p>
                                                        <p className="text-[11px] text-white/35">per month</p>
                                                    </div>
                                                </div>

                                                {canEdit && (
                                                    <>
                                                        <div className="mt-3 border-t border-white/10 pt-3">
                                                            <UnregisteredRowActions id={person.id} name={person.full_name} paused={person.paused} />
                                                        </div>
                                                        <details className="mt-3">
                                                            <summary className="cursor-pointer text-xs font-semibold text-amber-300 hover:text-amber-200">
                                                                Edit details
                                                            </summary>
                                                            <div className="mt-4">
                                                                <UnregisteredCustomerForm person={person} />
                                                            </div>
                                                        </details>
                                                    </>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </SectionCard>
                    </div>

                    {suggestions.length > 0 && (
                        <div className="mt-6">
                            <SectionCard
                                title="Not registered, not on the list yet"
                                description="These people already have invoices under Not registered on the Payments page, but are not billed automatically. The suggested charge is one month on their latest service invoice (a multi-month invoice is shared out per month). Check it, then add them."
                            >
                                <div className="space-y-3">
                                    {suggestions.map((entry) => (
                                        <div key={entry.key} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                                            <div className="flex flex-wrap items-start justify-between gap-4">
                                                <div className="min-w-0">
                                                    <p className="font-bold">{entry.billTo.property_name || entry.billTo.full_name}</p>
                                                    {entry.billTo.property_name && <p className="text-sm text-white/55">{entry.billTo.full_name}</p>}
                                                    <p className="mt-1 text-xs text-white/40">
                                                        {[entry.billTo.phone, entry.billTo.email].filter(Boolean).join(" · ") || "No contact details"}
                                                    </p>
                                                    <p className="mt-1 text-xs text-white/45">
                                                        {entry.invoiceCount} invoice{entry.invoiceCount === 1 ? "" : "s"}
                                                        {entry.latestMonth ? `, latest for ${entry.latestMonth}` : ""}
                                                    </p>
                                                </div>

                                                <div className="text-right">
                                                    {entry.suggested > 0 ? (
                                                        <>
                                                            <p className="font-bold text-amber-300">{naira(entry.suggested)}</p>
                                                            <p className="text-[11px] text-white/35">suggested per month</p>
                                                            {entry.varies && (
                                                                <p className="mt-1 text-[11px] text-amber-200/80">Their invoices were not all the same amount</p>
                                                            )}
                                                        </>
                                                    ) : (
                                                        <p className="text-xs text-white/45">No service invoice to suggest a charge from</p>
                                                    )}
                                                </div>
                                            </div>

                                            {canEdit && (
                                                <details className="mt-3 border-t border-white/10 pt-3">
                                                    <summary className="cursor-pointer text-xs font-semibold text-amber-300 hover:text-amber-200">
                                                        Add to the list
                                                    </summary>
                                                    <div className="mt-4">
                                                        <UnregisteredCustomerForm
                                                            prefill={{
                                                                full_name: entry.billTo.full_name,
                                                                property_name: entry.billTo.property_name,
                                                                phone: entry.billTo.phone,
                                                                whatsapp_number: entry.billTo.whatsapp_number,
                                                                email: entry.billTo.email,
                                                                address: entry.billTo.address,
                                                                landmark: entry.billTo.landmark,
                                                                lga: entry.billTo.lga,
                                                                state: entry.billTo.state,
                                                                property_type: entry.billTo.property_type,
                                                                monthly_rate: entry.suggested > 0 ? entry.suggested : undefined,
                                                            }}
                                                        />
                                                    </div>
                                                </details>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </SectionCard>
                        </div>
                    )}

                    {canEdit && (
                        <div className="mt-6">
                            <SectionCard title="Add a person" description="They are billed from the next 25th. To also bill them now, make a one-off invoice from Payments.">
                                <UnregisteredCustomerForm />
                            </SectionCard>
                        </div>
                    )}
                </>
            )}
        </DashboardShell>
    );
}
