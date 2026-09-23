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

    // Email is verified but approval is still pending, so make sure the
    // role-specific setup form was actually completed. Without this check,
    // anyone who leaves before finishing it (closes the tab, logs back in
    // later) lands here with no way back to the form they never submitted.
    if (emailVerified && status === "pending") {
        if (role === "customer") {
            const { data: customerRow } = await supabase
                .from("customers")
                .select("id")
                .eq("profile_id", user.id)
                .maybeSingle();

            if (!customerRow) {
                redirect("/auth/customer-setup");
            }
        }

        if (role === "employee") {
            const { data: employeeRow } = await supabase
                .from("employees")
                .select("id")
                .eq("profile_id", user.id)
                .maybeSingle();

            if (!employeeRow) {
                redirect("/auth/employee-setup");
            }
        }
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