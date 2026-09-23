import { redirect } from "next/navigation";
import Image from "next/image";
import { createClient } from "@/utils/supabase/server";
import { getUserProfile } from "@/lib/auth/getUserProfile";
import { formatDate, invoiceNumber, naira, receiptNumber, resolveBilling } from "@/lib/customer/billing";
import PrintButton from "@/components/dashboard/PrintButton";

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
    const paidAt = payment.paid_at ?? payment.created_at;

    return (
        <div className="min-h-screen bg-neutral-100 px-4 py-8 text-black print:bg-white">
            <div className="mx-auto max-w-3xl rounded-2xl bg-[#f3eadf] p-8 shadow-2xl print:shadow-none">
                <div className="mb-8 flex items-start justify-between gap-6 border-b border-black/15 pb-6">
                    <div className="flex items-start gap-4">
                        <Image
                            src="/images/lawma-logo.png"
                            alt="Lagos Waste Management Authority logo"
                            width={72}
                            height={72}
                            className="shrink-0"
                        />
                        <div>
                            <h1 className="text-3xl font-black tracking-tight">PAYMENT RECEIPT</h1>
                            <p className="mt-2 text-lg font-semibold">JIGZACK CLEANING SERVICES</p>
                            <p className="mt-1 text-sm text-black/70">Lagos Waste Management Authority</p>
                        </div>
                    </div>

                    <div className="text-right text-sm">
                        <p className="font-semibold">Receipt No.</p>
                        <p>{receiptNumber(payment.id)}</p>
                        <p className="mt-3 font-semibold">Date Paid</p>
                        <p>{formatDate(paidAt)}</p>
                    </div>
                </div>

                <div className="mb-6 inline-block rotate-[-4deg] rounded-lg border-4 border-emerald-700 px-5 py-1 text-3xl font-black tracking-[0.25em] text-emerald-700">
                    PAID
                </div>

                <div className="grid gap-6 md:grid-cols-2">
                    <div className="space-y-2 rounded-xl border border-black/15 bg-white/40 p-4 text-sm">
                        <p><span className="font-semibold">Received from:</span> {billingCustomer?.full_name ?? profile.full_name ?? "Customer"}</p>
                        <p><span className="font-semibold">Address:</span> {billingCustomer?.address ?? "Not available"}</p>
                        <p><span className="font-semibold">Account Code:</span> {billingCustomer?.account_code ?? "Not available"}</p>
                    </div>

                    <div className="space-y-2 rounded-xl border border-black/15 bg-white/40 p-4 text-sm">
                        <p><span className="font-semibold">Invoice:</span> {invoiceNumber(payment.id)}</p>
                        <p><span className="font-semibold">Invoice Month:</span> {payment.invoice_month ?? formatDate(payment.created_at)}</p>
                        <p><span className="font-semibold">Payment Method:</span> {payment.payment_method ?? "Not recorded"}</p>
                        {payment.payment_reference && (
                            <p><span className="font-semibold">Reference:</span> {payment.payment_reference}</p>
                        )}
                    </div>
                </div>

                <div className="mt-8 overflow-hidden rounded-xl border border-black/15">
                    <table className="min-w-full text-left text-sm">
                        <thead className="bg-white/60">
                        <tr>
                            <th className="px-4 py-3">Description</th>
                            <th className="px-4 py-3 text-right">Amount</th>
                        </tr>
                        </thead>
                        <tbody>
                        <tr className="border-t border-black/10">
                            <td className="px-4 py-4">{payment.description ?? "Waste management service charge"}</td>
                            <td className="px-4 py-4 text-right">{naira(amount)}</td>
                        </tr>
                        {arrears > 0 && (
                            <tr className="border-t border-black/10">
                                <td className="px-4 py-4">Arrears</td>
                                <td className="px-4 py-4 text-right">{naira(arrears)}</td>
                            </tr>
                        )}
                        </tbody>
                    </table>
                </div>

                <div className="mt-6 ml-auto max-w-xs">
                    <div className="flex justify-between text-lg font-bold">
                        <span>Total Paid</span>
                        <span>{naira(amount + arrears)}</span>
                    </div>
                </div>

                <p className="mt-10 text-center text-xs text-black/55">
                    Thank you for your payment. Support: Jigzack Cleaning Services 0703 433 9721 / 0708 680 8079
                </p>

                <div className="mt-8 flex justify-end">
                    <PrintButton label="Download / Print Receipt" />
                </div>
            </div>
        </div>
    );
}
