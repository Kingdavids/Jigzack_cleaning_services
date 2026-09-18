'use client'
import "./globals.css";

import type { ReactNode } from "react";
import { Plus_Jakarta_Sans } from "next/font/google";
import { AuthProvider } from "@/components/context/AuthProvider";
import { Toaster } from "sonner";

const jakarta = Plus_Jakarta_Sans({
    subsets: ["latin"],
    variable: "--font-jakarta",
    display: "swap",
});

export default function RootLayout({ children }: { children: ReactNode }) {
    return (
        <html lang="en" className={jakarta.variable}>
        <body className="bg-slate-950 text-white">
        <AuthProvider>
            {children}
            <Toaster />
        </AuthProvider>
        </body>
        </html>
    );
}