'use client';

import ForgotPassword from "@/components/auth/ForgotPassword";

export default function ForgotPasswordPage() {
    return (
        <main className="flex min-h-screen items-center justify-center bg-slate-950 px-6">
            <div className="w-full max-w-md rounded-2xl border border-white/10 bg-white/[0.03] p-6 md:p-8">
                <ForgotPassword />
            </div>
        </main>
    );
}
