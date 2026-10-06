import { getUserProfile } from "@/lib/auth/getUserProfile";
import { isFullAdmin } from "@/lib/auth/roles";

export async function requireAdmin() {
    const profile = await getUserProfile();

    // View-only admins can look but not change anything.
    if (!isFullAdmin(profile)) {
        throw new Error("Not authorized");
    }

    return profile;
}

// Identical rows created seconds apart are a double-submit (double click,
// retried request), not a second intent -- the client-side pending guard
// alone can't fully rule that out.
export const DUPLICATE_WINDOW_MS = 15_000;

export const duplicateSince = () => new Date(Date.now() - DUPLICATE_WINDOW_MS).toISOString();
