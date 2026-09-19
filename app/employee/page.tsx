import { createClient } from "@/utils/supabase/server";
import { getUserProfile } from "@/lib/auth/getUserProfile";
import { redirect } from "next/navigation";
import { Clock3, MapPinned, Truck, ClipboardList, CheckCircle2, AlertTriangle } from "lucide-react";

import DashboardShell from "@/components/dashboard/DashboardShell";
import SectionCard from "@/components/dashboard/SectionCard";
import StatCard from "@/components/dashboard/StatCard";
import StatusBadge from "@/components/dashboard/StatusBadge";
import SendMessageForm from "@/components/dashboard/SendMessageForm";
import MessageThreadList, { type MessageRow } from "@/components/dashboard/MessageThreadList";
import MarkMessagesReadOnView from "@/components/dashboard/MarkMessagesReadOnView";
import { endTask, startTask, uploadTaskPhoto } from "@/app/employee/actions";
import { deleteMessage, replyToMessage, sendMessageToAdmin } from "@/lib/messaging-actions";

type TaskRow = {
    id: string;
    title: string;
    status: string | null;
    priority: string | null;
    scheduled_date: string | null;
    zone: string | null;
    employee_id: string | null;
    customer_id: string | null;
    customer_name?: string | null;
    created_at?: string | null;
};

