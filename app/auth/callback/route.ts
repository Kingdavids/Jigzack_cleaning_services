import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

export async function GET(request: Request) {
    const requestUrl = new URL(request.url);
    const code = requestUrl.searchParams.get("code");
    const next = requestUrl.searchParams.get("next") ?? "/auth/complete-signup";

    if (code) {
        const supabase = await createClient();
        await supabase.auth.exchangeCodeForSession(code);
    }

    // request.url reflects Railway's internal bind address (e.g.
    // http://localhost:8080) behind its reverse proxy, not the public
    // domain the user's browser is actually on -- use the forwarded
    // headers the proxy sets instead, falling back to request.url for
    // local dev where no proxy is in front of it.
    const forwardedHost = request.headers.get("x-forwarded-host");
    const forwardedProto = request.headers.get("x-forwarded-proto") ?? "https";
    const origin = forwardedHost ? `${forwardedProto}://${forwardedHost}` : requestUrl.origin;

    return NextResponse.redirect(new URL(next, origin));
}