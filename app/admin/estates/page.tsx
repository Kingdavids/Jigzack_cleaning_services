import { Building2 } from "lucide-react";
import { requireDashboardAccess } from "@/lib/dashboard/requireDashboardAccess";
import { promoteToEstate, createUnit } from "../actions";
import DashboardShell from "@/components/dashboard/DashboardShell";
import SectionCard from "@/components/dashboard/SectionCard";
import PromoteEstateForm from "@/components/dashboard/PromoteEstateForm";
import AddUnitForm from "@/components/dashboard/AddUnitForm";
import UnitPriceControl from "@/components/dashboard/UnitPriceControl";
import { naira } from "@/lib/customer/billing";
import { DOMESTIC_FACILITIES, type FacilityDetails } from "@/lib/customer/facilities";
import { UNIT_PRICES, buildLineItems, itemsTotal, unitLineItems, unitsCoverBilling } from "@/lib/billing/pricing";

type CustomerRow = {
    profile_id: string;
    full_name: string;
    address: string | null;
    is_estate: boolean;
    facility_details?: FacilityDetails;
    vacancies?: FacilityDetails;
};

type UnitRow = {
    id: string;
    estate_profile_id: string;
    label: string;
    created_at: string;
    property_type: string | null;
    monthly_rate: number | string | null;
    is_vacant: boolean;
};

const STANDARD_PRICES = DOMESTIC_FACILITIES.map((f) => ({ key: f.key, label: f.unitLabel, price: UNIT_PRICES[f.key] }));

export default async function AdminEstatesPage() {
    const { profile, supabase, unreadCount } = await requireDashboardAccess("admin");

    const { data: customersData } = await supabase
        .from("customers")
        .select("profile_id, full_name, address, is_estate, facility_details, vacancies")
        .order("full_name", { ascending: true });

    const customers = (customersData ?? []) as CustomerRow[];
    const estates = customers.filter((c) => c.is_estate);
    const promotionCandidates = customers.filter((c) => !c.is_estate && c.profile_id);

    // property_type, monthly_rate and is_vacant come from
    // estate-unit-pricing-2026-09.sql; fall back to plain labels until it runs.
    const FULL_UNIT_COLUMNS = "id, estate_profile_id, label, created_at, property_type, monthly_rate, is_vacant";
    const BASE_UNIT_COLUMNS = "id, estate_profile_id, label, created_at";

    const fullUnits = await supabase.from("units").select(FULL_UNIT_COLUMNS).order("created_at", { ascending: true });
    const unitsData = fullUnits.error
        ? ((await supabase.from("units").select(BASE_UNIT_COLUMNS).order("created_at", { ascending: true })).data ?? []).map((u) => ({
              ...u,
              property_type: null,
              monthly_rate: null,
              is_vacant: false,
          }))
        : fullUnits.data;

    const units = (unitsData ?? []) as unknown as UnitRow[];
    const unitsByEstate = new Map<string, UnitRow[]>();
    for (const unit of units) {
        const list = unitsByEstate.get(unit.estate_profile_id) ?? [];
        list.push(unit);
        unitsByEstate.set(unit.estate_profile_id, list);
    }

    return (
        <DashboardShell
            role="admin"
            profileId={profile.id}
            title="Estates"
            subtitle="Multi-unit properties billed as a single account, with tenant sub-accounts underneath."
            unreadCount={unreadCount}
        >
            <div className="space-y-6">
                <SectionCard
                    title="Promote a customer to an estate"
                    description="The estate signs up and gets approved as a regular customer first, then gets promoted here."
                >
                    <PromoteEstateForm
                        action={promoteToEstate}
                        candidates={promotionCandidates.map((c) => ({
                            profile_id: c.profile_id,
                            full_name: c.full_name,
                            address: c.address,
                        }))}
                    />
                </SectionCard>

                <SectionCard
                    title="Estates"
                    description="Each estate keeps one shared utility bill and task history. Give a unit its own type to have it billed on its own price."
                >
                    {estates.length === 0 ? (
                        <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5 text-sm text-white/60">
                            No estates yet.
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {estates.map((estate) => {
                                const estateUnits = unitsByEstate.get(estate.profile_id) ?? [];
                                const perUnitReady = unitsCoverBilling(estateUnits);
                                const total = itemsTotal(
                                    perUnitReady
                                        ? unitLineItems(estateUnits)
                                        : buildLineItems(estate.facility_details, estate.vacancies)
                                );
                                const needType = estateUnits.filter((u) => !u.property_type).length;

                                return (
                                    <div key={estate.profile_id} className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
                                        <div className="flex flex-wrap items-center justify-between gap-3">
                                            <div className="flex items-center gap-3">
                                                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-400/10 text-amber-300">
                                                    <Building2 className="h-5 w-5" />
                                                </div>
                                                <div>
                                                    <p className="font-bold">{estate.full_name}</p>
                                                    <p className="text-sm text-white/50">{estate.address ?? "No address on file"}</p>
                                                </div>
                                            </div>
                                            <div className="text-right">
                                                <p className="font-bold text-amber-300">{naira(total)}</p>
                                                <p className="text-[11px] text-white/40">
                                                    {perUnitReady
                                                        ? "billed per unit"
                                                        : estateUnits.length > 0
                                                            ? `billed by counts (${needType} of ${estateUnits.length} units need a type)`
                                                            : "billed by counts"}
                                                </p>
                                            </div>
                                        </div>

                                        <div className="mt-4 space-y-2">
                                            {estateUnits.map((unit) => (
                                                <UnitPriceControl
                                                    key={unit.id}
                                                    unitId={unit.id}
                                                    label={unit.label}
                                                    propertyType={unit.property_type}
                                                    monthlyRate={unit.monthly_rate === null ? null : Number(unit.monthly_rate)}
                                                    isVacant={unit.is_vacant}
                                                    standardPrices={STANDARD_PRICES}
                                                />
                                            ))}
                                            {estateUnits.length === 0 && <p className="text-sm text-white/40">No units added yet.</p>}
                                        </div>

                                        <div className="mt-4">
                                            <AddUnitForm action={createUnit} estateProfileId={estate.profile_id} />
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </SectionCard>
            </div>
        </DashboardShell>
    );
}
