import { redirect } from "next/navigation";

// "My Tasks" became the Schedule page.
export default function CustomerTasksPage() {
    redirect("/customer/schedule");
}