type UploadRow = {
    id: string;
    task_id: string | null;
    image_url: string | null;
    task_title?: string | null;
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

export default async function EmployeePage() {
    const profile = await getUserProfile();

    if (profile.status !== "approved") {
        redirect("/auth/pending");
    }

    if (profile.role !== "employee") {
        redirect(`/${profile.role}`);
    }

    const supabase = await createClient();

    const { data: taskData, error: taskError } = await supabase
        .from("tasks")
        .select("*")
        .eq("employee_id", profile.id)
        .order("created_at", { ascending: false });

    if (taskError) {
        console.error("Failed to load employee tasks:", taskError.message);
    }

    const tasks: TaskRow[] = taskData ?? [];

    const { data: uploadData, error: uploadError } = await supabase
        .from("uploads")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(4);

    if (uploadError) {
        console.error("Failed to load uploads:", uploadError.message);
    }

    const uploads: UploadRow[] = uploadData ?? [];

    const { data: messagesData } = await supabase
        .from("messages")
        .select(
            "id, subject, body, created_at, parent_message_id, from_profile_id, to_profile_id, read_at, from_profile:profiles!messages_from_profile_id_fkey(full_name), to_profile:profiles!messages_to_profile_id_fkey(full_name)"
        )
        .or(`from_profile_id.eq.${profile.id},to_profile_id.eq.${profile.id}`)
        .order("created_at", { ascending: false })
        .limit(50);

    const messages = (messagesData ?? []) as unknown as MessageRow[];

    const unreadCount = messages.filter((m) => m.to_profile_id === profile.id && !m.read_at).length;

    const completed = tasks.filter(
        (t) => (t.status ?? "").toLowerCase() === "completed"
    ).length;

    const pending = tasks.filter(
        (t) => (t.status ?? "").toLowerCase() !== "completed"
    ).length;

    const highPriority = tasks.filter(
        (t) => (t.priority ?? "").toLowerCase() === "high"
    ).length;

    return (
        <DashboardShell
            role="employee"
            title="Employee Dashboard"
            subtitle="Track pickups, upload photos, and stay in touch with admin."
            unreadCount={unreadCount}
        >
            <MarkMessagesReadOnView unreadCount={unreadCount} />
            <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
                <StatCard
                    icon={Truck}
                    label="Assigned Pickups"
                    value={String(tasks.length)}
                    helper="Total assigned tasks"
                />
                <StatCard
                    icon={ClipboardList}
                    label="Pending Jobs"
                    value={String(pending)}
                    helper="Includes scheduled and active"
                />
                <StatCard
                    icon={CheckCircle2}
                    label="Completed"
                    value={String(completed)}
                    helper="Finished service tasks"
                />
                <StatCard
                    icon={AlertTriangle}
                    label="High Priority"
                    value={String(highPriority)}
                    helper="Urgent work orders"
                />
            </div>

            <SectionCard
                id="tasks"
                title="Assigned Tasks"
                description="Live overview of your service work orders."
            >
                <div className="space-y-4">
                    {tasks.length === 0 ? (
                        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-5 text-sm text-white/50">
                            No tasks assigned yet.
                        </div>
                    ) : (
                        tasks.map((task) => (
                            <div
                                key={task.id}
                                className="rounded-xl border border-white/10 bg-white/[0.03] p-4"
                            >
                                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                                    <div>
                                        <div className="flex flex-wrap items-center gap-2">
                                            <p className="text-lg font-bold">{task.title}</p>
                                            <StatusBadge status={(task.status ?? "pending").toLowerCase()} />
                                        </div>

                                        <p className="mt-2 text-sm text-white/60">
                                            Customer: {task.customer_name ?? "Assigned client"}
                                        </p>

                                        <div className="mt-3 flex flex-wrap gap-4 text-sm text-white/50">
                                            <span className="inline-flex items-center gap-2">
                                                <Clock3 className="h-4 w-4" />
                                                {formatDate(task.scheduled_date)}
                                            </span>
                                            <span className="inline-flex items-center gap-2">
                                                <MapPinned className="h-4 w-4" />
                                                {task.zone ?? "Unassigned zone"}
                                            </span>
                                        </div>
                                    </div>

                                    <div className="flex flex-col gap-3 lg:min-w-[280px]">
                                        <div className="flex gap-3">
                                            <form action={startTask}>
                                                <input type="hidden" name="taskId" value={task.id} />
                                                <button
                                                    type="submit"
                                                    className="rounded-xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-2 text-sm font-semibold text-emerald-300 transition hover:bg-emerald-500/20"
                                                >
                                                    Start Task
                                                </button>
                                            </form>

                                            <form action={endTask}>
                                                <input type="hidden" name="taskId" value={task.id} />
                                                <button
                                                    type="submit"
                                                    className="rounded-xl bg-amber-400 px-4 py-2 text-sm font-bold text-black transition hover:bg-amber-300"
                                                >
                                                    End Task
                                                </button>
                                            </form>
                                        </div>

                                        <div className="grid gap-3 sm:grid-cols-2">
                                            <form action={uploadTaskPhoto} className="rounded-xl border border-white/10 bg-black/20 p-3">
                                                <input type="hidden" name="taskId" value={task.id} />
                                                <input type="hidden" name="photoType" value="before" />
                                                <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.15em] text-white/45">
                                                    Before Photo
                                                </label>
                                                <input
                                                    type="file"
                                                    name="photo"
                                                    accept="image/*"
                                                    className="mb-3 block w-full text-sm text-white/60 file:mr-3 file:rounded-lg file:border-0 file:bg-white/10 file:px-3 file:py-2 file:text-sm file:text-white"
                                                />
                                                <button
                                                    type="submit"
                                                    className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-white transition hover:bg-white/10"
                                                >
                                                    Upload
                                                </button>
                                            </form>

                                            <form action={uploadTaskPhoto} className="rounded-xl border border-white/10 bg-black/20 p-3">
                                                <input type="hidden" name="taskId" value={task.id} />
                                                <input type="hidden" name="photoType" value="after" />
                                                <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.15em] text-white/45">
                                                    After Photo
                                                </label>
                                                <input
                                                    type="file"
                                                    name="photo"
                                                    accept="image/*"
                                                    className="mb-3 block w-full text-sm text-white/60 file:mr-3 file:rounded-lg file:border-0 file:bg-white/10 file:px-3 file:py-2 file:text-sm file:text-white"
                                                />
                                                <button
                                                    type="submit"
                                                    className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-white transition hover:bg-white/10"
                                                >
                                                    Upload
                                                </button>
                                            </form>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </SectionCard>

            <SectionCard
                id="uploads"
                title="Task Uploads"
                description="Recent before/after photos across the team."
            >
                {uploads.length === 0 ? (
                    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-5 text-sm text-white/50">
                        No uploads available.
                    </div>
                ) : (
                    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                        {uploads.map((upload) => (
                            <div
                                key={upload.id}
                                className="overflow-hidden rounded-xl border border-white/10 bg-white/[0.03]"
                            >
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

                                <div className="p-4">
                                    <p className="font-bold">{upload.task_title ?? "Task upload"}</p>
                                    <p className="text-sm text-white/50">{formatDate(upload.created_at ?? null)}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </SectionCard>

            <SectionCard id="messages" title="Messages" description="Contact admin">
                <div className="space-y-4">
                    <MessageThreadList
                        messages={messages}
                        currentProfileId={profile.id}
                        replyAction={replyToMessage}
                        deleteAction={deleteMessage}
                    />

                    <SendMessageForm action={sendMessageToAdmin} label="Send a message to Admin">
                        <input
                            name="subject"
                            placeholder="Subject"
                            required
                            className="h-11 w-full rounded-xl border border-white/10 bg-white/8 px-3 text-sm text-white outline-none placeholder:text-white/30"
                        />

                        <textarea
                            name="body"
                            placeholder="Message"
                            required
                            className="min-h-[90px] w-full rounded-xl border border-white/10 bg-white/8 px-3 py-2 text-sm text-white outline-none placeholder:text-white/30"
                        />
                    </SendMessageForm>
                </div>
            </SectionCard>
        </DashboardShell>
    );
}
