import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import PendingClient from "./PendingClient";

type Role = "customer" | "employee" | "admin";
type ProfileStatus = "pending" | "approved" | "declined";

export default async function PendingPage() {
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
        .select("id, role, status, full_name")
        .eq("id", user.id)
        .single();

    if (profileError || !profile) {
        redirect("/auth");
    }

    const role = (profile.role ?? "customer") as Role;
    const status = (profile.status ?? "pending") as ProfileStatus;
    const emailVerified = Boolean(user.email_confirmed_at);

    if (status === "approved" && emailVerified) {
        redirect(`/auth/success?role=${role}`);
    }

    if (status === "declined") {
        redirect("/auth/decline");
    }

    return (
        <PendingClient
            userId={user.id}
            role={role}
            emailVerified={emailVerified}
            fullName={profile.full_name ?? ""}
            initialStatus={status}
        />
    );
}