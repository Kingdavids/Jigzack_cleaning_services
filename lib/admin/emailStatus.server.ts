import { createClient } from "@supabase/supabase-js";
import type { EmailStatus, EmailStatusMap } from "@/lib/admin/emailStatus";

const PER_PAGE = 1000;
const MAX_PAGES = 20;

// The email confirmation state of the given people, read from the logins
// themselves. Only the service key can see it, so this is for server pages that
// have already checked the viewer is the owner. Returns null when the key isn't
// set or the lookup fails, so a page can say so instead of showing wrong badges.
export async function loadEmailStatus(ids: string[]): Promise<EmailStatusMap | null> {
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;

    if (!serviceKey || !url) return null;

    const wanted = new Set(ids.filter(Boolean));
    const found: EmailStatusMap = {};

    if (wanted.size === 0) return found;

    const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

    for (let page = 1; page <= MAX_PAGES; page += 1) {
        const { data, error } = await admin.auth.admin.listUsers({ page, perPage: PER_PAGE });

        if (error) {
            console.error("loadEmailStatus error:", error.message);
            return null;
        }

        for (const user of data.users) {
            if (!wanted.has(user.id)) continue;

            const status: EmailStatus = {
                confirmed: Boolean(user.email_confirmed_at),
                confirmedAt: user.email_confirmed_at ?? null,
                lastSignIn: user.last_sign_in_at ?? null,
            };
            found[user.id] = status;
        }

        if (data.users.length < PER_PAGE) break;
    }

    return found;
}
