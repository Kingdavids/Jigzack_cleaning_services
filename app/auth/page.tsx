'use client';

import { Suspense } from "react";
import Auth from "@/components/auth/Auth";

export default function AuthPage() {
    return (
        <main className="min-h-screen flex items-center justify-center px-6 bg-slate-950">
            <div className="w-full max-w-md">
                <Suspense fallback={null}>
                    <Auth />
                </Suspense>
            </div>
        </main>
    );
}