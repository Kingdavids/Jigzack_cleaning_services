// Turns the free-text pickup frequency a customer typed into concrete dates.
// It can't understand everything people write, so anything unrecognised falls
// back to weekly and is flagged for the admin to review.

export type Frequency =
    | { kind: "daily" }
    | { kind: "perWeek"; times: number }
    | { kind: "everyNDays"; days: number }
    | { kind: "monthly" }
    | { kind: "unknown" };

const WORD_NUMBERS: Record<string, number> = {
    once: 1,
    one: 1,
    twice: 2,
    two: 2,
    thrice: 3,
    three: 3,
    four: 4,
    five: 5,
    six: 6,
};

const toNumber = (value: string) => WORD_NUMBERS[value] ?? parseInt(value, 10);

export function parseFrequency(input: string | null | undefined): Frequency {
    const text = (input ?? "").toLowerCase().replace(/^custom\s*[:\-]?\s*/, "").trim();

    if (!text) return { kind: "unknown" };

    if (/\b(bi-?weekly|fortnight(ly)?|every\s+(2|two)\s+weeks?)\b/.test(text)) return { kind: "everyNDays", days: 14 };
    if (/\b(monthly|once\s+(a|per|every)\s+month|every\s+month|every\s+4\s+weeks?)\b/.test(text)) return { kind: "monthly" };
    if (/\b(daily|every\s*day|everyday)\b/.test(text)) return { kind: "daily" };

    const perMonth = text.match(/(\d+|once|twice|thrice|two|three|four)\s*(?:x|times?)?\s*(?:a|per|each|every)\s*month/);
    if (perMonth) {
        const times = toNumber(perMonth[1]);
        if (times >= 1) return { kind: "everyNDays", days: Math.max(1, Math.round(30 / times)) };
    }

    const perWeek = text.match(/(\d+|once|twice|thrice|two|three|four|five|six)\s*(?:x|times?)?\s*(?:a|per|each|every)\s*week/);
    if (perWeek) {
        const times = toNumber(perWeek[1]);
        if (times >= 1) return { kind: "perWeek", times: Math.min(times, 6) };
    }

    const everyWeeks = text.match(/every\s*(\d+|two|three|four)\s*weeks?/);
    if (everyWeeks) return { kind: "everyNDays", days: toNumber(everyWeeks[1]) * 7 };

    const everyDays = text.match(/every\s*(\d+)\s*days?/);
    if (everyDays) return { kind: "everyNDays", days: Math.max(1, parseInt(everyDays[1], 10)) };

    if (/\bweekly\b|once\s+(a|per)\s+week|every\s+week/.test(text)) return { kind: "perWeek", times: 1 };

    return { kind: "unknown" };
}

export function describeFrequency(frequency: Frequency) {
    switch (frequency.kind) {
        case "daily":
            return "Every day (Mon to Sat)";
        case "perWeek":
            return frequency.times === 1 ? "Once a week" : `${frequency.times} times a week`;
        case "everyNDays":
            return `Every ${frequency.days} days`;
        case "monthly":
            return "Once a month";
        default:
            return "Not recognised (defaulting to weekly)";
    }
}

// Mon = 1 ... Sat = 6
const WEEKLY_PATTERNS: Record<number, number[]> = {
    2: [1, 4],
    3: [1, 3, 5],
    4: [1, 2, 4, 5],
    5: [1, 2, 3, 4, 5],
    6: [1, 2, 3, 4, 5, 6],
};

const DAY_MS = 86_400_000;

const fromKey = (key: string) => {
    const [y, m, d] = key.split("-").map(Number);
    return Date.UTC(y, m - 1, d);
};

const toKey = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export function todayKey(now: Date = new Date()) {
    const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
    return local.toISOString().slice(0, 10);
}

export function addDays(key: string, days: number) {
    return toKey(fromKey(key) + days * DAY_MS);
}

// Dates (YYYY-MM-DD) from `startKey` up to `horizonDays` later. Sundays are
// skipped for anything that would otherwise land on one.
export function generateDates(input: Frequency, startKey: string, horizonDays = 28): string[] {
    const frequency: Frequency = input.kind === "unknown" ? { kind: "perWeek", times: 1 } : input;
    const start = fromKey(startKey);
    const end = start + horizonDays * DAY_MS;
    const dates: string[] = [];

    const weekday = (ms: number) => new Date(ms).getUTCDay();
    const nextNonSunday = (ms: number) => (weekday(ms) === 0 ? ms + DAY_MS : ms);

    if (frequency.kind === "daily") {
        for (let ms = start; ms <= end; ms += DAY_MS) {
            if (weekday(ms) !== 0) dates.push(toKey(ms));
        }
        return dates;
    }

    if (frequency.kind === "perWeek") {
        if (frequency.times === 1) {
            for (let ms = nextNonSunday(start); ms <= end; ms += 7 * DAY_MS) dates.push(toKey(ms));
            return dates;
        }

        const days = WEEKLY_PATTERNS[frequency.times] ?? WEEKLY_PATTERNS[3];
        for (let ms = start; ms <= end; ms += DAY_MS) {
            if (days.includes(weekday(ms))) dates.push(toKey(ms));
        }
        return dates;
    }

    if (frequency.kind === "everyNDays") {
        for (let ms = nextNonSunday(start); ms <= end; ms += frequency.days * DAY_MS) dates.push(toKey(ms));
        return dates;
    }

    // monthly: same calendar day each month
    const first = new Date(nextNonSunday(start));
    for (let i = 0; ; i++) {
        const ms = nextNonSunday(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + i, first.getUTCDate()));
        if (ms > end) break;
        dates.push(toKey(ms));
    }
    return dates;
}
