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
        <div className="min-h-screen flex items-center justify-center bg-[#0a0a0b] text-white">
            <div className="text-center max-w-xl px-6">
                <div className="flex justify-center">
                    <div className="h-20 w-20 rounded-2xl bg-green-400/10 flex items-center justify-center">
                        <CheckCircle2 className="h-9 w-9 text-green-300" />
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