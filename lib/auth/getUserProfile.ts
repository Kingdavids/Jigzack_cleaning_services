import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";

export async function getUserProfile() {
    const supabase = await createClient();

    const {
        data: { user },
        error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
        redirect("/auth");
    }

    const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single();

    if (profileError || !profile) {
        redirect("/login");
    }

    return profile;
}