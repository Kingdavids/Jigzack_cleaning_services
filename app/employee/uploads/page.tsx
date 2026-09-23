import { requireDashboardAccess } from "@/lib/dashboard/requireDashboardAccess";
import DashboardShell from "@/components/dashboard/DashboardShell";
import SectionCard from "@/components/dashboard/SectionCard";
import UploadsGrid from "@/components/dashboard/UploadsGrid";

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
        .limit(24);

    const uploads: UploadRow[] = uploadData ?? [];

    return (
        <DashboardShell
            role="employee"
            profileId={profile.id}
            title="Task Uploads"
            subtitle="Your recent before and after photos."
            unreadCount={unreadCount}
        >
            <SectionCard title="Task Uploads" description="Your recent before and after photos.">
                {uploads.length === 0 ? (
                    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-5 text-sm text-white/50">
                        No uploads available.
                    </div>
                ) : (
                    <UploadsGrid
                        className="grid gap-4 md:grid-cols-2 xl:grid-cols-4"
                        uploads={uploads.map((upload) => ({
                            id: upload.id,
                            image_url: upload.image_url,
                            photo_type: upload.photo_type ?? null,
                            title: upload.task_title ?? "Task upload",
                            subtitle: formatDate(upload.created_at ?? null),
                        }))}
                    />
                )}
            </SectionCard>
        </DashboardShell>
    );
}
