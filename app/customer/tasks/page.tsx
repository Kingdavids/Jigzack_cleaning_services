import { redirect } from "next/navigation";

// Pickups, the last service's before/after photos and service history now
// live on the dashboard itself.
export default function CustomerTasksPage() {
    redirect("/customer");
}
