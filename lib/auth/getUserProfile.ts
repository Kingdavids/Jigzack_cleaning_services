import { cache } from "react";
import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";

// Used by the layout and by the page in the same request, and by helpers on
// top of it, so it is cached per request: the session check and the profile
// query then happen once instead of once per caller. Each of those is a round
// trip to the database, and they add up on every page.
//
// getClaims() checks the signed session token in the cookie, which does not
// need a trip to the auth server when the project uses signing keys, and
// falls back to asking the auth server when it does not.
export const getUserProfile = cache(async () => {
    const supabase = await createClient();

    const { data } = await supabase.auth.getClaims();
    let userId = data?.claims?.sub;

    // If the token could not be read, ask the auth server before giving up.
    if (!userId) {
        const {
            data: { user },
        } = await supabase.auth.getUser();
        userId = user?.id;
    }

    if (!userId) {
        redirect("/auth");
    }

    const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", userId)
        .single();

    if (profileError || !profile) {
        redirect("/login");
    }

    return profile;
});
