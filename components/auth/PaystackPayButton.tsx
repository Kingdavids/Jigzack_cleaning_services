'use client';

import { useState } from "react";
import Script from "next/script";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { verifyRegistrationPayment } from "@/lib/payment-actions";

declare global {
    interface Window {
        PaystackPop?: {
            setup: (options: {
                key: string;
                email: string;
                amount: number;
                currency: string;
                ref: string;
                callback: (response: { reference: string }) => void;
                onClose: () => void;
            }) => { openIframe: () => void };
        };
    }
}

export default function PaystackPayButton({
                                               email,
                                               amountKobo,
                                               publicKey,
                                           }: {
    email: string;
    amountKobo: number;
    publicKey: string;
}) {
    const router = useRouter();
    const [scriptReady, setScriptReady] = useState(false);
    const [loading, setLoading] = useState(false);

    const handlePay = () => {
        if (!window.PaystackPop) {
            toast.error("Payment is still loading. Please try again in a moment.");
            return;
        }

        setLoading(true);

        const handler = window.PaystackPop.setup({
            key: publicKey,
            email,
            amount: amountKobo,
            currency: "NGN",
            ref: `jigzack-reg-${Date.now()}`,
            callback: (response) => {
                (async () => {
                    const result = await verifyRegistrationPayment(response.reference);

                    if (result?.success) {
                        toast.success("Payment confirmed. Welcome aboard!");
                        router.push("/customer");
                        router.refresh();
                    } else {
                        setLoading(false);
                        toast.error(result?.error || "Could not verify payment. Contact support.");
                    }
                })();
            },
            onClose: () => {
                setLoading(false);
            },
        });

        handler.openIframe();
    };

    return (
        <>
            <Script
                src="https://js.paystack.co/v1/inline.js"
                strategy="afterInteractive"
                onReady={() => setScriptReady(true)}
            />
            <button
                onClick={handlePay}
                disabled={loading || !scriptReady || !email}
                className="mt-6 w-full rounded-xl bg-amber-400 px-5 py-3 font-bold text-black transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-60"
            >
                {!scriptReady
                    ? "Loading…"
                    : loading
                        ? "Processing…"
                        : `Pay ₦${(amountKobo / 100).toLocaleString()} with Paystack`}
            </button>
        </>
    );
}
