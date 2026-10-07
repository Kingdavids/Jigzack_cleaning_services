// Whether a login's email address has been confirmed, and when they last signed
// in. This is what an owner needs to help someone who can't get in. The
// lookup itself needs the service key and lives in emailStatus.server.ts; this
// file is plain so pages and components can both use it.

export type EmailStatus = {
    confirmed: boolean;
    confirmedAt: string | null;
    lastSignIn: string | null;
};

// People as an object, so it can be handed to a client component.
export type EmailStatusMap = Record<string, EmailStatus>;

const day = (value: string) => new Date(value).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Africa/Lagos" });

// "Never signed in" or "Last signed in 3 Oct 2026".
export function signInText(status: Pick<EmailStatus, "lastSignIn">) {
    return status.lastSignIn ? `Last signed in ${day(status.lastSignIn)}` : "Never signed in";
}

// Why someone may be stuck, in plain words for the owner.
export function stuckReason(status: EmailStatus | undefined) {
    if (!status) return null;
    if (!status.confirmed) return "Their email is not confirmed, so they can't sign in. Confirm it for them, or ask them to check their spam folder.";
    if (!status.lastSignIn) return "Their email is confirmed but they have never signed in.";

    return null;
}
