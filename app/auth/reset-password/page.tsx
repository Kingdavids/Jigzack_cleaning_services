'use client';

import ResetPassword from "@/components/auth/ResetPassword";

export default function ResetPasswordPage() {
    return (
        <main className="flex min-h-screen items-center justify-center bg-slate-950 px-6">
            <div className="w-full max-w-md rounded-2xl border border-white/10 bg-white/[0.03] p-6 md:p-8">
                <ResetPassword />
            </div>
        </main>
    );
}
