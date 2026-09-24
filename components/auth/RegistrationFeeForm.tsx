'use client';

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { reportRegistrationFee } from "@/lib/payment-actions";

// "I have paid": an optional note and receipt, then the admin is told.
export default function RegistrationFeeForm() {
    const router = useRouter();
    const [busy, setBusy] = useState(false);

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (busy) return;

        const data = new FormData(e.currentTarget);
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

            const result = await reportRegistrationFee(data);

            if (!result?.success) {
                toast.error(result?.error ?? "Could not send this.");
                return;
            }

            toast.success("Thank you. We will confirm your payment shortly.");
            router.refresh();
        } finally {
            setBusy(false);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="mt-6 space-y-4 text-left">
            <div>
                <label htmlFor="fee-note" className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-white/50">
                    Name on the transfer or reference (optional)
                </label>
                <input
                    id="fee-note"
                    name="note"
                    maxLength={300}
                    placeholder="e.g. Transfer from Ada Obi, 12 March"
                    className="h-11 w-full rounded-xl border border-white/10 bg-white/8 px-3 text-sm text-white outline-none placeholder:text-white/30 focus:border-amber-300/50"
                />
            </div>

            <div>
                <label htmlFor="fee-receipt" className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-white/50">
                    Receipt photo or PDF (optional)
                </label>
                <input
                    id="fee-receipt"
                    name="receipt"
                    type="file"
                    accept="image/*,application/pdf"
                    className="block w-full text-sm text-white/70 file:mr-3 file:rounded-lg file:border-0 file:bg-white/10 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-white/15"
                />
            </div>

            <button
                type="submit"
                disabled={busy}
                className="h-12 w-full rounded-xl bg-amber-400 font-bold text-black transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-60"
            >
                {busy ? "Sending..." : "I have paid"}
            </button>
        </form>
    );
}
