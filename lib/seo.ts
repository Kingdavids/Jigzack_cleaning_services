import type { Metadata } from "next";

// One place for the facts search engines and social previews repeat, so the
// page titles, structured data and footer never drift apart.
export const SITE = {
    name: "Jigzack Cleaning Services",
    shortName: "Jigzack",
    url: (process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.jigzackcleaningservices.com").replace(/\/$/, ""),
    phone: "+2347034339721",
    email: "info@jigzack.com",
    locale: "en_NG",
    description:
        "LAWMA-approved waste collection for homes and businesses in Lagos and Port Harcourt. Scheduled pickups, monthly invoices and receipts online.",
    cities: ["Lagos", "Port Harcourt"],
    logo: "/images/logo.png",
    image: "/images/field/truck-side.jpg",
} as const;

export const SERVICES = [
    {
        name: "Domestic waste collection",
        description:
            "Household waste collected on a regular schedule, so bins don't pile up and the street stays clean.",
    },
    {
        name: "Commercial waste disposal",
        description:
            "Collection for shops, supermarkets, hotels, schools, eateries and other business premises, on a set schedule.",
    },
    {
        name: "Plastics and general refuse collection",
        description: "Bagged plastics and general refuse collected and disposed of using safer disposal practices.",
    },
] as const;

export function absoluteUrl(path = "/") {
    return `${SITE.url}${path.startsWith("/") ? path : `/${path}`}`;
}

// Metadata for a public page: title, description, canonical address and the
// Open Graph and Twitter previews all built from the same three inputs.
export function pageMetadata({
                                 title,
                                 description,
                                 path,
                             }: {
    title: string;
    description: string;
    path: string;
}): Metadata {
    return {
        title,
        description,
        alternates: { canonical: path },
        openGraph: {
            title: `${title} | ${SITE.name}`,
            description,
            url: path,
            siteName: SITE.name,
            locale: SITE.locale,
            type: "website",
        },
        twitter: {
            card: "summary_large_image",
            title: `${title} | ${SITE.name}`,
            description,
        },
    };
}

// Pages people should never find through a search engine: accounts, sign-in
// steps and every dashboard.
export const PRIVATE_PAGE: Metadata = {
    robots: { index: false, follow: false, nocache: true },
};

export function breadcrumbJsonLd(trail: { name: string; path: string }[]) {
    return {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        itemListElement: trail.map((item, index) => ({
            "@type": "ListItem",
            position: index + 1,
            name: item.name,
            item: absoluteUrl(item.path),
        })),
    };
}

// The business itself. There is no street address on record, so the location
// is expressed as the cities served rather than an invented address.
export function organizationJsonLd() {
    return {
        "@context": "https://schema.org",
        "@type": "LocalBusiness",
        "@id": `${SITE.url}/#business`,
        name: SITE.name,
        url: SITE.url,
        description: SITE.description,
        logo: absoluteUrl(SITE.logo),
        image: absoluteUrl(SITE.image),
        telephone: SITE.phone,
        email: SITE.email,
        areaServed: SITE.cities.map((city) => ({ "@type": "City", name: city, containedInPlace: { "@type": "Country", name: "Nigeria" } })),
        knowsAbout: ["Solid waste collection", "Waste management", "Waste education and awareness"],
        contactPoint: {
            "@type": "ContactPoint",
            telephone: SITE.phone,
            email: SITE.email,
            contactType: "customer service",
            areaServed: "NG",
            availableLanguage: "English",
        },
        hasOfferCatalog: {
            "@type": "OfferCatalog",
            name: "Waste collection services",
            itemListElement: SERVICES.map((service) => ({
                "@type": "Offer",
                itemOffered: { "@type": "Service", name: service.name, description: service.description },
            })),
        },
    };
}

export function websiteJsonLd() {
    return {
        "@context": "https://schema.org",
        "@type": "WebSite",
        "@id": `${SITE.url}/#website`,
        url: SITE.url,
        name: SITE.name,
        inLanguage: "en-NG",
        publisher: { "@id": `${SITE.url}/#business` },
    };
}

export function servicesJsonLd() {
    return SERVICES.map((service) => ({
        "@context": "https://schema.org",
        "@type": "Service",
        name: service.name,
        description: service.description,
        provider: { "@id": `${SITE.url}/#business` },
        areaServed: SITE.cities.map((city) => ({ "@type": "City", name: city })),
    }));
}
