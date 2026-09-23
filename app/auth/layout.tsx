import type { Metadata } from "next";
import type { ReactNode } from "react";
import { PRIVATE_PAGE } from "@/lib/seo";

// Log in, sign up and every step of account setup stay out of search results.
export const metadata: Metadata = { ...PRIVATE_PAGE, title: "Log in or sign up" };

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
