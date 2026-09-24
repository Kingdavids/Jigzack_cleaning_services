'use client';

import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";

export default function SignOutButton() {
    const router = useRouter();

    const signOut = async () => {
        await createClient().auth.signOut();
        router.push("/auth");
        router.refresh();
    };

    return (
        <button
            type="button"
            onClick={signOut}
            className="rounded-xl border border-white/15 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-white/10"
        >
            Sign out
        </button>
    );
}
