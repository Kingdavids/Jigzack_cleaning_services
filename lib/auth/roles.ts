// A "supervisor" is an admin account flagged read_only: it can look at
// everything an admin can, and change nothing.

type RoleLike = { role?: string | null; read_only?: boolean | null };

export const isFullAdmin = (profile: RoleLike) => profile.role === "admin" && !profile.read_only;
export const isViewOnlyAdmin = (profile: RoleLike) => profile.role === "admin" && Boolean(profile.read_only);
