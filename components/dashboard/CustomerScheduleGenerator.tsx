'use client';

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { generateCustomerBilling, previewCustomerSchedule, type SchedulePreview } from "@/app/admin/actions";
import { FREQUENCY_CHOICES } from "@/lib/billing/schedule";

const dayLabel = (key: string) =>
    new Date(`${key}T00:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });

// Sets up pickups for one customer at a time. Choosing a customer reads how
// often they want pickups from their property details (daily, once a week,
// 3 times a week on Monday, Wednesday and Friday, named days and so on) and
// shows the exact dates before anything is created.
export default function CustomerScheduleGenerator({ customers }: { customers: { id: string; full_name: string | null }[] }) {
    const router = useRouter();
    const [customerId, setCustomerId] = useState("");
    const [override, setOverride] = useState("");
    const [preview, setPreview] = useState<SchedulePreview | null>(null);
    const [loading, setLoading] = useState(false);
    const [busy, setBusy] = useState(false);
    // Ignore an answer that arrives after the admin has already chosen someone else.
    const latest = useRef(0);

    const overrideText = (key: string) => FREQUENCY_CHOICES.find((c) => c.key === key)?.text ?? null;

    const load = async (id: string, key: string) => {
        const ticket = ++latest.current;

        if (!id) {
            setPreview(null);
            return;
        }

        setLoading(true);
        const result = await previewCustomerSchedule(id, overrideText(key));

        if (ticket !== latest.current) return;

        setLoading(false);
        setPreview(result);

        if (!result.success) toast.error(result.error ?? "Could not read that customer.");
    };

    const chooseCustomer = (id: string) => {
        setCustomerId(id);
        setOverride("");
        void load(id, "");
    };

    const chooseFrequency = (key: string) => {
        setOverride(key);
        void load(customerId, key);
    };

    const generate = async () => {
        if (!customerId) return;

        setBusy(true);
        const result = await generateCustomerBilling(customerId, "schedule", overrideText(override));
        setBusy(false);

        if (result.success) toast.success(result.message);
        else toast.error(result.message);

        await load(customerId, override);
        router.refresh();
    };

    const dates = preview?.dates ?? [];

    return (
        <div className="space-y-3">
            <select
                value={customerId}
                onChange={(e) => chooseCustomer(e.target.value)}
                aria-label="Customer"
                className="h-12 w-full rounded-xl border border-white/10 bg-[#141518] px-3 text-base text-white outline-none sm:h-11 sm:w-80 sm:text-sm"
            >
                <option value="">Choose a customer</option>
                {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                        {c.full_name ?? "Unnamed customer"}
                    </option>
                ))}
            </select>

            {customerId && (
                <div className="space-y-3 rounded-2xl border border-white/10 bg-black/20 p-4">
                    {loading && !preview ? (
                        <p className="text-sm text-white/50">Reading their property details…</p>
                    ) : preview?.success ? (
                        <>
                            <div>
                                <p className="text-xs uppercase tracking-[0.12em] text-white/40">From their property details</p>
                                <p className="mt-0.5 text-sm text-white/80">
                                    {preview.source ? <>They asked for: <span className="font-semibold text-white">“{preview.source}”</span></> : "No pickup frequency on file."}
                                </p>
                                <p className={`mt-1 text-base font-bold ${preview.recognised ? "text-amber-300" : "text-red-300"}`}>
                                    {override
                                        ? `Using: ${FREQUENCY_CHOICES.find((c) => c.key === override)?.label}`
                                        : preview.recognised
                                            ? preview.label
                                            : "Could not be read, so it would be weekly"}
                                </p>
                            </div>

                            {!preview.recognised && !override && (
                                <p className="rounded-lg border border-red-400/25 bg-red-500/10 px-3 py-2 text-sm text-red-200">
                                    We could not tell how often from what they wrote. Pick the right one below.
                                </p>
                            )}

                            <label className="block text-xs text-white/50">
                                Change how often (optional)
                                <select
                                    value={override}
                                    onChange={(e) => chooseFrequency(e.target.value)}
                                    className="mt-1 h-11 w-full rounded-lg border border-white/10 bg-[#141518] px-2 text-base text-white outline-none sm:text-sm"
                                >
                                    <option value="">Use what is in their property details</option>
                                    {FREQUENCY_CHOICES.map((choice) => (
                                        <option key={choice.key} value={choice.key}>
                                            {choice.label}
                                        </option>
                                    ))}
                                </select>
                            </label>

                            <div>
                                <p className="text-sm text-white/70">
                                    {dates.length === 0
                                        ? "Nothing new to add over the next 4 weeks."
                                        : `${dates.length} new pickup${dates.length === 1 ? "" : "s"} over the next 4 weeks:`}
                                    {(preview.alreadyScheduled ?? 0) > 0 && (
                                        <span className="text-white/45"> {preview.alreadyScheduled} already scheduled.</span>
                                    )}
                                </p>
                                {dates.length > 0 && (
                                    <div className="mt-2 flex max-h-40 flex-wrap gap-1.5 overflow-y-auto">
                                        {dates.map((date) => (
                                            <span
                                                key={date}
                                                className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-white/80"
                                            >
                                                {dayLabel(date)}
                                            </span>
                                        ))}
                                    </div>
                                )}
                            </div>

                            <button
                                type="button"
                                disabled={busy || loading || dates.length === 0}
                                onClick={generate}
                                className="h-12 w-full rounded-xl bg-amber-400 px-4 text-sm font-bold text-black transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-50 sm:h-11 sm:w-auto"
                            >
                                {busy ? "Generating…" : dates.length > 0 ? `Generate ${dates.length} pickup${dates.length === 1 ? "" : "s"}` : "Generate schedule"}
                            </button>
                        </>
                    ) : (
                        <p className="text-sm text-red-300">{preview?.error ?? "Could not read that customer."}</p>
                    )}
                </div>
            )}
        </div>
    );
}
