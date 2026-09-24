import Link from "next/link";
import { createClient } from "@/utils/supabase/server";
import Signup from "@/components/auth/Signup";

type InviteCheck = { valid: boolean; email?: string | null; role?: "admin" | "supervisor" };

export default async function AdminInvitePage({
                                                  searchParams,
                                              }: {
    searchParams: Promise<{ token?: string }>;
}) {
    const { token } = await searchParams;

    let invite: InviteCheck = { valid: false };

    if (typeof token === "string" && token.length > 0 && token.length <= 128) {
        const supabase = await createClient();
        const { data } = await supabase.rpc("check_admin_invite", { p_token: token });

        if (data && typeof data === "object" && (data as InviteCheck).valid) {
            invite = data as InviteCheck;
        }
    }

    return (
        <main className="flex min-h-screen items-center justify-center bg-slate-950 px-6">
            <div className="w-full max-w-md">
                <section className="rounded-2xl border border-white/10 bg-white/[0.03]">
                    <div className="px-5 py-6 md:px-7 md:py-8">
                        {invite.valid && typeof token === "string" ? (
                            <Signup
                                inviteToken={token}
                                presetEmail={invite.email ?? null}
                                inviteKind={invite.role === "supervisor" ? "supervisor" : "admin"}
                            />
                        ) : (
                            <div className="text-center">
                                <h1 className="text-2xl font-black tracking-tight text-white">This invite link isn&apos;t valid</h1>
                                <p className="mt-3 text-sm leading-6 text-white/65">
                                    It may have expired or already been used. Ask an admin to send you a new invite.
                                </p>
                                <Link
                                    href="/"
                                    className="mt-6 inline-block rounded-xl bg-amber-400 px-5 py-2.5 text-sm font-bold text-black transition hover:bg-amber-300"
                                >
                                    Back to Home
                                </Link>
                            </div>
                        )}
                    </div>
                </section>
            </div>
        </main>
    );
}
