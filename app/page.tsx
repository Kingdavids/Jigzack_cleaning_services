'use client';

import Link from "next/link";
import useAuth from "@/hooks/useAuth";
import { useRouter } from "next/navigation";
import About from "@/components/About";

export default function Home() {
    const { user, loading } = useAuth();
    const router = useRouter();

    if (loading && user) {
        router.push("/auth");
        return null;
    }

    return (
        <main>
            {/* HOME HERO – FULL WIDTH */}
            <section className="relative min-h-screen w-full overflow-hidden">
                <div
                    className="absolute inset-0"
                    style={{
                        backgroundImage: "url('/images/fleet-truck-street.jpg')",
                        backgroundSize: "cover",
                        backgroundPosition: "center",
                    }}
                />
                <div className="absolute inset-0 bg-gradient-to-b from-slate-950/85 via-slate-950/75 to-slate-950" />

                <div className="relative z-10 min-h-screen w-full flex items-center justify-center px-6 md:px-10">
                    <div className="max-w-2xl w-full text-center">
                        <span className="inline-flex items-center gap-2 rounded-full border border-amber-300/20 bg-amber-400/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.25em] text-amber-300">
                            LAWMA Approved
                        </span>

                        <h1 className="mt-6 text-4xl md:text-5xl lg:text-6xl font-black tracking-tight text-white">
                            Jigzack Cleaning Services<span className="text-amber-300">.</span>
                        </h1>

                        <p className="mt-4 text-lg md:text-xl text-white/80 font-medium">
                            Smart Waste Solutions for a Cleaner, Greener Tomorrow.
                        </p>

                        <div className="mt-4 text-base md:text-lg text-white/60 leading-relaxed max-w-xl mx-auto">
                            <About />
                        </div>

                        <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
                            <Link
                                href="/auth"
                                className="rounded-xl bg-amber-400 px-6 py-3 font-bold text-black transition hover:bg-amber-300"
                            >
                                Get Started
                            </Link>
                            <Link
                                href="/services"
                                className="rounded-xl border border-white/15 bg-white/[0.03] px-6 py-3 font-semibold text-white transition hover:bg-white/10"
                            >
                                Our Services
                            </Link>
                        </div>
                    </div>
                </div>
            </section>

            {/* TRUST / STATS STRIP */}
            <section className="border-y border-white/10 bg-[#06060a] px-6 py-10 md:px-10">
                <div className="mx-auto grid max-w-6xl grid-cols-2 gap-6 text-center md:grid-cols-4">
                    {[
                        { value: "LAWMA", label: "Approved operator" },
                        { value: "2,450+", label: "Domestic facilities serviced" },
                        { value: "680+", label: "Commercial facilities serviced" },
                        { value: "2 Cities", label: "Lagos & Port Harcourt" },
                    ].map((stat) => (
                        <div key={stat.label}>
                            <p className="text-2xl font-black text-amber-300 md:text-3xl">{stat.value}</p>
                            <p className="mt-1 text-xs text-white/50 md:text-sm">{stat.label}</p>
                        </div>
                    ))}
                </div>
            </section>
        </main>
    );
}
