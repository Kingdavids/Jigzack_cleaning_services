'use client';

import { createContext, useContext, type ReactNode } from "react";

// Tells the dashboard chrome (sidebar label and so on) whether the person
// looking at it is an owner. The admin layout sets it; everywhere else it
// stays false.
const ViewerContext = createContext({ isOwner: false });

export function ViewerProvider({ isOwner, children }: { isOwner: boolean; children: ReactNode }) {
    return <ViewerContext.Provider value={{ isOwner }}>{children}</ViewerContext.Provider>;
}

export const useViewer = () => useContext(ViewerContext);
