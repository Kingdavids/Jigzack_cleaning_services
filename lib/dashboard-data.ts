import { Customer, Employee, Message, Payment, SignupRequest, Task, Upload } from "./dashboard-types";

export const signupRequests: SignupRequest[] = [
    {
        id: "SR-001",
        fullName: "Ada Eze",
        email: "ada@example.com",
        requestedRole: "customer",
        createdAt: "2026-03-20",
    },
    {
        id: "SR-002",
        fullName: "Tosin Adeyemi",
        email: "tosin@example.com",
        requestedRole: "employee",
        createdAt: "2026-03-21",
    },
];

export const customers: Customer[] = [
    {
        id: "CUS-001",
        fullName: "Faith Okoro",
        email: "faith@example.com",
        phone: "+234 801 000 1001",
        address: "Lekki, Lagos",
        lastServiced: "2026-03-18",
        balance: 12000,
        status: "active",
    },
    {
        id: "CUS-002",
        fullName: "Deji Akin",
        email: "deji@example.com",
        phone: "+234 801 000 1002",
        address: "Ikeja, Lagos",
        lastServiced: "2026-03-15",
        balance: 0,
        status: "active",
    },
    {
        id: "CUS-003",
        fullName: "Portside Mall",
        email: "manager@portside.com",
        phone: "+234 801 000 1003",
        address: "Port Harcourt",
        lastServiced: "2026-03-10",
        balance: 35000,
        status: "inactive",
    },
];

export const employees: Employee[] = [
    {
        id: "EMP-001",
        fullName: "Samuel Peter",
        email: "samuel@jigzack.com",
        phone: "+234 802 000 1101",
        role: "Field Supervisor",
        active: true,
    },
    {
        id: "EMP-002",
        fullName: "Chioma David",
        email: "chioma@jigzack.com",
        phone: "+234 802 000 1102",
        role: "Collection Staff",
        active: true,
    },
];

export const tasks: Task[] = [
    {
        id: "TSK-001",
        title: "Residential pickup - Lekki Phase 1",
        customerName: "Faith Okoro",
        employeeName: "Samuel Peter",
        status: "in_progress",
        scheduledDate: "2026-03-22",
        updatedAt: "2026-03-22 09:15",
    },
    {
        id: "TSK-002",
        title: "Commercial disposal - Portside Mall",
        customerName: "Portside Mall",
        employeeName: "Chioma David",
        status: "pending",
        scheduledDate: "2026-03-23",
        updatedAt: "2026-03-21 16:05",
    },
    {
        id: "TSK-003",
        title: "Monthly pickup - Ikeja residence",
        customerName: "Deji Akin",
        employeeName: "Samuel Peter",
        status: "completed",
        scheduledDate: "2026-03-20",
        updatedAt: "2026-03-20 14:30",
    },
];

export const payments: Payment[] = [
    {
        id: "PAY-001",
        customerName: "Faith Okoro",
        amount: 18000,
        date: "2026-03-18",
        status: "paid",
    },
    {
        id: "PAY-002",
        customerName: "Portside Mall",
        amount: 35000,
        date: "2026-03-15",
        status: "pending",
    },
];

export const messages: Message[] = [
    {
        id: "MSG-001",
        from: "Admin",
        to: "Faith Okoro",
        subject: "Your next pickup schedule",
        preview: "Your pickup has been scheduled for Monday morning.",
        createdAt: "2026-03-21",
    },
    {
        id: "MSG-002",
        from: "Admin",
        to: "Samuel Peter",
        subject: "Task reassignment",
        preview: "Please handle the Lekki route tomorrow.",
        createdAt: "2026-03-21",
    },
];

export const uploads: Upload[] = [
    {
        id: "UP-001",
        taskTitle: "Monthly pickup - Ikeja residence",
        employeeName: "Samuel Peter",
        imageUrl: "/images/domestic-waste.jpg",
        uploadedAt: "2026-03-20 14:35",
    },
    {
        id: "UP-002",
        taskTitle: "Commercial disposal - Portside Mall",
        employeeName: "Chioma David",
        imageUrl: "/images/commercial-waste.jpg",
        uploadedAt: "2026-03-19 17:20",
    },
];