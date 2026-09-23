import { requireDashboardAccess } from "@/lib/dashboard/requireDashboardAccess";
import DashboardShell from "@/components/dashboard/DashboardShell";
import SectionCard from "@/components/dashboard/SectionCard";
import UploadsGallery from "@/components/dashboard/UploadsGallery";

type UploadRow = {
    id: string;
    task_id?: string | null;
    image_url: string | null;
    task_title?: string | null;
    photo_type?: string | null;
    created_at?: string | null;
};

export default async function EmployeeUploadsPage() {
    const { profile, supabase, unreadCount } = await requireDashboardAccess("employee");

    const { data: uploadData } = await supabase
        .from("uploads")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(120);

    const uploads: UploadRow[] = uploadData ?? [];

    return (
        <DashboardShell
            role="employee"
            profileId={profile.id}
            title="Task Uploads"
            subtitle="Your before and after photos."
            unreadCount={unreadCount}
        >
            <SectionCard title="Task Uploads" description="Grouped by task, with before and after photos kept apart.">
                {uploads.length === 0 ? (
                    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-5 text-sm text-white/50">
                        No uploads available.
                    </div>
                ) : (
                    <UploadsGallery
                        uploads={uploads.map((upload) => ({
                            id: upload.id,
                            task_id: upload.task_id ?? null,
                            image_url: upload.image_url,
                            photo_type: upload.photo_type ?? null,
                            title: upload.task_title ?? "Task upload",
                            people: "",
                            created_at: upload.created_at ?? null,
                        }))}
                    />
                )}
            </SectionCard>
        </DashboardShell>
    );
}
