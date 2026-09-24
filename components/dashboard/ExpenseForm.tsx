'use client';

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { submitExpense } from "@/app/employee/actions";
import { EXPENSE_CATEGORIES } from "@/lib/expenses";

const fieldClass =
    "h-11 w-full rounded-xl border border-white/10 bg-white/8 px-3 text-sm text-white outline-none placeholder:text-white/30 focus:border-amber-300/50";

// Staff log an expense: amount, category, note, date, optional job and receipt.
// Photos are shrunk on the phone first, the same way task photos are.
export default function ExpenseForm({
                                        tasks,
                                        today,
                                        earliest,
                                    }: {
    tasks: { id: string; label: string }[];
    today: string;
    earliest: string;
}) {
    const router = useRouter();
    const formRef = useRef<HTMLFormElement>(null);
    const [busy, setBusy] = useState(false);

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (busy) return;

        const form = e.currentTarget;
        const data = new FormData(form);
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

            const result = await submitExpense(data);

            if (!result?.success) {
                toast.error(result?.error ?? "Could not save this expense.");
                return;
            }

            toast.success("Expense sent to the admin");
            form.reset();
            router.refresh();
        } finally {
            setBusy(false);
        }
    };

    return (
        <form ref={formRef} onSubmit={handleSubmit} className="grid gap-3">
            <div className="grid gap-3 sm:grid-cols-2">
                <div>
                    <label htmlFor="expense-amount" className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-white/50">
                        Amount (₦)
                    </label>
                    <input
                        id="expense-amount"
                        name="amount"
                        type="number"
                        inputMode="decimal"
                        min="1"
                        step="0.01"
                        required
                        placeholder="e.g. 5000"
                        className={fieldClass}
                    />
                </div>
                <div>
                    <label htmlFor="expense-category" className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-white/50">
                        Category
                    </label>
                    <select
                        id="expense-category"
                        name="category"
                        required
                        defaultValue=""
                        className={`${fieldClass} bg-[#141518]`}
                    >
                        <option value="" disabled>
                            Choose one
                        </option>
                        {EXPENSE_CATEGORIES.map((c) => (
                            <option key={c.value} value={c.value}>
                                {c.label}
                            </option>
                        ))}
                    </select>
                </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
                <div>
                    <label htmlFor="expense-date" className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-white/50">
                        Date
                    </label>
                    <input
                        id="expense-date"
                        name="date"
                        type="date"
                        required
                        defaultValue={today}
                        min={earliest}
                        max={today}
                        className={fieldClass}
                    />
                </div>
                <div>
                    <label htmlFor="expense-task" className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-white/50">
                        For which job (optional)
                    </label>
                    <select id="expense-task" name="taskId" defaultValue="" className={`${fieldClass} bg-[#141518]`}>
                        <option value="">Not tied to a job</option>
                        {tasks.map((t) => (
                            <option key={t.id} value={t.id}>
                                {t.label}
                            </option>
                        ))}
                    </select>
                </div>
            </div>

            <div>
                <label htmlFor="expense-note" className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-white/50">
                    What was it for?
                </label>
                <textarea
                    id="expense-note"
                    name="note"
                    required
                    minLength={3}
                    maxLength={500}
                    placeholder="e.g. Diesel for the truck, Ikeja route"
                    className="min-h-[80px] w-full rounded-xl border border-white/10 bg-white/8 px-3 py-2 text-sm text-white outline-none placeholder:text-white/30 focus:border-amber-300/50"
                />
            </div>

            <div>
                <label htmlFor="expense-receipt" className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-white/50">
                    Receipt photo or PDF (optional)
                </label>
                <input
                    id="expense-receipt"
                    name="receipt"
                    type="file"
                    accept="image/*,application/pdf"
                    className="block w-full text-sm text-white/70 file:mr-3 file:rounded-lg file:border-0 file:bg-white/10 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-white/15"
                />
            </div>

            <button
                type="submit"
                disabled={busy}
                className="h-11 rounded-xl bg-amber-400 px-5 text-sm font-bold text-black transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-60"
            >
                {busy ? "Sending..." : "Send to admin"}
            </button>
        </form>
    );
}
