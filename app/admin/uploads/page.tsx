import { requireDashboardAccess } from "@/lib/dashboard/requireDashboardAccess";
import DashboardShell from "@/components/dashboard/DashboardShell";
import SectionCard from "@/components/dashboard/SectionCard";
import UploadsGrid from "@/components/dashboard/UploadsGrid";

type ProfileRef = { full_name: string | null } | null;

type UploadRow = {
    id: string;
    task_title: string | null;
    image_url: string;
    photo_type: string | null;
    employee: ProfileRef;
};

export default async function AdminUploadsPage() {
    const { profile, supabase, unreadCount } = await requireDashboardAccess("admin");

    const { data: uploadsData } = await supabase
        .from("uploads")
        .select("id, task_title, image_url, photo_type, employee:profiles!uploads_employee_id_fkey(full_name)")
        .order("created_at", { ascending: false })
        .limit(24);

    const uploads = (uploadsData ?? []) as unknown as UploadRow[];

    return (
        <DashboardShell
            role="admin"
            profileId={profile.id}
            title="Task Uploads"
            subtitle="Photos uploaded by employees."
            unreadCount={unreadCount}
        >
            <SectionCard title="Task uploads" description="Photos uploaded by employees.">
                {uploads.length === 0 ? (
                    <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5 text-sm text-white/60">
                        No uploads yet.
                    </div>
                ) : (
                    <UploadsGrid
                        uploads={uploads.map((upload) => ({
                            id: upload.id,
                            image_url: upload.image_url,
                            photo_type: upload.photo_type,
                            title: upload.task_title ?? "Task upload",
                            subtitle: upload.employee?.full_name ?? "Unknown employee",
                        }))}
                    />
                )}
            </SectionCard>
        </DashboardShell>
    );
}
