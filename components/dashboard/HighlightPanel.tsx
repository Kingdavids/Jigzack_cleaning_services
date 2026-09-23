import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { ReactNode } from "react";

// A short "what needs a look" panel for the dashboard. It shows a handful of
// rows and links to the full page, so the detail stays in one place.
export default function HighlightPanel({
                                            title,
                                            href,
                                            linkLabel,
                                            empty,
                                            children,
                                        }: {
    title: string;
    href: string;
    linkLabel: string;
    // Shown instead of the rows when there is nothing to list.
    empty?: string;
    children?: ReactNode;
}) {
    return (
        <section className="flex flex-col rounded-2xl border border-white/10 bg-white/[0.03] p-5">
            <div className="mb-3 flex items-center justify-between gap-3 border-b border-white/8 pb-3">
                <h2 className="text-base font-bold tracking-tight">
                    {title}
                    <span className="text-amber-300">.</span>
                </h2>
                <Link
                    href={href}
                    className="inline-flex items-center gap-1 text-sm font-semibold text-amber-300 transition hover:text-amber-200"
                >
                    {linkLabel}
                    <ArrowRight className="h-3.5 w-3.5" />
                </Link>
            </div>

            {empty ? <p className="py-4 text-sm text-white/45">{empty}</p> : <div className="flex-1">{children}</div>}
        </section>
    );
}

// One clickable row inside a panel.
export function PanelRow({
                              href,
                              primary,
                              secondary,
                              aside,
                          }: {
    href: string;
    primary: string;
    secondary?: string;
    aside?: ReactNode;
}) {
    return (
        <Link
            href={href}
            className="-mx-2 flex items-center justify-between gap-3 rounded-lg px-2 py-2.5 transition hover:bg-white/[0.05]"
        >
            <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{primary}</p>
                {secondary && <p className="truncate text-xs text-white/50">{secondary}</p>}
            </div>
            {aside && <div className="shrink-0 text-right text-sm">{aside}</div>}
        </Link>
    );
}
