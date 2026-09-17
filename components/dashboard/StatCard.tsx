interface StatCardProps {
    label: string;
    value: string;
    helper?: string;
}

export default function StatCard({ label, value, helper }: StatCardProps) {
    return (
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 transition hover:border-white/20">
            <p className="text-sm font-medium text-white/55">{label}</p>
            <p className="mt-2 text-2xl font-bold tracking-tight text-white md:text-3xl">{value}</p>
            {helper && <p className="mt-2 text-sm leading-relaxed text-white/45">{helper}</p>}
        </div>
    );
}