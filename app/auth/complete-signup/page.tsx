import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";

type AppRole = "admin" | "employee" | "customer";
type ProfileStatus = "pending" | "approved" | "declined";

export default async function CompleteSignupPage() {
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
        .select("role, status, full_name")
        .eq("id", user.id)
        .single();

    if (profileError || !profile) {
        redirect("/auth");
    }

    const role = profile.role as AppRole;
    const status = profile.status as ProfileStatus;
    const emailVerified = Boolean(user.email_confirmed_at);

    if (!emailVerified) {
        redirect(`/auth/pending?role=${role}`);
    }

    if (status === "declined") {
        redirect("/auth/decline");
    }

    if (status === "approved") {
        redirect(`/${role}`);
    }

    if (role === "customer") {
        redirect("/auth/customer-setup");
    }

    if (role === "employee") {
        redirect("/auth/pending?role=employee");
    }

    redirect("/auth/pending");
}