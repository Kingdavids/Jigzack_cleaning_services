'use client';

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { reportInvoiceTransfer } from "@/lib/payment-actions";

// "I paid by transfer" for one unpaid invoice: an optional note and receipt,
// then the admin is told to check and confirm.
export default function InvoiceTransferForm({ paymentId }: { paymentId: string }) {
    const router = useRouter();
    const [open, setOpen] = useState(false);
    const [busy, setBusy] = useState(false);

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (busy) return;

        const data = new FormData(e.currentTarget);
        data.set("paymentId", paymentId);
        const receipt = data.get("receipt");

        setBusy(true);

        try {
            if (receipt instanceof File && receipt.size > 0 && receipt.type.startsWith("image/")) {
                try {
                    const imageCompression = (await import("browser-image-compression")).default;
                    const compressed = await imageCompression(receipt, {
                        maxSizeMB: 1.2,
                        maxWidthOrHeight: 1600,
                        useWebWorker: true,
                        fileType: "image/jpeg",
                    });
                    data.set("receipt", new File([compressed], "receipt.jpg", { type: "image/jpeg" }));
                } catch {
                    toast.error("Couldn't process that photo. Try a JPEG or PNG, or a PDF.");
                    return;
                }
            }

            const result = await reportInvoiceTransfer(data);

            if (!result?.success) {
                toast.error(result?.error ?? "Could not send this.");
                return;
            }

            toast.success("Thank you. We will confirm your payment shortly.");
            setOpen(false);
            router.refresh();
        } finally {
            setBusy(false);
        }
    };

    if (!open) {
        return (
            <button
                type="button"
                onClick={() => setOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-xl bg-amber-400 px-3 py-2 text-xs font-bold text-black transition hover:bg-amber-300"
            >
                I paid by transfer
            </button>
        );
    }

    return (
        <form onSubmit={handleSubmit} className="w-full space-y-3 rounded-xl border border-white/10 bg-black/25 p-4 sm:min-w-[320px]">
            <div>
                <label htmlFor={`note-${paymentId}`} className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-white/50">
                    Name on the transfer or reference (optional)
                </label>
                <input
                    id={`note-${paymentId}`}
                    name="note"
                    maxLength={300}
                    className="h-10 w-full rounded-lg border border-white/10 bg-white/8 px-3 text-sm text-white outline-none placeholder:text-white/30 focus:border-amber-300/50"
                />
            </div>

            <div>
                <label htmlFor={`receipt-${paymentId}`} className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-white/50">
                    Receipt photo or PDF (optional)
                </label>
                <input
                    id={`receipt-${paymentId}`}
                    name="receipt"
                    type="file"
                    accept="image/*,application/pdf"
                    className="block w-full text-xs text-white/70 file:mr-3 file:rounded-lg file:border-0 file:bg-white/10 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-white hover:file:bg-white/15"
                />
            </div>

            <div className="flex gap-2">
                <button
                    type="submit"
                    disabled={busy}
                    className="rounded-lg bg-amber-400 px-4 py-2 text-xs font-bold text-black hover:bg-amber-300 disabled:opacity-60"
                >
                    {busy ? "Sending..." : "Send"}
                </button>
                <button
                    type="button"
                    onClick={() => setOpen(false)}
                    className="rounded-lg border border-white/15 px-4 py-2 text-xs font-semibold text-white/80 hover:bg-white/10"
                >
                    Cancel
                </button>
            </div>
        </form>
    );
}
