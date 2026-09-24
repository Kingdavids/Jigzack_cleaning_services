'use client';

import { createContext, useContext, type ReactNode } from "react";

export type AdminLevel = "owner" | "admin" | "supervisor";

type Viewer = { isOwner: boolean; name: string | null; level: AdminLevel | null };

// Tells the dashboard chrome (sidebar label, name badge and so on) who is
// looking at it. The admin layout sets it; everywhere else it stays empty.
const ViewerContext = createContext<Viewer>({ isOwner: false, name: null, level: null });

export function ViewerProvider({
                                   isOwner,
                                   name = null,
                                   level = null,
                                   children,
                               }: {
    isOwner: boolean;
    name?: string | null;
    level?: AdminLevel | null;
    children: ReactNode;
}) {
    return <ViewerContext.Provider value={{ isOwner, name, level }}>{children}</ViewerContext.Provider>;
}

export const useViewer = () => useContext(ViewerContext);

export const LEVEL_LABEL: Record<AdminLevel, string> = {
    owner: "Owner",
    admin: "Admin",
    supervisor: "Supervisor (view only)",
};
