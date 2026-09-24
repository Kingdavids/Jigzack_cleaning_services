// A "supervisor" is an admin account flagged read_only: it can look at
// everything an admin can, and change nothing.
//
// An "owner" is a full admin with the extra right to do the things that cannot
// be undone or that change who has access: deleting customers, and inviting,
// changing or removing admins.

type RoleLike = { role?: string | null; read_only?: boolean | null; is_owner?: boolean | null };

export const isFullAdmin = (profile: RoleLike) => profile.role === "admin" && !profile.read_only;
export const isViewOnlyAdmin = (profile: RoleLike) => profile.role === "admin" && Boolean(profile.read_only);

// Before supabase/owner-2026-09.sql has been run the profile has no is_owner
// field at all, and every full admin keeps working as before. Afterwards only
// real owners pass.
export const isOwner = (profile: RoleLike) => isFullAdmin(profile) && ("is_owner" in profile ? Boolean(profile.is_owner) : true);
