import { redirect } from "next/navigation";
import Link from "next/link";
import { requireDashboardAccess } from "@/lib/dashboard/requireDashboardAccess";
import DashboardShell from "@/components/dashboard/DashboardShell";
import SectionCard from "@/components/dashboard/SectionCard";
import PropertyDetailsForm from "@/components/dashboard/PropertyDetailsForm";

export default async function CustomerPropertyDetailsPage({
                                                               params,
                                                           }: {
    params: Promise<{ linkedProfileId: string }>;
}) {
    const { linkedProfileId } = await params;
    const { profile, supabase, unreadCount } = await requireDashboardAccess("customer");

    const { data: link } = await supabase
        .from("property_links")
        .select("id")
        .eq("primary_profile_id", profile.id)
        .eq("linked_profile_id", linkedProfileId)
        .maybeSingle();

    if (!link) redirect("/customer");

    const { data: property } = await supabase.from("customers").select("*").eq("profile_id", linkedProfileId).maybeSingle();

    if (!property) redirect("/customer");

    return (
        <DashboardShell role="customer" profileId={profile.id} title="Add a property" subtitle="Fill this in the same way you did for your first property." unreadCount={unreadCount}>
            <SectionCard title="Property details" description="This bills and schedules separately from your other property.">
                <PropertyDetailsForm linkedProfileId={linkedProfileId} defaults={property} />
            </SectionCard>

            <div className="mt-4">
                <Link href="/customer" className="text-sm font-semibold text-amber-300 underline underline-offset-2">
                    Back to my dashboard
                </Link>
            </div>
        </DashboardShell>
    );
}
