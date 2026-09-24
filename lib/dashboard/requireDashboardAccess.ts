import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { getUserProfile } from "@/lib/auth/getUserProfile";
import type { UserRole } from "@/lib/dashboard-types";

// Every dashboard route (now split across /admin, /admin/tasks, /admin/messages,
// etc.) needs the same approval/role checks a visitor could otherwise skip by
// navigating straight to a sub-route URL, plus the unread-message count for the
// Topbar bell badge. Centralized here so a dozen+ pages don't each repeat it.
export async function requireDashboardAccess(role: UserRole) {
    const profile = await getUserProfile();

    if (profile.status !== "approved") {
        redirect("/auth/pending");
    }

    if (profile.role !== role) {
        redirect(`/${profile.role}`);
    }

    const supabase = await createClient();

    const { count } = await supabase
        .from("messages")
        .select("id", { count: "exact", head: true })
        .eq("to_profile_id", profile.id)
        .is("read_at", null);

    if (role === "customer") {
        const { data: customer } = await supabase
            .from("customers")
            .select("*")
            .eq("profile_id", profile.id)
            .single();

        // A suspended account (set by an admin) cannot open the dashboard.
        if (customer && (customer.status === "inactive" || customer.status === "deleted")) {
            redirect("/auth/suspended");
        }

        // Tenants (linked to a unit) don't pay their own registration fee.
        // The estate they belong to is the paying account.
        if (customer && !customer.unit_id && !customer.registration_fee_paid) {
            redirect("/auth/registration-fee");
        }

        return { profile, supabase, unreadCount: count ?? 0, customer: customer ?? null };
    }

    return { profile, supabase, unreadCount: count ?? 0, customer: null };
}
