// Settings that must stay on the server: they are never imported by code that
// is sent to the browser, so they don't appear in any page. Public facts about
// the business are in lib/config/business.ts.

// Every enquiry from the contact form goes to all of these inboxes.
// CONTACT_RECIPIENTS (comma separated) overrides this without a code change.
const CONTACT_FORM_INBOXES = ["info@jigzack.com", "razackolajide@gmail.com", "jigzackcleaningservices@gmail.com"];

export function contactFormRecipients(): string[] {
    const configured = (process.env.CONTACT_RECIPIENTS ?? "")
        .split(",")
        .map((address) => address.trim())
        .filter(Boolean);

    return configured.length > 0 ? configured : CONTACT_FORM_INBOXES;
}
