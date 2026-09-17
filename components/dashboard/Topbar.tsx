'use client';

import { useRouter } from "next/navigation";
import { LogOut, Search, Bell } from "lucide-react";
import { createClient } from "@/utils/supabase/client";

export default function Topbar({
                                   title,
                                   subtitle,
                               }: {
    title: string;
    subtitle: string;
}) {
    const router = useRouter();

    const handleLogout = async () => {
        const supabase = createClient();
        await supabase.auth.signOut();
        router.push("/auth");
        router.refresh();
    };

    return (
        <header className="sticky top-0 z-30 border-b border-white/10 bg-slate-950/70 backdrop-blur-2xl">
            <div className="px-4 py-4 md:px-6 lg:px-8">
                <div className="mx-auto flex max-w-7xl flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                        <h1 className="text-2xl font-black tracking-tight md:text-3xl">
                            {title}
                            <span className="text-amber-300">.</span>
                        </h1>
                        <p className="mt-1 text-sm text-white/60 md:text-base">{subtitle}</p>
                    </div>

                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                        <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white/60">
                            <Search size={16} />
                            <span className="text-sm">Search dashboard</span>
                        </div>

                        <button className="inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-white/80 transition hover:bg-white/10">
                            <Bell size={18} />
                        </button>

                        <button
                            onClick={handleLogout}
                            className="inline-flex items-center justify-center gap-2 rounded-2xl border border-amber-300/20 bg-amber-400 px-5 py-3 font-bold text-slate-950 transition hover:bg-amber-300"
                        >
                            <LogOut size={18} />
                            Logout
                        </button>
                    </div>
                </div>
            </div>
        </header>
    );
}