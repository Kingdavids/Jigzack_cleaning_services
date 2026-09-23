// The property/facility fields collected on the customer setup form. They're
// stored as strings inside customers.facility_details (jsonb).

export type FacilityDef = { key: string; label: string; unitLabel: string };

export const DOMESTIC_FACILITIES: FacilityDef[] = [
    { key: "duplexCount", label: "Duplex", unitLabel: "Duplex" },
    { key: "flatsCount", label: "Flats", unitLabel: "Flat" },
    { key: "miniFlatsCount", label: "Mini flats", unitLabel: "Mini flat" },
    { key: "bungalowCount", label: "Bungalows", unitLabel: "Bungalow" },
    { key: "terraceCount", label: "Terraces", unitLabel: "Terrace" },
    { key: "shopsCount", label: "Shops", unitLabel: "Shop" },
];

export const COMMERCIAL_FACILITIES: FacilityDef[] = [
    { key: "supermarketsCount", label: "Supermarkets", unitLabel: "Supermarket" },
    { key: "complexesCount", label: "Complexes", unitLabel: "Complex" },
    { key: "beachesCount", label: "Beaches", unitLabel: "Beach" },
    { key: "marketsCount", label: "Markets", unitLabel: "Market" },
    { key: "hotelsCount", label: "Hotels", unitLabel: "Hotel" },
    { key: "schoolsCount", label: "Schools", unitLabel: "School" },
    { key: "carWashBarsCount", label: "Car wash / bars", unitLabel: "Car wash / bar" },
    { key: "blockIndustryCount", label: "Block industry", unitLabel: "Block industry" },
    { key: "eateryCount", label: "Eatery", unitLabel: "Eatery" },
    { key: "workshopCount", label: "Workshop", unitLabel: "Workshop" },
];

export const FACILITY_TEXT_LABELS: Record<string, string> = {
    domesticOthers: "Other domestic",
    commercialOthers: "Other commercial",
};

export const ALL_FACILITIES = [...DOMESTIC_FACILITIES, ...COMMERCIAL_FACILITIES];

export type FacilityDetails = Record<string, string | number | null | undefined> | null | undefined;

export function facilityCount(details: FacilityDetails, key: string): number {
    const raw = details?.[key];
    const n = typeof raw === "number" ? raw : parseInt(String(raw ?? "").trim(), 10);
    return Number.isFinite(n) && n > 0 ? n : 0;
}

// Only the facilities the customer actually has, for display.
export function describeFacilities(details: FacilityDetails) {
    const counted = ALL_FACILITIES.map((f) => ({ label: f.label, count: facilityCount(details, f.key) })).filter(
        (f) => f.count > 0
    );

    const notes = Object.entries(FACILITY_TEXT_LABELS)
        .map(([key, label]) => ({ label, text: String(details?.[key] ?? "").trim() }))
        .filter((n) => n.text);

    return { counted, notes };
}
