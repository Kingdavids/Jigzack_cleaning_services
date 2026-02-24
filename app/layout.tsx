'use client'
import "./globals.css";

import {AuthProvider} from "@/components/context/AuthProvider";
import { Toaster} from "sonner";
import Navbar from "@/components/Navbar";


export default function RootLayout({children}) {

  return (
    <html lang="en">
      <body>
      <Navbar />
      <div className="pt-28">
      <AuthProvider>{children}</AuthProvider>
      <Toaster />
      </div>
      </body>
    </html>
  );
}
