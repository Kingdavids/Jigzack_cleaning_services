"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import {
    CheckCircle2,
    Sparkles,
    ArrowRight,
} from "lucide-react";

export default function SuccessPage({
                                        role = "customer",
                                    }: {
    role?: "customer" | "employee" | "admin";
}) {
    const router = useRouter();

    useEffect(() => {
        const timer = setTimeout(() => {
            router.push(`/${role}`);
        }, 2500);

        return () => clearTimeout(timer);
    }, [role, router]);

    return (
        <div className="relative min-h-screen flex items-center justify-center bg-[#0b0c0f] text-white overflow-hidden">

            {/* glow */}
            <div className="absolute inset-0">
                <div className="absolute left-[10%] top-[20%] h-56 w-56 bg-green-400/10 blur-3xl rounded-full animate-pulse" />
                <div className="absolute right-[10%] bottom-[20%] h-64 w-64 bg-emerald-400/10 blur-3xl rounded-full animate-pulse delay-700" />
            </div>

            <div className="relative text-center max-w-xl px-6">
                <div className="flex justify-center">
                    <div className="h-24 w-24 rounded-full bg-green-400/10 flex items-center justify-center">
                        <CheckCircle2 className="h-10 w-10 text-green-300 animate-pulse" />
                    </div>
                </div>

                <h1 className="mt-6 text-4xl font-black">
                    Your account is ready
                </h1>

                <p className="mt-4 text-white/70">
                    Everything is set. Your access has been activated and your workspace is now available.
                </p>

                <div className="mt-6 flex justify-center gap-2 text-green-300 text-sm uppercase tracking-widest">
                    <Sparkles className="h-4 w-4" />
                    Redirecting to dashboard
                </div>

                <button
                    onClick={() => router.push(`/${role}`)}
                    className="mt-6 px-5 py-3 rounded-xl bg-green-400 text-black font-bold hover:bg-green-300 inline-flex items-center gap-2"
                >
                    Go now <ArrowRight className="h-4 w-4" />
                </button>
            </div>
        </div>
    );
}