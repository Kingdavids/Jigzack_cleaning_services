import Image from "next/image";
import { describeFacilities, type FacilityDetails } from "@/lib/customer/facilities";
import { BANK_ACCOUNT } from "@/lib/bank-details";


export function DocumentHeader({
                                   title,
                                   subtitle,
                                   right,
                               }: {
    title: string;
    subtitle?: string;
    right: React.ReactNode;
}) {
    return (
        <div className="flex items-start justify-between gap-4 border-b border-black/15 pb-3">
            <div className="flex items-start gap-3">
                <Image
                    src="/images/lawma-logo.png"
                    alt="Lagos Waste Management Authority logo"
                    width={56}
                    height={56}
                    className="shrink-0"
                />
                <div>
                    <h1 className="text-2xl font-black leading-tight tracking-tight">{title}</h1>
                    <p className="mt-1 text-sm font-semibold">JIGZACK CLEANING SERVICES</p>
                    {subtitle && <p className="text-xs text-black/65">{subtitle}</p>}
                </div>
            </div>
            <div className="text-right text-xs leading-5">{right}</div>
        </div>
    );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
    if (value === null || value === undefined || value === "") return null;

    return (
        <p className="leading-5">
            <span className="font-semibold">{label}:</span> {value}
        </p>
    );
}

type PropertyCustomer = {
    full_name?: string | null;
    email?: string | null;
    phone?: string | null;
    whatsapp_number?: string | null;
    address?: string | null;
    lga?: string | null;
    state?: string | null;
    landmark?: string | null;
    property_type?: string | null;
    property_class?: string | null;
    property_code?: string | null;
    account_code?: string | null;
    preferred_pickup_frequency?: string | null;
    facility_details?: FacilityDetails;
    vacancies?: FacilityDetails;
} | null;

// The customer and property the bill is for.
export function PropertyDetailsBlock({ customer, fallbackName }: { customer: PropertyCustomer; fallbackName?: string | null }) {
    const { counted } = describeFacilities(customer?.facility_details);
    const vacant = describeFacilities(customer?.vacancies).counted;

    return (
        <div className="grid gap-3 text-xs sm:grid-cols-2">
            <div className="rounded-lg border border-black/15 bg-white/50 p-3">
                <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.15em] text-black/50">Billed to</p>
                <Row label="Account holder" value={customer?.full_name ?? fallbackName ?? "Customer"} />
                <Row label="Phone" value={customer?.phone} />
                <Row label="WhatsApp" value={customer?.whatsapp_number} />
                <Row label="Email" value={customer?.email} />
                <Row label="Account code" value={customer?.account_code} />
            </div>

            <div className="rounded-lg border border-black/15 bg-white/50 p-3">
                <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.15em] text-black/50">Property</p>
                <Row label="Address" value={customer?.address} />
                <Row
                    label="Area"
                    value={[customer?.landmark ? `near ${customer.landmark}` : null, customer?.lga, customer?.state]
                        .filter(Boolean)
                        .join(", ")}
                />
                <Row
                    label="Type"
                    value={[customer?.property_type, customer?.property_class].filter(Boolean).join(" / ") || "Residential"}
                />
                <Row label="Property code" value={customer?.property_code} />
                <Row
                    label="Units"
                    value={counted.length > 0 ? counted.map((f) => `${f.label} ${f.count}`).join(", ") : undefined}
                />
                <Row label="Pickups" value={customer?.preferred_pickup_frequency} />
                {vacant.length > 0 && (
                    <Row label="Vacant (not billed)" value={vacant.map((f) => `${f.label} ${f.count}`).join(", ")} />
                )}
            </div>
        </div>
    );
}

// Account name sits with the bank details (not off in a corner) and is
// bold and red so it can't be missed or mistyped.
export function PaymentDetailsBlock({ reference }: { reference: string }) {
    return (
        <div className="rounded-lg border-2 border-red-700 bg-white/60 p-3 text-xs">
            <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-red-700">Payment details</p>
            <p className="mt-1 text-sm font-extrabold text-red-700">
                Account Name: {BANK_ACCOUNT.name}
            </p>
            <div className="mt-1 space-y-0.5">
                {BANK_ACCOUNT.banks.map((b) => (
                    <p key={b.bank} className="text-sm font-bold text-black">
                        {b.bank}: <span className="tracking-wide">{b.number}</span>
                    </p>
                ))}
            </div>
            <p className="mt-1.5 text-[11px] text-black/65">
                Please use <strong>{reference}</strong> as your payment reference.
            </p>
        </div>
    );
}

export function SupportBlock() {
    return (
        <div className="rounded-lg border border-black/15 bg-white/50 p-3 text-xs">
            <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-black/50">Support</p>
            <p className="mt-1 leading-5">LAWMA Response: 5577 / 07080601020 / 07055893400</p>
            <p className="leading-5">Jigzack Cleaning Services: 0703 433 9721 / 0708 680 8079</p>
        </div>
    );
}
