import type { Metadata } from "next";
import type { ReactNode } from "react";
import { getUserProfile } from "@/lib/auth/getUserProfile";
import { isViewOnlyAdmin } from "@/lib/auth/roles";
import { PRIVATE_PAGE } from "@/lib/seo";

// Signed-in areas are never indexed.
export const metadata: Metadata = PRIVATE_PAGE;

// View-only admins can open every admin page, so a strip across the top says
// so. The server and the database both refuse their changes; this is the
// explanation, not the protection.
export default async function Layout({ children }: { children: ReactNode }) {
  const profile = await getUserProfile();

  return (
    <>
      {isViewOnlyAdmin(profile) && (
        <div role="status" className="bg-sky-500/15 px-4 py-2 text-center text-sm font-semibold text-sky-200">
          You have view-only access. You can look at everything, but changes are turned off for your account.
        </div>
      )}
      {children}
    </>
  );
}
