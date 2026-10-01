'use client';

import { useSyncExternalStore } from "react";
import { useTheme } from "next-themes";
import { Moon, Sun } from "lucide-react";

// Switches between light and dark. Until someone uses it the app follows the
// device's own setting; after that their choice is remembered on this device.
export default function ThemeToggle({ className = "" }: { className?: string }) {
    const { resolvedTheme, setTheme } = useTheme();
    // The theme is only known in the browser, so the icon waits until then:
    // false while rendering on the server, true once running in the browser.
    const mounted = useSyncExternalStore(
        () => () => {},
        () => true,
        () => false
    );

    const isDark = !mounted || resolvedTheme !== "light";
    const label = isDark ? "Switch to light mode" : "Switch to dark mode";

    return (
        <button
            type="button"
            onClick={() => setTheme(isDark ? "light" : "dark")}
            aria-label={label}
            title={label}
            className={`inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-white/80 transition hover:bg-white/10 hover:text-white ${className}`}
        >
            {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </button>
    );
}
