export default function Preloader({
    fullScreen = true,
    label = "Loading",
}: {
    fullScreen?: boolean;
    label?: string;
}) {
    const content = (
        <div className="flex flex-col items-center justify-center gap-6">
            <div className="relative h-20 w-32">
                <span className="preloader-puff preloader-puff-1 absolute left-1 top-9 h-2.5 w-2.5 rounded-full bg-white/25" />
                <span className="preloader-puff preloader-puff-2 absolute left-1 top-9 h-2.5 w-2.5 rounded-full bg-white/25" />
                <span className="preloader-puff preloader-puff-3 absolute left-1 top-9 h-2.5 w-2.5 rounded-full bg-white/25" />

                <svg
                    viewBox="0 0 110 80"
                    className="preloader-truck relative h-20 w-32"
                    xmlns="http://www.w3.org/2000/svg"
                >
                    {/* container */}
                    <rect x="8" y="18" width="62" height="40" rx="5" fill="#fbbf24" stroke="#0a0a0b" strokeWidth="2" />
                    <rect x="14" y="24" width="50" height="4" rx="2" fill="#0a0a0b" opacity="0.15" />
                    <rect x="14" y="34" width="50" height="4" rx="2" fill="#0a0a0b" opacity="0.15" />

                    {/* cab */}
                    <rect x="70" y="34" width="26" height="24" rx="4" fill="#f59e0b" stroke="#0a0a0b" strokeWidth="2" />
                    <rect x="76" y="40" width="14" height="10" rx="2" fill="#0a0a0b" opacity="0.85" />

                    {/* wheels (a spoke on each makes the rotation visible) */}
                    <g className="preloader-wheel">
                        <circle cx="28" cy="62" r="9" fill="#27272a" stroke="rgba(255,255,255,0.35)" strokeWidth="1.5" />
                        <circle cx="28" cy="62" r="3" fill="#fde68a" />
                        <rect x="27.2" y="54" width="1.6" height="16" fill="#fde68a" />
                    </g>
                    <g className="preloader-wheel">
                        <circle cx="84" cy="62" r="9" fill="#27272a" stroke="rgba(255,255,255,0.35)" strokeWidth="1.5" />
                        <circle cx="84" cy="62" r="3" fill="#fde68a" />
                        <rect x="83.2" y="54" width="1.6" height="16" fill="#fde68a" />
                    </g>
                </svg>
            </div>

            <div className="preloader-road h-1.5 w-40 rounded-full" />

            <div className="text-center">
                <p className="text-lg font-black tracking-tight text-white">
                    Jigzack<span className="text-amber-300">.</span>
                </p>
                <p className="mt-1 text-xs font-semibold uppercase tracking-[0.25em] text-white/40">
                    {label}
                    <span className="preloader-ellipsis" />
                </p>
            </div>
        </div>
    );

    if (!fullScreen) {
        return content;
    }

    return (
        <div className="flex min-h-screen w-full items-center justify-center bg-slate-950">
            {content}
        </div>
    );
}
