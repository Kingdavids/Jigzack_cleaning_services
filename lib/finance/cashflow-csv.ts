import { categoryLabel } from "@/lib/expenses";
import { INFLOW_SOURCES, monthName, recyclablesProfit, type MonthFlow } from "@/lib/finance/cashflow";

// The Money in & out figures as a spreadsheet: one month in detail, then the
// months side by side. Amounts are plain numbers so a spreadsheet can add them.

// A cell that starts with = + - @ would run as a formula when opened in Excel,
// and a few of these (payment methods) come from what an admin typed.
function cell(value: string | number) {
    const text = typeof value === "number" ? String(Math.round(value * 100) / 100) : value.replace(/^([=+\-@\t\r])/, "'$1");

    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

const line = (...cells: (string | number)[]) => cells.map(cell).join(",");

export function cashflowCsv(flows: MonthFlow[], month: string) {
    const current = flows.find((f) => f.month === month) ?? flows[flows.length - 1];
    const trade = recyclablesProfit(current);

    const rows: string[] = [
        line("Money in & out", monthName(current.month)),
        "",
        line("Summary", "Amount (NGN)"),
        line("Money in", current.inTotal),
        line("Money out", current.outTotal),
        line("Net", current.inTotal - current.outTotal),
        line("Recyclables sold (received)", trade.sold),
        line("Recyclables bought", trade.bought),
        line("Recyclables handling costs", trade.costs),
        line("Recyclables profit", trade.profit),
        line("Expense claims waiting (not counted)", current.waiting.amount),
        "",
        line("Money in by source", "Amount (NGN)", "Payments"),
        ...INFLOW_SOURCES.map((s) => line(s.label, current.inBySource[s.key].amount, current.inBySource[s.key].count)),
        "",
        line("Money in by method", "Amount (NGN)"),
        ...Object.entries(current.inByMethod)
            .sort((a, b) => b[1] - a[1])
            .map(([method, amount]) => line(method, amount)),
        "",
        line("Money out by category", "Amount (NGN)", "Entries"),
        ...Object.entries(current.outByCategory)
            .filter(([, v]) => v.amount > 0)
            .sort((a, b) => b[1].amount - a[1].amount)
            .map(([category, v]) => line(category === "recyclables" ? "Recyclables purchases" : categoryLabel(category), v.amount, v.count)),
        "",
        line("Month by month", "Money in", "Money out", "Net", "Recyclables sold", "Recyclables bought", "Recyclables other costs", "Recyclables profit"),
        ...flows.map((f) => {
            const t = recyclablesProfit(f);
            return line(monthName(f.month), f.inTotal, f.outTotal, f.inTotal - f.outTotal, t.sold, t.bought, t.costs, t.profit);
        }),
    ];

    // The byte order mark makes Excel read the file as UTF-8.
    return `﻿${rows.join("\r\n")}\r\n`;
}
