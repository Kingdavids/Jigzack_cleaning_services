import { Building2, Home } from "lucide-react";
import { requireDashboardAccess } from "@/lib/dashboard/requireDashboardAccess";
import { promoteToEstate, createUnit } from "../actions";
import DashboardShell from "@/components/dashboard/DashboardShell";
import SectionCard from "@/components/dashboard/SectionCard";
import PromoteEstateForm from "@/components/dashboard/PromoteEstateForm";
import AddUnitForm from "@/components/dashboard/AddUnitForm";

type CustomerRow = {
    profile_id: string;
    full_name: string;
    address: string | null;
    is_estate: boolean;
};

type UnitRow = {
    id: string;
    estate_profile_id: string;
    label: string;
    created_at: string;
};

export default async function AdminEstatesPage() {
    const { profile, supabase, unreadCount } = await requireDashboardAccess("admin");

    const { data: customersData } = await supabase
        .from("customers")
        .select("profile_id, full_name, address, is_estate")
        .order("full_name", { ascending: true });

    const customers = (customersData ?? []) as CustomerRow[];
    const estates = customers.filter((c) => c.is_estate);
    const promotionCandidates = customers.filter((c) => !c.is_estate && c.profile_id);

    const { data: unitsData } = await supabase
        .from("units")
        .select("id, estate_profile_id, label, created_at")
        .order("created_at", { ascending: true });

    const units = (unitsData ?? []) as UnitRow[];
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

                <SectionCard title="Estates" description="Each estate keeps one shared utility bill and task history.">
                    {estates.length === 0 ? (
                        <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5 text-sm text-white/60">
                            No estates yet.
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {estates.map((estate) => (
                                <div
                                    key={estate.profile_id}
                                    className="rounded-3xl border border-white/10 bg-white/[0.03] p-5"
                                >
                                    <div className="flex items-center gap-3">
                                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-400/10 text-amber-300">
                                            <Building2 className="h-5 w-5" />
                                        </div>
                                        <div>
                                            <p className="font-bold">{estate.full_name}</p>
                                            <p className="text-sm text-white/50">{estate.address ?? "No address on file"}</p>
                                        </div>
                                    </div>

                                    <div className="mt-4 space-y-2">
                                        {(unitsByEstate.get(estate.profile_id) ?? []).map((unit) => (
                                            <div
                                                key={unit.id}
                                                className="flex items-center gap-2 rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm"
                                            >
                                                <Home className="h-4 w-4 text-white/40" />
                                                {unit.label}
                                            </div>
                                        ))}
                                        {(unitsByEstate.get(estate.profile_id) ?? []).length === 0 && (
                                            <p className="text-sm text-white/40">No units added yet.</p>
                                        )}
                                    </div>

                                    <div className="mt-4">
                                        <AddUnitForm action={createUnit} estateProfileId={estate.profile_id} />
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </SectionCard>
            </div>
        </DashboardShell>
    );
}
