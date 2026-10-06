import type { SupabaseClient } from "@supabase/supabase-js";

// A tiny in-memory stand-in for the Supabase client, enough for the queries the
// billing and stock code makes. Tables that were not given behave like a table
// that doesn't exist yet, and `.or(...)` reports an error so the code's own
// fallback runs, the same as on a database that hasn't had a newer SQL file.

type Row = Record<string, unknown>;
type Result = { data: unknown; error: { message: string; code?: string } | null };

export function fakeSupabase(initial: Record<string, Row[]>) {
    const tables: Record<string, Row[]> = Object.fromEntries(Object.entries(initial).map(([name, rows]) => [name, rows.map((r) => ({ ...r }))]));
    let counter = 0;

    function query(table: string) {
        let op: "select" | "insert" | "update" | "delete" = "select";
        let payload: Row | Row[] | null = null;
        let single = false;
        let maybe = false;
        let failure: string | null = null;
        let max = Infinity;
        let sortBy: { column: string; ascending: boolean } | null = null;
        const filters: ((row: Row) => boolean)[] = [];

        const run = (): Result => {
            if (failure) return { data: null, error: { message: failure } };
            if (!(table in tables)) return { data: null, error: { message: `relation "public.${table}" does not exist`, code: "42P01" } };

            const rows = tables[table];
            const matches = (row: Row) => filters.every((f) => f(row));
            let out: Row[];

            if (op === "insert") {
                const added = (Array.isArray(payload) ? payload : [payload as Row]).map((r) => ({ id: `${table}-${++counter}`, ...r }));
                rows.push(...added);
                out = added;
            } else if (op === "update") {
                out = rows.filter(matches);
                for (const row of out) Object.assign(row, payload);
            } else if (op === "delete") {
                out = rows.filter(matches);
                tables[table] = rows.filter((r) => !out.includes(r));
            } else {
                out = rows.filter(matches);
            }

            if (sortBy) {
                const { column, ascending } = sortBy;
                out = [...out].sort((a, b) => (String(a[column] ?? "") < String(b[column] ?? "") ? -1 : 1) * (ascending ? 1 : -1));
            }

            out = out.slice(0, max).map((r) => ({ ...r }));

            if (single || maybe) {
                if (out.length === 0) return single ? { data: null, error: { message: "no rows" } } : { data: null, error: null };
                return { data: out[0], error: null };
            }

            return { data: out, error: null };
        };

        const q: Record<string, unknown> = {
            select: () => q,
            insert: (rows: Row | Row[]) => ((op = "insert"), (payload = rows), q),
            update: (changes: Row) => ((op = "update"), (payload = changes), q),
            delete: () => ((op = "delete"), q),
            eq: (column: string, value: unknown) => (filters.push((r) => r[column] === value), q),
            neq: (column: string, value: unknown) => (filters.push((r) => r[column] !== value), q),
            is: (column: string, value: unknown) => (filters.push((r) => (r[column] ?? null) === value), q),
            in: (column: string, values: unknown[]) => (filters.push((r) => values.includes(r[column])), q),
            gt: (column: string, value: number | string) => (filters.push((r) => (r[column] as number | string) > value), q),
            gte: (column: string, value: number | string) => (filters.push((r) => (r[column] as number | string) >= value), q),
            lt: (column: string, value: number | string) => (filters.push((r) => (r[column] as number | string) < value), q),
            not: (column: string, operator: string, value: unknown) => (filters.push((r) => (operator === "is" ? (r[column] ?? null) !== value : r[column] !== value)), q),
            order: (column: string, options?: { ascending?: boolean }) => ((sortBy = { column, ascending: options?.ascending !== false }), q),
            limit: (n: number) => ((max = n), q),
            or: () => ((failure = "or filters are not supported by the fake"), q),
            contains: () => ((failure = "contains is not supported by the fake"), q),
            single: () => ((single = true), q),
            maybeSingle: () => ((maybe = true), q),
            then: (resolve: (value: Result) => unknown) => resolve(run()),
        };

        return q;
    }

    const client = { from: (table: string) => query(table), rpc: () => ({ then: (resolve: (v: Result) => unknown) => resolve({ data: null, error: { message: "no such function" } }) }) };

    return { client: client as unknown as SupabaseClient, tables };
}
