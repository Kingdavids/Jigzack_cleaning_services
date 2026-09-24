import SignOutButton from "./SignOutButton";

export default function SuspendedPage() {
    return (
        <main className="flex min-h-screen items-center justify-center bg-slate-950 px-6">
            <div className="w-full max-w-md rounded-2xl border border-white/10 bg-white/[0.03] px-6 py-8 text-center">
                <h1 className="text-2xl font-black tracking-tight text-white">Your account is paused</h1>
                <p className="mt-3 text-sm leading-6 text-white/65">
                    Your Jigzack Cleaning Services account is on hold, so the dashboard is not available for now. If you think this
                    is a mistake, or you would like to restart your service, please call us on 0703 433 9721 or email
                    info@jigzack.com.
                </p>
                <div className="mt-6 flex justify-center">
                    <SignOutButton />
                </div>
            </div>
        </main>
    );
}
