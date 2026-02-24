'use client';

import Auth from "@/components/auth/Auth";

export default function AuthPage() {
    return (
        <section className="relative min-h-screen w-full overflow-hidden">
            {/* background gradient */}
            <div className="absolute inset-0 bg-gradient-to-br from-slate-950 via-slate-950 to-orange-950/40" />

            {/* orange glow blobs */}
            <div className="absolute -top-24 -right-24 h-72 w-72 rounded-full bg-amber-400/20 blur-3xl" />
            <div className="absolute -bottom-24 -left-24 h-72 w-72 rounded-full bg-orange-500/20 blur-3xl" />

            <div className="relative z-10 min-h-screen flex items-center justify-center px-6 py-12">
                <div className="w-full max-w-md">
                    <Auth />
                </div>
            </div>
        </section>
    );
}
