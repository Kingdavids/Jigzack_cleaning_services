import { requireDashboardAccess } from "@/lib/dashboard/requireDashboardAccess";
import DashboardShell from "@/components/dashboard/DashboardShell";
import SectionCard from "@/components/dashboard/SectionCard";

type ProfileRef = { full_name: string | null } | null;

type UploadRow = {
    id: string;
    task_title: string | null;
    image_url: string;
    employee: ProfileRef;
};

export default async function AdminUploadsPage() {
    const { supabase, unreadCount } = await requireDashboardAccess("admin");

    const { data: uploadsData } = await supabase
        .from("uploads")
        .select("id, task_title, image_url, employee:profiles!uploads_employee_id_fkey(full_name)")
        .order("created_at", { ascending: false })
        .limit(6);

    const uploads = (uploadsData ?? []) as unknown as UploadRow[];

    return (
        <DashboardShell
            role="admin"
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
                                className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03] transition hover:border-white/20"
                            >
                                <img
                                    src={upload.image_url}
                                    alt={upload.task_title ?? "Task upload"}
                                    className="h-44 w-full object-cover transition duration-700 hover:scale-105"
                                />

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
