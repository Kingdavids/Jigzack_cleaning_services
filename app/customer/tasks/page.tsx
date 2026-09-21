import { requireDashboardAccess } from "@/lib/dashboard/requireDashboardAccess";
import DashboardShell from "@/components/dashboard/DashboardShell";
import SectionCard from "@/components/dashboard/SectionCard";
import StatusBadge from "@/components/dashboard/StatusBadge";

function formatDate(value: string | null | undefined) {
    if (!value) return "Not available";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleDateString("en-CA", {
        year: "numeric",
        month: "short",
        day: "numeric",
    });
}

export default async function CustomerTasksPage() {
    const { profile, supabase, unreadCount, customer } = await requireDashboardAccess("customer");

    const { data: pickupsData } = await supabase
        .from("tasks")
        .select("*")
        .eq("customer_id", profile.id)
        .order("scheduled_date", { ascending: true });

    const pickups = pickupsData ?? [];

    const { data: uploadsData } = await supabase
        .from("uploads")
        .select("*")
        .eq("customer_id", profile.id)
        .order("created_at", { ascending: false });

    const uploads = uploadsData ?? [];

    const now = new Date();

    const nextPickup =
        pickups.find((pickup) => {
            if (!pickup.scheduled_date) return false;
            return new Date(pickup.scheduled_date) >= now;
        }) ?? null;

    return (
        <DashboardShell
            role="customer"
            title="My Tasks"
            subtitle="Your next scheduled service and service photos."
            unreadCount={unreadCount}
        >
            <div className="grid gap-6 2xl:grid-cols-2">
                <SectionCard title="Upcoming Pickup" description="Your next scheduled service">
                    {!nextPickup ? (
                        <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5 text-sm text-white/60">
                            No upcoming pickup scheduled.
                        </div>
                    ) : (
                        <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
                            <div className="flex items-start justify-between gap-4">
                                <div>
                                    <p className="font-bold text-lg">{nextPickup.title ?? "Scheduled Pickup"}</p>
                                    <p className="mt-2 text-sm text-white/60">
                                        {customer?.address ?? "No address available"}
                                    </p>
                                    <p className="mt-2 text-sm text-white/60">
                                        Scheduled: {formatDate(nextPickup.scheduled_date)}
                                    </p>
                                    <p className="mt-2 text-sm text-white/60">
                                        Zone: {nextPickup.zone ?? "Not assigned"}
                                    </p>
                                </div>
                                <StatusBadge status={nextPickup.status ?? "pending"} />
                            </div>
                        </div>
                    )}
                </SectionCard>

                <SectionCard title="Service Photos" description="Before and after task uploads">
                    {uploads.length === 0 ? (
                        <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5 text-sm text-white/60">
                            No service photos uploaded yet.
                        </div>
                    ) : (
                        <div className="grid gap-4 md:grid-cols-2">
                            {uploads.slice(0, 6).map((upload) => (
                                <div
                                    key={upload.id}
                                    className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03] shadow"
                                >
                                    {upload.image_url ? (
                                        <img
                                            src={upload.image_url}
                                            alt={upload.photo_type ?? "Service photo"}
                                            className="h-44 w-full object-cover"
                                        />
                                    ) : (
                                        <div className="flex h-44 items-center justify-center bg-black/20 text-sm text-white/40">
                                            No image
                                        </div>
                                    )}

                                    <div className="p-4">
                                        <p className="font-bold capitalize">
                                            {upload.photo_type ?? "Service photo"}
                                        </p>
                                        <p className="text-sm text-white/60">
                                            {formatDate(upload.created_at)}
                                        </p>
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
