let audioCtx: AudioContext | null = null;

const SOUND_KEY = "jigzack-notification-sound";

// Whether the chime plays. On by default; the bell lets people turn it off.
export function isSoundOn() {
    try {
        return window.localStorage.getItem(SOUND_KEY) !== "off";
    } catch {
        return true;
    }
}

export function setSoundOn(on: boolean) {
    try {
        window.localStorage.setItem(SOUND_KEY, on ? "on" : "off");
    } catch {
        // Private windows can refuse storage; the setting just will not stick.
    }
}

function context() {
    if (!audioCtx) {
        const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Ctor) return null;
        audioCtx = new Ctor();
    }

    return audioCtx;
}

// Phones only allow sound after the person has touched the page. Calling this
// from the first tap, click or key press (it is wired up once by the bell)
// prepares the audio so later notifications can actually be heard.
export function unlockNotificationSound() {
    try {
        const ctx = context();
        if (!ctx) return;

        if (ctx.state === "suspended") ctx.resume().catch(() => {});

        // A silent blip completes the unlock on iPhone.
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        gain.gain.value = 0;
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.01);
    } catch {
        // Best effort.
    }
}

// Synthesized two-tone chime via Web Audio API instead of shipping an audio
// file: no asset to license or bundle, and it degrades silently if the
// browser hasn't granted audio yet.
export function playNotificationSound() {
    try {
        if (!isSoundOn()) return;

        const ctx = context();
        if (!ctx) return;

        if (ctx.state === "suspended") {
            ctx.resume().catch(() => {});
        }

        const now = ctx.currentTime;

        [880, 1320].forEach((freq, i) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = "sine";
            osc.frequency.value = freq;

            const start = now + i * 0.12;
            gain.gain.setValueAtTime(0, start);
            gain.gain.linearRampToValueAtTime(0.15, start + 0.02);
            gain.gain.exponentialRampToValueAtTime(0.001, start + 0.18);

            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(start);
            osc.stop(start + 0.2);
        });
    } catch {
        // Best-effort only. Never let a sound failure break the notification.
    }
}

// A short buzz on phones that support it (Android). iPhone does not.
export function vibrateForNotification() {
    try {
        if (isSoundOn() && typeof navigator !== "undefined" && "vibrate" in navigator) {
            navigator.vibrate([90, 50, 90]);
        }
    } catch {
        // Not supported; nothing to do.
    }
}
