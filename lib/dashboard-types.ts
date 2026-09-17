export type UserRole = "admin" | "customer" | "employee";

export type TaskStatus = "pending" | "in_progress" | "completed" | "declined";

export interface Customer {
    id: string;
    fullName: string;
    email: string;
    phone: string;
    address: string;
    lastServiced: string;
    balance: number;
    status: "active" | "inactive";
}

export interface Employee {
    id: string;
    fullName: string;
    email: string;
    phone: string;
    role: string;
    active: boolean;
}

export interface Task {
    id: string;
    title: string;
    customerName: string;
    employeeName: string;
    status: TaskStatus;
    scheduledDate: string;
    updatedAt: string;
}

export interface SignupRequest {
    id: string;
    fullName: string;
    email: string;
    requestedRole: "customer" | "employee";
    createdAt: string;
}

export interface Payment {
    id: string;
    customerName: string;
    amount: number;
    date: string;
    status: "paid" | "pending" | "failed";
}

export interface Message {
    id: string;
    from: string;
    to: string;
    subject: string;
    preview: string;
    createdAt: string;
}

export interface Upload {
    id: string;
    taskTitle: string;
    employeeName: string;
    imageUrl: string;
    uploadedAt: string;
}