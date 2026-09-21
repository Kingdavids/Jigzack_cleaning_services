import { requireDashboardAccess } from "@/lib/dashboard/requireDashboardAccess";
import DashboardShell from "@/components/dashboard/DashboardShell";
import SectionCard from "@/components/dashboard/SectionCard";
import PhotoTypeBadge from "@/components/dashboard/PhotoTypeBadge";

type UploadRow = {
    id: string;
    image_url: string | null;
    task_title?: string | null;
    photo_type?: string | null;
    created_at?: string | null;
};

function formatDate(value: string | null) {
    if (!value) return "Not scheduled";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleDateString("en-CA", {
        year: "numeric",
        month: "short",
        day: "numeric",
    });
}

export default async function EmployeeUploadsPage() {
    const { profile, supabase, unreadCount } = await requireDashboardAccess("employee");

    const { data: uploadData } = await supabase
        .from("uploads")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(4);

    const uploads: UploadRow[] = uploadData ?? [];

    return (
        <DashboardShell
            role="employee"
            profileId={profile.id}
            title="Task Uploads"
            subtitle="Recent before/after photos across the team."
            unreadCount={unreadCount}
        >
            <SectionCard title="Task Uploads" description="Recent before/after photos across the team.">
                {uploads.length === 0 ? (
                    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-5 text-sm text-white/50">
                        No uploads available.
                    </div>
                ) : (
                    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                        {uploads.map((upload) => (
                            <div
                                key={upload.id}
                                className={`overflow-hidden rounded-xl border bg-white/[0.03] ${
                                    upload.photo_type === "after"
                                        ? "border-emerald-400/25"
                                        : upload.photo_type === "before"
                                            ? "border-sky-400/25"
                                            : "border-white/10"
                                }`}
                            >
                                <div className="relative">
                                    {upload.image_url ? (
                                        <img
                                            src={upload.image_url}
                                            alt={upload.task_title ?? "Task upload"}
                                            className="h-40 w-full object-cover"
                                        />
                                    ) : (
                                        <div className="flex h-40 items-center justify-center bg-black/20 text-sm text-white/40">
                                            No image
                                        </div>
                                    )}
                                    <div className="absolute left-3 top-3">
                                        <PhotoTypeBadge type={upload.photo_type} />
                                    </div>
                                </div>

                                <div className="p-4">
                                    <p className="font-bold">{upload.task_title ?? "Task upload"}</p>
                                    <p className="text-sm text-white/50">{formatDate(upload.created_at ?? null)}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </SectionCard>
        </DashboardShell>
    );
}
