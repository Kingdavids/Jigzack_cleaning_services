import { createClient } from "@/utils/supabase/server";
import { getUserProfile } from "@/lib/auth/getUserProfile";
import { redirect } from "next/navigation";
import Image from "next/image";
import PrintButton from "@/components/dashboard/PrintButton";

function naira(value: number) {
    return `₦${value.toLocaleString()}`;
}

function formatDate(value: string | null | undefined) {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleDateString("en-CA", {
        year: "numeric",
        month: "long",
        day: "numeric",
    });
}

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

    let billingProfileId = profile.id;
    let billingCustomer = customer;

    if (customer?.unit_id) {
        const { data: unit } = await supabase
            .from("units")
            .select("estate_profile_id")
            .eq("id", customer.unit_id)
            .single();

        if (unit) {
            billingProfileId = unit.estate_profile_id;

            const { data: estateCustomer } = await supabase
                .from("customers")
                .select("*")
                .eq("profile_id", unit.estate_profile_id)
                .single();

            billingCustomer = estateCustomer ?? customer;
        }
    }

    const { data: invoice } = await supabase
        .from("payments")
        .select("*")
        .eq("id", id)
        .eq("customer_id", billingProfileId)
        .single();

    if (!invoice) {
        redirect("/customer");
    }

    const amount = Number(invoice.amount ?? 0);
    const units = Number(invoice.units ?? 1);
    const unitPrice = units > 0 ? amount / units : amount;

    return (
        <div className="min-h-screen bg-neutral-100 px-4 py-8 text-black print:bg-white">
            <div className="mx-auto max-w-4xl rounded-2xl bg-[#f3eadf] p-8 shadow-2xl print:shadow-none">
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
                            <h1 className="text-4xl font-black tracking-tight">
                                LAGOS WASTE MANAGEMENT AUTHORITY
                            </h1>
                            <p className="mt-3 text-lg font-semibold">JIGZACK CLEANING SERVICES</p>
                            <p className="mt-2 text-sm text-black/70">
                                Placing our customer and the environment first
                            </p>
                        </div>
                    </div>

                    <div className="text-right text-sm">
                        <p className="font-semibold">Invoice Month</p>
                        <p>{invoice.invoice_month ?? formatDate(invoice.created_at)}</p>
                        <p className="mt-3 font-semibold">Account Name</p>
                        <p>JIGZACK CLEANING SERVICES</p>
                    </div>
                </div>

                <div className="grid gap-6 md:grid-cols-2">
                    <div className="space-y-2 rounded-xl border border-black/15 bg-white/40 p-4">
                        <p><span className="font-semibold">Customer:</span> {billingCustomer?.full_name ?? profile.full_name ?? "Customer"}</p>
                        <p><span className="font-semibold">Address:</span> {billingCustomer?.address ?? "Not available"}</p>
                        <p><span className="font-semibold">Property Code:</span> {billingCustomer?.property_code ?? "Not available"}</p>
                        <p><span className="font-semibold">Customer Account Code:</span> {billingCustomer?.account_code ?? "Not available"}</p>
                        <p><span className="font-semibold">Property Class:</span> {billingCustomer?.property_class ?? "Residential"}</p>
                    </div>

                    <div className="space-y-2 rounded-xl border border-black/15 bg-white/40 p-4">
                        <p><span className="font-semibold">Invoice ID:</span> {invoice.id}</p>
                        <p><span className="font-semibold">Status:</span> {invoice.status ?? "pending"}</p>
                        <p><span className="font-semibold">Last Serviced:</span> {formatDate(billingCustomer?.last_serviced)}</p>
                        <p><span className="font-semibold">Amount Due:</span> {naira(amount)}</p>
                    </div>
                </div>

                <div className="mt-8 overflow-hidden rounded-xl border border-black/15">
                    <table className="min-w-full text-left text-sm">
                        <thead className="bg-white/60">
                        <tr>
                            <th className="px-4 py-3">Description</th>
                            <th className="px-4 py-3">Unit</th>
                            <th className="px-4 py-3">Unit Price</th>
                            <th className="px-4 py-3">Total</th>
                        </tr>
                        </thead>
                        <tbody>
                        <tr className="border-t border-black/10">
                            <td className="px-4 py-4">
                                {invoice.description ?? "Waste management service charge"}
                            </td>
                            <td className="px-4 py-4">{units}</td>
                            <td className="px-4 py-4">{naira(unitPrice)}</td>
                            <td className="px-4 py-4">{naira(amount)}</td>
                        </tr>
                        </tbody>
                    </table>
                </div>

                <div className="mt-8 ml-auto max-w-md space-y-3 text-sm">
                    <div className="flex justify-between border-b border-black/15 pb-2">
                        <span>Current Charges</span>
                        <span>{naira(amount)}</span>
                    </div>
                    <div className="flex justify-between border-b border-black/15 pb-2">
                        <span>Net Arrears</span>
                        <span>{naira(Number(invoice.arrears ?? 0))}</span>
                    </div>
                    <div className="flex justify-between text-lg font-bold">
                        <span>Total</span>
                        <span>{naira(amount + Number(invoice.arrears ?? 0))}</span>
                    </div>
                </div>

                <div className="mt-10 grid gap-6 md:grid-cols-2 text-sm">
                    <div className="rounded-xl border border-black/15 bg-white/40 p-4">
                        <p className="font-semibold">Payment Details</p>
                        <p className="mt-2">Sterling: 0079266810</p>
                        <p>GTBank: 0562133368</p>
                    </div>

                    <div className="rounded-xl border border-black/15 bg-white/40 p-4">
                        <p className="font-semibold">Support</p>
                        <p className="mt-2">LAWMA Response: 5577 / 07080601020 / 07055893400</p>
                        <p>Jigzack Cleaning Services: 0703 433 9721 / 0708 680 8079</p>
                    </div>
                </div>

                <div className="mt-10 flex justify-end">
                    <PrintButton />
                </div>
            </div>
        </div>
    );
}