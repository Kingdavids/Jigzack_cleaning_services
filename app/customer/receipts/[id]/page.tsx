import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { getUserProfile } from "@/lib/auth/getUserProfile";
import { formatDate, invoiceNumber, naira, receiptNumber, resolveBilling } from "@/lib/customer/billing";
import { normalizeLineItems } from "@/lib/billing/pricing";
import DocumentActions from "@/components/dashboard/DocumentActions";
import { DocumentHeader, PropertyDetailsBlock, SupportBlock } from "@/components/dashboard/DocumentParts";

export default async function CustomerReceiptPage({
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

    const { data: payment } = await supabase
        .from("payments")
        .select("*")
        .eq("id", id)
        .eq("customer_id", billingProfileId)
        .single();

    if (!payment) {
        redirect("/customer/payments");
    }

    // A receipt only exists once the invoice has been paid.
    if (payment.status !== "paid") {
        redirect(`/customer/invoices/${payment.id}`);
    }

    const amount = Number(payment.amount ?? 0);
    const arrears = Number(payment.arrears ?? 0);
    const total = amount + arrears;
    const paidAt = payment.paid_at ?? payment.created_at;
    const number = receiptNumber(payment.id);
    const month = payment.invoice_month ?? formatDate(payment.created_at);

    const items = normalizeLineItems(payment.line_items);

    return (
        <div className="doc-page min-h-screen bg-neutral-100 px-4 py-6 text-black print:bg-white">
            <div className="mx-auto max-w-3xl">
                <div
                    id="receipt-sheet"
                    className="doc-sheet space-y-4 rounded-2xl bg-[#f3eadf] p-6 text-[13px] shadow-2xl print:shadow-none"
                >
                    <DocumentHeader
                        title="PAYMENT RECEIPT"
                        subtitle="Lagos Waste Management Authority"
                        right={
                            <>
                                <p><span className="font-semibold">Receipt No:</span> {number}</p>
                                <p><span className="font-semibold">Date paid:</span> {formatDate(paidAt)}</p>
                                <p><span className="font-semibold">Invoice:</span> {invoiceNumber(payment.id)}</p>
                                <p><span className="font-semibold">Month:</span> {month}</p>
                            </>
                        }
                    />

                    <div className="flex items-center justify-between gap-4">
                        <div className="inline-block rotate-[-3deg] rounded-md border-4 border-emerald-700 px-4 py-0.5 text-2xl font-black tracking-[0.25em] text-emerald-700">
                            PAID
                        </div>
                        <div className="text-right text-xs leading-5">
                            <p><span className="font-semibold">Payment method:</span> {payment.payment_method ?? "Not recorded"}</p>
                            {payment.payment_reference && (
                                <p><span className="font-semibold">Reference:</span> {payment.payment_reference}</p>
                            )}
                        </div>
                    </div>

                    <PropertyDetailsBlock customer={billingCustomer} fallbackName={profile.full_name} />

                    <div className="overflow-hidden rounded-lg border border-black/15">
                        <table className="min-w-full text-left text-xs">
                            <thead className="bg-white/60">
                            <tr>
                                <th className="px-3 py-2">Description</th>
                                <th className="px-3 py-2 text-right">Qty</th>
                                <th className="px-3 py-2 text-right">Amount</th>
                            </tr>
                            </thead>
                            <tbody>
                            {items.length > 0 ? (
                                items.map((item, index) => (
                                    <tr key={`${item.label}-${index}`} className="border-t border-black/10">
                                        <td className="px-3 py-2">
                                            <span className="font-medium">{item.label}</span>
                                            {item.note && <span className="ml-2 text-[11px] text-black/55">({item.note})</span>}
                                        </td>
                                        <td className="px-3 py-2 text-right">{item.quantity}</td>
                                        <td className="px-3 py-2 text-right">{naira(item.quantity * item.unit_price)}</td>
                                    </tr>
                                ))
                            ) : (
                                <tr className="border-t border-black/10">
                                    <td className="px-3 py-2">{payment.description ?? "Waste management service charge"}</td>
                                    <td className="px-3 py-2 text-right">{Number(payment.units ?? 1) || 1}</td>
                                    <td className="px-3 py-2 text-right">{naira(amount)}</td>
                                </tr>
                            )}
                            {arrears > 0 && (
                                <tr className="border-t border-black/10">
                                    <td className="px-3 py-2">Arrears</td>
                                    <td className="px-3 py-2 text-right">1</td>
                                    <td className="px-3 py-2 text-right">{naira(arrears)}</td>
                                </tr>
                            )}
                            </tbody>
                        </table>
                    </div>

                    <div className="ml-auto max-w-xs">
                        <div className="flex justify-between text-base font-bold">
                            <span>Total paid</span>
                            <span>{naira(total)}</span>
                        </div>
                    </div>

                    <SupportBlock />

                    <p className="text-center text-[11px] text-black/55">Thank you for your payment.</p>
                </div>

                <div className="mt-4 flex flex-wrap items-center justify-between gap-3 print:hidden">
                    <Link href="/customer/payments" className="text-sm font-semibold text-black/60 hover:text-black">
                        Back to payments
                    </Link>
                    <DocumentActions
                        targetId="receipt-sheet"
                        fileName={`Jigzack-receipt-${number}`}
                        title={`Jigzack receipt ${number}`}
                        shareText={`Jigzack Cleaning Services payment receipt ${number} for ${month}: ${naira(total)} paid.`}
                        printLabel="Print receipt"
                    />
                </div>
            </div>
        </div>
    );
}
