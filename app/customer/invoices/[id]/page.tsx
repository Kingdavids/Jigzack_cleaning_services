import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { getUserProfile } from "@/lib/auth/getUserProfile";
import { formatDate, invoiceNumber, naira, receiptNumber, resolveBilling } from "@/lib/customer/billing";
import { normalizeLineItems, type LineItem } from "@/lib/billing/pricing";
import DocumentActions from "@/components/dashboard/DocumentActions";
import { DocumentHeader, PaymentDetailsBlock, PropertyDetailsBlock, SupportBlock } from "@/components/dashboard/DocumentParts";

export default async function CustomerInvoicePage({
                                                      params,
                                                  }: {
    params: Promise<{ id: string }>;
}) {
    const { id } = await params;
    const profile = await getUserProfile();

    if (profile.role !== "customer") {
        redirect(`/${profile.role}`);
    }

    const supabase = await createClient();

    const { data: customer } = await supabase
        .from("customers")
        .select("*")
        .eq("profile_id", profile.id)
        .single();

    const { billingProfileId, billingCustomer } = await resolveBilling(supabase, profile.id, customer);

    const { data: invoice } = await supabase
        .from("payments")
        .select("*")
        .eq("id", id)
        .eq("customer_id", billingProfileId)
        .single();

    if (!invoice) {
        redirect("/customer/payments");
    }

    const amount = Number(invoice.amount ?? 0);
    const arrears = Number(invoice.arrears ?? 0);
    const total = amount + arrears;
    const status = invoice.status ?? "pending";
    const number = invoiceNumber(invoice.id);
    const month = invoice.invoice_month ?? formatDate(invoice.created_at);

    // Older invoices have no line items: show them as a single charge.
    const savedItems = normalizeLineItems(invoice.line_items);
    const items: LineItem[] =
        savedItems.length > 0
            ? savedItems
            : [
                {
                    label: invoice.description ?? "Waste management service charge",
                    quantity: Number(invoice.units ?? 1) || 1,
                    unit_price: (Number(invoice.units ?? 1) || 1) > 0 ? amount / (Number(invoice.units ?? 1) || 1) : amount,
                },
            ];

    return (
        <div className="doc-page min-h-screen bg-neutral-100 px-4 py-6 text-black print:bg-white">
            <div className="mx-auto max-w-3xl">
                <div
                    id="invoice-sheet"
                    className="doc-sheet space-y-4 rounded-2xl bg-[#f3eadf] p-6 text-[13px] shadow-2xl print:shadow-none"
                >
                    <DocumentHeader
                        title="INVOICE"
                        subtitle="Lagos Waste Management Authority"
                        right={
                            <>
                                <p><span className="font-semibold">Invoice No:</span> {number}</p>
                                <p><span className="font-semibold">Month:</span> {month}</p>
                                <p><span className="font-semibold">Issued:</span> {formatDate(invoice.created_at)}</p>
                                <p>
                                    <span className="font-semibold">Status:</span>{" "}
                                    <span className={`font-bold uppercase ${status === "paid" ? "text-emerald-700" : "text-red-700"}`}>
                                        {status}
                                    </span>
                                </p>
                            </>
                        }
                    />

                    <PropertyDetailsBlock customer={billingCustomer} fallbackName={profile.full_name} />

                    <div className="overflow-hidden rounded-lg border border-black/15">
                        <table className="min-w-full text-left text-xs">
                            <thead className="bg-white/60">
                            <tr>
                                <th className="px-3 py-2">Description</th>
                                <th className="px-3 py-2 text-right">Qty</th>
                                <th className="px-3 py-2 text-right">Unit price</th>
                                <th className="px-3 py-2 text-right">Amount</th>
                            </tr>
                            </thead>
                            <tbody>
                            {items.map((item, index) => (
                                <tr key={`${item.label}-${index}`} className="border-t border-black/10">
                                    <td className="px-3 py-2">
                                        <span className="font-medium">{item.label}</span>
                                        {item.note && <span className="ml-2 text-[11px] text-black/55">({item.note})</span>}
                                    </td>
                                    <td className="px-3 py-2 text-right">{item.quantity}</td>
                                    <td className="px-3 py-2 text-right">{naira(item.unit_price)}</td>
                                    <td className="px-3 py-2 text-right">{naira(item.quantity * item.unit_price)}</td>
                                </tr>
                            ))}
                            </tbody>
                        </table>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-[1fr_15rem]">
                        <PaymentDetailsBlock reference={number} />

                        <div className="space-y-1.5 self-start text-xs">
                            <div className="flex justify-between border-b border-black/15 pb-1.5">
                                <span>Current charges</span>
                                <span>{naira(amount)}</span>
                            </div>
                            <div className="flex justify-between border-b border-black/15 pb-1.5">
                                <span>Arrears</span>
                                <span>{naira(arrears)}</span>
                            </div>
                            <div className="flex justify-between text-base font-bold">
                                <span>Total due</span>
                                <span>{naira(total)}</span>
                            </div>
                        </div>
                    </div>

                    <SupportBlock />
                </div>

                <div className="mt-4 flex flex-wrap items-center justify-between gap-3 print:hidden">
                    <Link href="/customer/payments" className="text-sm font-semibold text-black/60 hover:text-black">
                        Back to payments
                    </Link>
                    <div className="flex flex-wrap items-center justify-end gap-3">
                        {status === "paid" && (
                            <Link
                                href={`/customer/receipts/${invoice.id}`}
                                className="rounded-xl border border-black/20 bg-white/70 px-4 py-2.5 text-sm font-semibold text-black hover:bg-white"
                            >
                                View receipt {receiptNumber(invoice.id)}
                            </Link>
                        )}
                        <DocumentActions
                            targetId="invoice-sheet"
                            fileName={`Jigzack-invoice-${number}`}
                            title={`Jigzack invoice ${number}`}
                            shareText={`Jigzack Cleaning Services invoice ${number} for ${month}: ${naira(total)} (${status}).`}
                            printLabel="Print invoice"
                        />
                    </div>
                </div>
            </div>
        </div>
    );
}
