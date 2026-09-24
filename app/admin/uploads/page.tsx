import { requireDashboardAccess } from "@/lib/dashboard/requireDashboardAccess";
import DashboardShell from "@/components/dashboard/DashboardShell";
import SectionCard from "@/components/dashboard/SectionCard";
import UploadsGallery from "@/components/dashboard/UploadsGallery";
import { isFullAdmin } from "@/lib/auth/roles";

type ProfileRef = { full_name: string | null } | null;

type UploadRow = {
    id: string;
    task_id: string | null;
    task_title: string | null;
    image_url: string;
    photo_type: string | null;
    created_at: string | null;
    employee: ProfileRef;
    customer: ProfileRef;
};

export default async function AdminUploadsPage() {
    const { profile, supabase, unreadCount } = await requireDashboardAccess("admin");

    const { data: uploadsData } = await supabase
        .from("uploads")
        .select(
            "id, task_id, task_title, image_url, photo_type, created_at, employee:profiles!uploads_employee_id_fkey(full_name), customer:profiles!uploads_customer_id_fkey(full_name)"
        )
        .order("created_at", { ascending: false })
        .limit(120);

    const uploads = (uploadsData ?? []) as unknown as UploadRow[];

    return (
        <DashboardShell
            role="admin"
            profileId={profile.id}
            title="Task Uploads"
            subtitle="Photos uploaded by employees."
            unreadCount={unreadCount}
        >
            <SectionCard title="Task uploads" description="Grouped by task, with before and after photos kept apart.">
                {uploads.length === 0 ? (
                    <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5 text-sm text-white/60">
                        No uploads yet.
                    </div>
                ) : (
                    <UploadsGallery
                        canDelete={isFullAdmin(profile)}
                        uploads={uploads.map((upload) => ({
                            id: upload.id,
                            task_id: upload.task_id,
                            image_url: upload.image_url,
                            photo_type: upload.photo_type,
                            title: upload.task_title ?? "Task upload",
                            people: [
                                upload.customer?.full_name,
                                upload.employee?.full_name ? `by ${upload.employee.full_name}` : null,
                            ]
                                .filter(Boolean)
                                .join(" · "),
                            created_at: upload.created_at,
                        }))}
                    />
                )}
            </SectionCard>
        </DashboardShell>
    );
}
