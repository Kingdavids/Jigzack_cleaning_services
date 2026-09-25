'use client';

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
    generateCustomerBilling,
    previewCustomerSchedule,
    type ScheduleRequest,
    type SchedulePreview,
} from "@/app/admin/actions";
import { DAY_SHORT, DAYS_FOR_TIMES, monthWindow, type SchedulePeriod } from "@/lib/billing/schedule";

const WEEK_DAYS = [1, 2, 3, 4, 5, 6];

const TIMES: { times: number; label: string }[] = [
    { times: 1, label: "Once a week" },
    { times: 2, label: "Twice a week" },
    { times: 3, label: "3 times a week" },
    { times: 4, label: "4 times" },
    { times: 5, label: "5 times" },
    { times: 6, label: "Daily (Mon to Sat)" },
];

// "Every 2 weeks" and "Once a month" are not days of the week, so they have their own switch.
const OTHER: { key: string; label: string; text: string }[] = [
    { key: "biweekly", label: "Every 2 weeks", text: "bi-weekly" },
    { key: "monthly", label: "Once a month", text: "monthly" },
];

const dayLabel = (key: string) =>
    new Date(`${key}T00:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });

const chip = (on: boolean) =>
    `min-h-11 rounded-xl border px-3.5 text-sm font-semibold transition sm:min-h-9 sm:px-3 sm:text-xs ${
        on ? "border-amber-400/60 bg-amber-400/15 text-amber-200" : "border-white/10 bg-white/5 text-white/70 hover:bg-white/10"
    }`;

// Sets up pickups for one customer at a time, for a whole month. It reads how
// often they want pickups from their property details, asks how many times a
// week and on which days (3 times a week is Monday, Wednesday and Friday), and
// lists the exact dates before anything is created.
export default function CustomerScheduleGenerator({ customers }: { customers: { id: string; full_name: string | null }[] }) {
    const router = useRouter();
    const [customerId, setCustomerId] = useState("");
    const [days, setDays] = useState<number[]>([]);
    const [other, setOther] = useState("");
    const [period, setPeriod] = useState<SchedulePeriod>("thisMonth");
    const [remember, setRemember] = useState(true);
    const [preview, setPreview] = useState<SchedulePreview | null>(null);
    const [loading, setLoading] = useState(false);
    const [busy, setBusy] = useState(false);
    // Ignore an answer that arrives after the admin has already changed something.
    const latest = useRef(0);

    const requestFor = (chosenDays: number[], chosenOther: string, chosenPeriod: SchedulePeriod): ScheduleRequest => {
        if (chosenOther) return { frequencyText: OTHER.find((o) => o.key === chosenOther)?.text ?? null, period: chosenPeriod };
        if (chosenDays.length > 0) return { days: chosenDays, period: chosenPeriod, remember };

        return { period: chosenPeriod };
    };

    const load = async (id: string, chosenDays: number[], chosenOther: string, chosenPeriod: SchedulePeriod, firstLoad = false) => {
        const ticket = ++latest.current;

        if (!id) {
            setPreview(null);
            return;
        }

        setLoading(true);
        const result = await previewCustomerSchedule(id, requestFor(chosenDays, chosenOther, chosenPeriod));

        if (ticket !== latest.current) return;

        setLoading(false);
        setPreview(result);

        if (!result.success) {
            toast.error(result.error ?? "Could not read that customer.");
            return;
        }

        // First time for this customer: fill in what their record says.
        if (firstLoad) setDays(result.suggestedDays ?? []);
    };

    const chooseCustomer = (id: string) => {
        setCustomerId(id);
        setDays([]);
        setOther("");
        void load(id, [], "", period, true);
    };

    const setDaysAndLoad = (next: number[]) => {
        const sorted = [...new Set(next)].sort();
        setDays(sorted);
        setOther("");
        void load(customerId, sorted, "", period);
    };

    const toggleDay = (day: number) => setDaysAndLoad(days.includes(day) ? days.filter((d) => d !== day) : [...days, day]);

    const chooseOther = (key: string) => {
        const next = other === key ? "" : key;
        setOther(next);
        if (next) setDays([]);
        void load(customerId, next ? [] : days, next, period);
    };

    const choosePeriod = (next: SchedulePeriod) => {
        setPeriod(next);
        void load(customerId, days, other, next);
    };

    const generate = async () => {
        if (!customerId) return;

        setBusy(true);
        const result = await generateCustomerBilling(customerId, "schedule", requestFor(days, other, period));
        setBusy(false);

        if (result.success) toast.success(result.message);
        else toast.error(result.message);

        await load(customerId, days, other, period);
        router.refresh();
    };

    const dates = preview?.dates ?? [];
    const thisMonth = monthWindow("thisMonth");
    const nextMonth = monthWindow("nextMonth");
    const timesNow = other ? 0 : days.length;
    const noPattern = !other && days.length === 0;

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
                <div className="space-y-4 rounded-2xl border border-white/10 bg-black/20 p-4">
                    {loading && !preview ? (
                        <p className="text-sm text-white/50">Reading their property details…</p>
                    ) : preview?.success ? (
                        <>
                            <div>
                                <p className="text-xs uppercase tracking-[0.12em] text-white/40">From their record</p>
                                <p className="mt-0.5 text-sm text-white/80">
                                    {preview.savedDays
                                        ? "Pickup days saved by an admin."
                                        : preview.source
                                            ? <>They asked for: <span className="font-semibold text-white">“{preview.source}”</span></>
                                            : "No pickup frequency on file."}
                                </p>
                                {!preview.recognised && !preview.savedDays && !days.length && !other && (
                                    <p className="mt-2 rounded-lg border border-red-400/25 bg-red-500/10 px-3 py-2 text-sm text-red-200">
                                        We could not tell how often from what they wrote. Choose below.
                                    </p>
                                )}
                            </div>

                            <div>
                                <p className="text-sm font-semibold text-white">Is it 3 times a week? How many times a week?</p>
                                <div className="mt-2 flex flex-wrap gap-2">
                                    {TIMES.map((t) => (
                                        <button
                                            key={t.times}
                                            type="button"
                                            onClick={() => setDaysAndLoad(DAYS_FOR_TIMES[t.times])}
                                            className={chip(timesNow === t.times)}
                                        >
                                            {t.label}
                                        </button>
                                    ))}
                                    {OTHER.map((o) => (
                                        <button key={o.key} type="button" onClick={() => chooseOther(o.key)} className={chip(other === o.key)}>
                                            {o.label}
                                        </button>
                                    ))}
                                </div>
                                {timesNow === 3 && days.join(",") === "1,3,5" && (
                                    <p className="mt-1.5 text-xs text-white/45">3 times a week is usually Monday, Wednesday and Friday.</p>
                                )}
                            </div>

                            {!other && (
                                <div>
                                    <p className="text-sm font-semibold text-white">Which days?</p>
                                    <div className="mt-2 flex flex-wrap gap-2">
                                        {WEEK_DAYS.map((day) => (
                                            <button key={day} type="button" onClick={() => toggleDay(day)} className={chip(days.includes(day))}>
                                                {DAY_SHORT[day]}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}

                            <div>
                                <p className="text-sm font-semibold text-white">Generate for the month</p>
                                <div className="mt-2 flex flex-wrap gap-2">
                                    <button type="button" onClick={() => choosePeriod("thisMonth")} className={chip(period === "thisMonth")}>
                                        {thisMonth.label.charAt(0).toUpperCase() + thisMonth.label.slice(1)}
                                    </button>
                                    <button type="button" onClick={() => choosePeriod("nextMonth")} className={chip(period === "nextMonth")}>
                                        {nextMonth.label}
                                    </button>
                                </div>
                            </div>

                            <div>
                                <p className="text-sm text-white/70">
                                    {noPattern
                                        ? "Choose how often above to see the dates."
                                        : dates.length === 0
                                            ? `Nothing new to add for ${preview.windowLabel}.`
                                            : `${dates.length} new pickup${dates.length === 1 ? "" : "s"} for ${preview.windowLabel}:`}
                                    {(preview.alreadyScheduled ?? 0) > 0 && (
                                        <span className="text-white/45"> {preview.alreadyScheduled} already scheduled.</span>
                                    )}
                                </p>
                                {dates.length > 0 && (
                                    <div className="mt-2 flex max-h-44 flex-wrap gap-1.5 overflow-y-auto">
                                        {dates.map((date) => (
                                            <span key={date} className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-white/80">
                                                {dayLabel(date)}
                                            </span>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {days.length > 0 && !other && (
                                <label className="flex min-h-11 cursor-pointer items-center gap-2.5 text-sm text-white/70">
                                    <input
                                        type="checkbox"
                                        checked={remember}
                                        onChange={(e) => setRemember(e.target.checked)}
                                        className="h-4 w-4 accent-amber-400"
                                    />
                                    Remember these days for this customer
                                </label>
                            )}

                            <button
                                type="button"
                                disabled={busy || loading || dates.length === 0}
                                onClick={generate}
                                className="h-12 w-full rounded-xl bg-amber-400 px-4 text-sm font-bold text-black transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-50 sm:h-11 sm:w-auto"
                            >
                                {busy
                                    ? "Generating…"
                                    : dates.length > 0
                                        ? `Generate ${dates.length} pickup${dates.length === 1 ? "" : "s"} for ${preview.windowLabel}`
                                        : "Generate schedule"}
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
