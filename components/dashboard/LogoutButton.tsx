"use client";

import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { createClient } from "@/utils/supabase/client";

export default function LogoutButton() {
    const router = useRouter();

    async function handleLogout() {
        const supabase = createClient();
        await supabase.auth.signOut();
        router.refresh();
        router.push("/auth");
    }

    return (
        <button
            onClick={handleLogout}
            className="rounded-2xl border border-red-400/20 bg-red-500/10 px-4 py-2 text-red-200 transition hover:bg-red-500/20"
        >
      <span className="inline-flex items-center gap-2">
        <LogOut className="h-4 w-4" />
        Log out
      </span>
        </button>
    );
}