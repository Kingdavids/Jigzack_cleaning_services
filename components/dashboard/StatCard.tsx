interface StatCardProps {
    label: string;
    value: string;
    helper?: string;
}

export default function StatCard({ label, value, helper }: StatCardProps) {
    return (
        <div className="group relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-white/10 to-white/5 p-5 backdrop-blur-2xl shadow-[0_25px_60px_-30px_rgba(0,0,0,0.85)] transition duration-300 hover:-translate-y-1 hover:border-amber-300/20 hover:shadow-[0_30px_70px_-28px_rgba(251,191,36,0.35)]">
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-amber-300/70 to-transparent" />
            <p className="text-sm font-medium text-white/60">{label}</p>
            <p className="mt-3 text-3xl font-black tracking-tight text-white md:text-4xl">{value}</p>
            {helper && <p className="mt-2 text-sm leading-relaxed text-white/50">{helper}</p>}
        </div>
    );
}