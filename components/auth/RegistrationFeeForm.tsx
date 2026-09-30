'use client';

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { reportRegistrationFee } from "@/lib/payment-actions";

const PAYMENT_MODES = ["Bank transfer", "Cash", "POS / card", "Other"];

// Existing customer: no transfer to make, so the report goes straight to an
// admin for verification. New customer: pick how they paid first, then the
// "I just paid" button unlocks. Reporting a forgotten receipt afterward skips
// straight to the form, since that choice was already made the first time.
export default function RegistrationFeeForm({ reported = false }: { reported?: boolean }) {
    const router = useRouter();
    const [busy, setBusy] = useState(false);
    const [customerType, setCustomerType] = useState<"existing" | "new" | null>(reported ? "new" : null);
    const [mode, setMode] = useState("");

    const send = async (formData: FormData) => {
        setBusy(true);

        try {
            const receipt = formData.get("receipt");

            if (receipt instanceof File && receipt.size > 0 && receipt.type.startsWith("image/")) {
                try {
                    const imageCompression = (await import("browser-image-compression")).default;
                    const compressed = await imageCompression(receipt, {
                        maxSizeMB: 1.2,
                        maxWidthOrHeight: 1600,
                        useWebWorker: true,
                        fileType: "image/jpeg",
                    });
                    formData.set("receipt", new File([compressed], "receipt.jpg", { type: "image/jpeg" }));
                } catch {
                    toast.error("Couldn't process that photo. Try a JPEG or PNG, or a PDF.");
                    return;
                }
            }

            const result = await reportRegistrationFee(formData);

            if (!result?.success) {
                toast.error(result?.error ?? "Could not send this.");
                return;
            }

            toast.success(reported ? "Thank you. We have added it to your payment report." : "Thank you. We will confirm this shortly.");
            router.refresh();
        } finally {
            setBusy(false);
        }
    };

    const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (busy) return;

        const data = new FormData(e.currentTarget);
        const typedNote = String(data.get("note") ?? "").trim();

        if (!reported && customerType === "existing") {
            data.set("note", `Existing customer before the app, no transfer made.${typedNote ? ` ${typedNote}` : ""}`);
        } else if (!reported && customerType === "new") {
            data.set("note", `Paid by ${mode}.${typedNote ? ` ${typedNote}` : ""}`);
        }

        send(data);
    };

    if (!reported && customerType === null) {
        return (
            <div className="mt-6 space-y-3 text-left">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-white/50">Which one are you?</p>

                <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-white/10 bg-white/8 p-4 transition hover:border-emerald-300/40">
                    <input
                        type="radio"
                        name="customerType"
                        className="mt-1 h-4 w-4 accent-emerald-400"
                        onChange={() => setCustomerType("existing")}
                    />
                    <span className="text-sm">
                        <span className="block font-semibold text-emerald-300">I&apos;m an existing customer</span>
                        <span className="block text-white/60">I was already with Jigzack before this app. I have not made a transfer.</span>
                    </span>
                </label>

                <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-white/10 bg-white/8 p-4 transition hover:border-amber-300/40">
                    <input type="radio" name="customerType" className="mt-1 h-4 w-4 accent-amber-400" onChange={() => setCustomerType("new")} />
                    <span className="text-sm">
                        <span className="block font-semibold text-amber-300">I&apos;m a new customer, I just paid</span>
                        <span className="block text-white/60">I made the transfer above and want to report it.</span>
                    </span>
                </label>
            </div>
        );
    }

    return (
        <form onSubmit={handleSubmit} className="mt-6 space-y-4 text-left">
            {!reported && (
                <button
                    type="button"
                    onClick={() => setCustomerType(null)}
                    className="text-xs font-semibold text-white/50 underline underline-offset-2 hover:text-white"
                >
                    Back
                </button>
            )}

            {!reported && customerType === "new" && (
                <div>
                    <label htmlFor="fee-mode" className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-white/50">
                        Mode of payment
                    </label>
                    <select
                        id="fee-mode"
                        value={mode}
                        onChange={(e) => setMode(e.target.value)}
                        required
                        className="h-11 w-full rounded-xl border border-white/10 bg-[#141518] px-3 text-sm text-white outline-none focus:border-amber-300/50"
                    >
                        <option value="" disabled>
                            Select how you paid
                        </option>
                        {PAYMENT_MODES.map((m) => (
                            <option key={m} value={m}>
                                {m}
                            </option>
                        ))}
                    </select>
                </div>
            )}

            <div>
                <label htmlFor="fee-note" className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-white/50">
                    {reported
                        ? "Add a note (optional)"
                        : customerType === "existing"
                            ? "Anything else to add (optional)"
                            : "Name on the transfer or reference (optional)"}
                </label>
                <input
                    id="fee-note"
                    name="note"
                    maxLength={300}
                    placeholder={
                        customerType === "existing" ? "e.g. I signed up under a different phone number before" : "e.g. Transfer from Ada Obi, 12 March"
                    }
                    className="h-11 w-full rounded-xl border border-white/10 bg-white/8 px-3 text-sm text-white outline-none placeholder:text-white/30 focus:border-amber-300/50"
                />
            </div>

            {(reported || customerType === "new") && (
                <div>
                    <label htmlFor="fee-receipt" className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-white/50">
                        {reported ? "Receipt photo or PDF" : "Receipt photo or PDF (optional)"}
                    </label>
                    <input
                        id="fee-receipt"
                        name="receipt"
                        type="file"
                        accept="image/*,application/pdf"
                        className="block w-full text-sm text-white/70 file:mr-3 file:rounded-lg file:border-0 file:bg-white/10 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-white/15"
                    />
                </div>
            )}

            <button
                type="submit"
                disabled={busy || (!reported && customerType === "new" && !mode)}
                className="h-12 w-full rounded-xl bg-amber-400 font-bold text-black transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-60"
            >
                {busy ? "Sending..." : reported ? "Send receipt" : customerType === "existing" ? "I have paid" : "I just paid"}
            </button>
        </form>
    );
}
