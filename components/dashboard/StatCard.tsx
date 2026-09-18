import type { LucideIcon } from "lucide-react";

interface StatCardProps {
    label: string;
    value: string;
    helper?: string;
    icon?: LucideIcon;
}

export default function StatCard({ label, value, helper, icon: Icon }: StatCardProps) {
    return (
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 transition hover:border-white/20">
            <div className="flex items-start justify-between gap-3">
                <p className="text-sm font-medium text-white/55">{label}</p>
                {Icon && (
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-400 text-black">
                        <Icon className="h-4 w-4" />
                    </div>
                )}
            </div>
            <p className="mt-2 text-2xl font-bold tracking-tight text-white md:text-3xl">{value}</p>
            {helper && <p className="mt-2 text-sm leading-relaxed text-white/45">{helper}</p>}
        </div>
    );
}