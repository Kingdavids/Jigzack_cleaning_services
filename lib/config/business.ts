// Everything that is specific to the business running this app, in one place:
// who it is, how to reach it, where customers send money, what it charges and
// when it bills. Change a value here and the website, emails, invoices and
// receipts all follow. Nothing else in the code should spell these out.
//
// To run the app for another business, this is the file to change, along with
// the images in /public and lib/config/private.ts.
//
// This file is also used by code that is sent to the browser, so it holds only
// what customers can see anyway. Private values (such as the inboxes the
// contact form writes to) are in lib/config/private.ts, for the server only.

const phone = (display: string, international: string) => ({ display, international, href: `tel:${international}` });

const name = "Jigzack Cleaning Services";

export const BUSINESS = {
    name,
    // How it is called in short, in conversation and on the home screen.
    shortName: "Jigzack",
    // The name in capitals, as it is printed on invoices and receipts.
    invoiceName: name.toUpperCase(),
    locale: "en_NG",
    cities: ["Lagos", "Port Harcourt"],
    description:
        "LAWMA-approved waste collection for homes and businesses in Lagos and Port Harcourt. Scheduled pickups, monthly invoices and receipts online.",

    // Where the site lives. NEXT_PUBLIC_SITE_URL overrides it, for a test deployment.
    domain: "jigzackcleaningservices.com",
    url: (process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.jigzackcleaningservices.com").replace(/\/$/, ""),

    contact: {
        email: "info@jigzack.com",
        phone: phone("0703 433 9721", "+2347034339721"),
        // Every number printed on invoices, receipts and emails.
        supportPhones: ["0703 433 9721", "0708 680 8079"],
    },

    // The authority the business is approved by, named on invoices and receipts.
    regulator: {
        name: "Lagos Waste Management Authority",
        short: "LAWMA",
        logo: "/images/lawma-logo.png",
    },

    // Where customers send bank transfers. Shown on invoices, receipts and the registration fee page.
    bank: {
        accountName: name.toUpperCase(),
        banks: [
            { bank: "Sterling Bank", number: "0079266810" },
            { bank: "GTBank", number: "0562133368" },
        ],
    },

    brand: {
        logo: "/images/logo.png",
        shareImage: "/images/field/truck-side.jpg",
    },

    billing: {
        // Dates and "today" are worked out in this timezone. (The database
        // rules that mark past pickups serviced use the same one.)
        timezone: "Africa/Lagos",
        // Invoices for a month are made on this day of it; before then, the
        // current invoice is still last month's.
        invoiceDay: 25,
        // One-off fee a new customer pays to unlock their dashboard. REGISTRATION_FEE_NGN overrides it.
        registrationFee: Number(process.env.REGISTRATION_FEE_NGN ?? "5000"),
        // Monthly charge per unit, by the property types on the sign-up form. Commercial types have no standard price.
        unitPrices: {
            flatsCount: 5000,
            miniFlatsCount: 5000,
            studioCount: 5000,
            shopsCount: 2000,
            duplexCount: 8000,
            bungalowCount: 7000,
            terraceCount: 10000,
        } as Record<string, number>,
    },
};

export const TIMEZONE = BUSINESS.billing.timezone;
// That timezone's offset from UTC, for building exact timestamps (Lagos has no daylight saving).
export const TIMEZONE_OFFSET = "+01:00";
export const REGISTRATION_FEE_NGN = BUSINESS.billing.registrationFee;
