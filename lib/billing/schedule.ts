// Turns the free-text pickup frequency a customer typed into concrete dates.
// It can't understand everything people write, so anything unrecognised falls
// back to weekly and is flagged for the admin to review.

export type Frequency =
    | { kind: "daily" }
    | { kind: "perWeek"; times: number }
    // Named days, Sunday = 0 ... Saturday = 6, for example Monday and Thursday.
    | { kind: "weekdays"; days: number[] }
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

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const DAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const DAY_WORDS: [RegExp, number][] = [
    [/\bmon(?:day)?s?\b/, 1],
    [/\btue(?:s|sday)?s?\b/, 2],
    [/\bwed(?:nesday)?s?\b/, 3],
    [/\bthu(?:r|rs|rsday)?s?\b/, 4],
    [/\bfri(?:day)?s?\b/, 5],
    [/\bsat(?:urday)?s?\b/, 6],
];

// "Monday, Wednesday and Friday", "Mon/Wed/Fri", "every Tuesday", "Monday to Friday".
function namedDays(text: string): number[] {
    const range = text.match(/\b(mon\w*)\s*(?:-|to|through|till|until)\s*(fri\w*|sat\w*)\b/);
    if (range) return range[2].startsWith("sat") ? [1, 2, 3, 4, 5, 6] : [1, 2, 3, 4, 5];
    if (/\bweek\s?days\b/.test(text)) return [1, 2, 3, 4, 5];

    return DAY_WORDS.filter(([pattern]) => pattern.test(text)).map(([, day]) => day);
}

export function parseFrequency(input: string | null | undefined): Frequency {
    const text = (input ?? "").toLowerCase().replace(/^custom\s*[:\-]?\s*/, "").trim();

    if (!text) return { kind: "unknown" };

    if (/\b(bi-?weekly|fortnight(ly)?|every\s+(2|two)\s+weeks?)\b/.test(text)) return { kind: "everyNDays", days: 14 };
    if (/\b(monthly|once\s+(a|per|every)\s+month|every\s+month|every\s+4\s+weeks?)\b/.test(text)) return { kind: "monthly" };
    if (/\b(daily|every\s*day|everyday)\b/.test(text)) return { kind: "daily" };

    // Days the customer named win over a count: "twice a week, Tuesday and Friday".
    const named = namedDays(text);
    if (named.length > 0) return { kind: "weekdays", days: named };

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
            return frequency.times === 1
                ? "Once a week"
                : `${frequency.times} times a week (${(WEEKLY_PATTERNS[frequency.times] ?? []).map((d) => DAY_SHORT[d]).join(", ")})`;
        case "weekdays":
            return frequency.days.length === 1
                ? `Every ${DAY_NAMES[frequency.days[0]]}`
                : `Every ${frequency.days.map((d) => DAY_SHORT[d]).join(", ")}`;
        case "everyNDays":
            return `Every ${frequency.days} days`;
        case "monthly":
            return "Once a month";
        default:
            return "Not recognised (defaulting to weekly)";
    }
}

// What an admin can pick to override what was read from the property details.
export const FREQUENCY_CHOICES: { key: string; label: string; text: string }[] = [
    { key: "daily", label: "Daily (Mon to Sat)", text: "daily" },
    { key: "weekly", label: "Once a week", text: "weekly" },
    { key: "twice", label: "Twice a week (Mon, Thu)", text: "twice a week" },
    { key: "thrice", label: "3 times a week (Mon, Wed, Fri)", text: "3 times a week" },
    { key: "biweekly", label: "Every 2 weeks", text: "bi-weekly" },
    { key: "monthly", label: "Once a month", text: "monthly" },
];

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

    if (frequency.kind === "weekdays") {
        // Sundays are never used, even if they were asked for.
        const days = frequency.days.filter((d) => d !== 0);
        for (let ms = start; ms <= end; ms += DAY_MS) {
            if (days.includes(weekday(ms))) dates.push(toKey(ms));
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
