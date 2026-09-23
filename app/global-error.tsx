'use client';

// Last resort when even the root layout fails. It has to bring its own html
// and body, and can't rely on the site's styles.
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
    return (
        <html lang="en">
        <body
            style={{
                margin: 0,
                minHeight: "100vh",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: "#020617",
                color: "#fff",
                fontFamily: "system-ui, sans-serif",
                textAlign: "center",
                padding: "24px",
            }}
        >
        <div style={{ maxWidth: 420 }}>
            <h1 style={{ fontSize: 28, marginBottom: 12 }}>Something went wrong</h1>
            <p style={{ color: "rgba(255,255,255,0.65)", marginBottom: 24 }}>
                Please try again. If it keeps happening, call us on 0703 433 9721.
            </p>
            <button
                type="button"
                onClick={reset}
                style={{
                    background: "#fbbf24",
                    color: "#000",
                    border: 0,
                    borderRadius: 12,
                    padding: "12px 20px",
                    fontWeight: 700,
                    cursor: "pointer",
                }}
            >
                Try again
            </button>
        </div>
        </body>
        </html>
    );
}
