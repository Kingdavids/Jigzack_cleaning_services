import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

export async function proxy(request: NextRequest) {
    let response = NextResponse.next({ request });

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
        throw new Error(
            "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local"
        );
    }

    const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
        cookies: {
            getAll() {
                return request.cookies.getAll();
            },
            setAll(cookiesToSet) {
                // Rewriting the request's own cookies (not just the response's)
                // is what lets the Server Component tree rendered for THIS
                // request see a just-refreshed token. Skipping this means a
                // refreshed session never reaches the page render: it tries to
                // refresh again with the now-already-used refresh token and
                // gets rejected, bouncing the user back to login.
                cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
                response = NextResponse.next({ request });
                cookiesToSet.forEach(({ name, value, options }) => {
                    response.cookies.set(name, value, options);
                });
            },
        },
    });

    const {
        data: { user },
    } = await supabase.auth.getUser();

    // A logged-out visitor opening a dashboard link (e.g. the "review this
    // signup" link in an admin email) is sent to login and brought back here
    // afterwards. The Location is relative so it stays on the public domain
    // behind Railway's proxy.
    const { pathname, search } = request.nextUrl;
    if (!user && /^\/(admin|customer|employee)(\/|$)/.test(pathname)) {
        return new NextResponse(null, {
            status: 307,
            headers: { Location: `/auth?next=${encodeURIComponent(pathname + search)}` },
        });
    }

    return response;
}