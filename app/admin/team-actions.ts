"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";
import { getUserProfile } from "@/lib/auth/getUserProfile";
import { isFullAdmin } from "@/lib/auth/roles";
import { logActivity } from "@/lib/activity";
import { escapeHtml, sendEmail } from "@/lib/send-email";
import { siteOrigin } from "@/lib/site-origin";

export type AdminInviteState = { success: boolean; error?: string; link?: string; emailed?: boolean } | null;
export type TeamResult = { success: boolean; error?: string };

async function requireFullAdmin() {
    const profile = await getUserProfile();

    if (!isFullAdmin(profile) || profile.status !== "approved") {
        throw new Error("Not authorized");
    }

    return profile;
}

const INVITE_DAYS = 3;

// An admin invite is tied to one email address. Whoever signs up with exactly
// that address, and confirms it, becomes an admin (or a view-only supervisor).
// The link works once and expires after three days.
export async function createAdminInvite(_prev: AdminInviteState, formData: FormData): Promise<AdminInviteState> {
    const actor = await requireFullAdmin();
    const supabase = await createClient();

    const email = String(formData.get("email") || "").trim().toLowerCase();
    const kind = String(formData.get("kind") || "admin");
    const role = kind === "supervisor" ? "supervisor" : "admin";

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return { success: false, error: "Enter the email address the invite is for." };
    }

    // Escape the wildcard characters so an address is matched exactly.
    const escaped = email.replace(/[\\%_]/g, (c) => "\\" + c);
    const { data: existing } = await supabase.from("profiles").select("id").ilike("email", escaped).maybeSingle();

    if (existing) {
        return {
            success: false,
            error: "That email already has an account. Ask them to sign up with a different address, or give them access in the database.",
        };
    }

    const token = randomBytes(24).toString("hex");
    const expiresAt = new Date(new Date().getTime() + INVITE_DAYS * 24 * 60 * 60 * 1000).toISOString();

    const { error } = await supabase.from("admin_invites").insert({
        token,
        email,
        role,
        invited_by: actor.id,
        expires_at: expiresAt,
    });

    if (error) {
        console.error("createAdminInvite insert error:", error.message);
        return {
            success: false,
            error: /schema cache|relation|does not exist/i.test(error.message)
                ? "Admin invites are not switched on yet. Run supabase/admins-activity-2026-09.sql first."
                : "Could not create the invite. Please try again.",
        };
    }

    const link = `${await siteOrigin()}/auth/admin-invite?token=${token}`;
    const what = role === "supervisor" ? "a view-only supervisor" : "an admin";

    const emailed = await sendEmail({
        to: [email],
        subject: "You're invited to help run Jigzack Cleaning Services",
        html: `
            <p>You've been invited to join Jigzack Cleaning Services as ${what}.</p>
            <p><a href="${escapeHtml(link)}">Set up your account</a></p>
            <p>Sign up with this email address (${escapeHtml(email)}) and confirm it when we email you. The link works once and expires in ${INVITE_DAYS} days.</p>
        `,
    });

    await logActivity(supabase, actor, "admin_invited", `Invited ${email} as ${role === "supervisor" ? "a supervisor" : "an admin"}`);

    revalidatePath("/admin/admins");

    return { success: true, link, emailed };
}

export async function revokeAdminInvite(inviteId: string): Promise<TeamResult> {
    const actor = await requireFullAdmin();
    const supabase = await createClient();

    if (!inviteId) return { success: false, error: "Invalid request." };

    const { error } = await supabase.from("admin_invites").delete().eq("id", inviteId).is("used_at", null);

    if (error) {
        console.error("revokeAdminInvite error:", error.message);
        return { success: false, error: "Could not revoke this invite." };
    }

    await logActivity(supabase, actor, "admin_invite_revoked", "Revoked an admin invite");
    revalidatePath("/admin/admins");

    return { success: true };
}

// Change what an existing admin can do. Removing access keeps their account
// (and every record they made) but stops them signing in to the admin area.
export async function changeAdminAccess(userId: string, mode: "admin" | "supervisor" | "remove"): Promise<TeamResult> {
    const actor = await requireFullAdmin();
    const supabase = await createClient();

    if (!userId || !["admin", "supervisor", "remove"].includes(mode)) {
        return { success: false, error: "Invalid request." };
    }

    if (userId === actor.id) {
        return { success: false, error: "You cannot change your own access. Ask another admin." };
    }

    const { data: target } = await supabase
        .from("profiles")
        .select("id, full_name, email, role, status, read_only")
        .eq("id", userId)
        .maybeSingle();

    if (!target || target.role !== "admin") {
        return { success: false, error: "That person is not an admin." };
    }

    // Never leave the business without a full admin.
    const losingFullAdmin = mode !== "admin" && target.status === "approved" && !target.read_only;

    if (losingFullAdmin) {
        const { count } = await supabase
            .from("profiles")
            .select("id", { count: "exact", head: true })
            .eq("role", "admin")
            .eq("status", "approved")
            .eq("read_only", false)
            .neq("id", userId);

        if (!count || count < 1) {
            return { success: false, error: "There must always be at least one full admin." };
        }
    }

    const update =
        mode === "remove"
            ? { status: "declined" }
            : { status: "approved", read_only: mode === "supervisor" };

    const { error } = await supabase.from("profiles").update(update).eq("id", userId);

    if (error) {
        console.error("changeAdminAccess error:", error.message);
        return { success: false, error: "Could not update this admin. Please try again." };
    }

    const name = target.full_name ?? target.email ?? "an admin";
    const summary =
        mode === "remove"
            ? `Removed admin access for ${name}`
            : mode === "supervisor"
                ? `Made ${name} a view-only supervisor`
                : `Made ${name} a full admin`;

    await logActivity(supabase, actor, "admin_access_changed", summary, { type: "profile", id: userId });

    revalidatePath("/admin/admins");
    revalidatePath("/admin/approvals");

    return { success: true };
}
