'use client'
import "./globals.css";

import { AuthProvider } from "@/components/context/AuthProvider";
import { Toaster } from "sonner";

export default function RootLayout({ children }) {
    return (
        <html lang="en">
        <body className="bg-slate-950 text-white">
        <AuthProvider>
            {children}
            <Toaster />
        </AuthProvider>
        </body>
        </html>
    );
}