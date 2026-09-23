import type { Metadata } from "next";
import type { ReactNode } from "react";
import { PRIVATE_PAGE } from "@/lib/seo";

// Signed-in areas are never indexed.
export const metadata: Metadata = PRIVATE_PAGE;

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
