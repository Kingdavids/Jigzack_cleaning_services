import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import type { LucideIcon } from "lucide-react";

interface StatCardProps {
    label: string;
    value: string;
    helper?: string;
    icon?: LucideIcon;
    // When set, the whole card links to the page that holds the detail.
    href?: string;
    // Draws attention to a number that needs someone to act on it.
    tone?: "default" | "alert";
}

export default function StatCard({ label, value, helper, icon: Icon, href, tone = "default" }: StatCardProps) {
    const body = (
        <>
            <div className="flex items-start justify-between gap-3">
                <p className="text-sm font-medium text-white/55">{label}</p>
                {Icon && (
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-400 text-black">
                        <Icon className="h-4 w-4" />
                    </div>
                )}
            </div>
            <p
                className={`mt-2 text-2xl font-bold tracking-tight md:text-3xl ${
                    tone === "alert" ? "text-amber-300" : "text-white"
                }`}
            >
                {value}
            </p>
            {helper && <p className="mt-2 text-sm leading-relaxed text-white/45">{helper}</p>}
            {href && (
                <ArrowUpRight className="absolute bottom-4 right-4 h-4 w-4 text-white/25 transition group-hover:text-amber-300" />
            )}
        </>
    );

    const className = "relative block rounded-2xl border border-white/10 bg-white/[0.03] p-5 transition hover:border-white/20";

    if (!href) return <div className={className}>{body}</div>;

    return (
        <Link
            href={href}
            className={`group ${className} hover:bg-white/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300/60`}
        >
            {body}
        </Link>
    );
}
