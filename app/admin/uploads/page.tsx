import { requireDashboardAccess } from "@/lib/dashboard/requireDashboardAccess";
import DashboardShell from "@/components/dashboard/DashboardShell";
import SectionCard from "@/components/dashboard/SectionCard";
import PhotoTypeBadge from "@/components/dashboard/PhotoTypeBadge";

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
        .limit(6);

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
                <div className="grid gap-4 md:grid-cols-2">
                    {uploads.length === 0 ? (
                        <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5 text-sm text-white/60">
                            No uploads yet.
                        </div>
                    ) : (
                        uploads.map((upload) => (
                            <div
                                key={upload.id}
                                className={`overflow-hidden rounded-3xl border bg-white/[0.03] transition hover:border-white/20 ${
                                    upload.photo_type === "after"
                                        ? "border-emerald-400/25"
                                        : upload.photo_type === "before"
                                            ? "border-sky-400/25"
                                            : "border-white/10"
                                }`}
                            >
                                <div className="relative">
                                    <img
                                        src={upload.image_url}
                                        alt={upload.task_title ?? "Task upload"}
                                        className="h-44 w-full object-cover transition duration-700 hover:scale-105"
                                    />
                                    <div className="absolute left-3 top-3">
                                        <PhotoTypeBadge type={upload.photo_type} />
                                    </div>
                                </div>

                                <div className="p-4">
                                    <p className="font-bold">{upload.task_title ?? "Task upload"}</p>
                                    <p className="text-sm text-white/60">
                                        {upload.employee?.full_name ?? "Unknown employee"}
                                    </p>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </SectionCard>
        </DashboardShell>
    );
}
