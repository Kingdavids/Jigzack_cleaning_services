let audioCtx: AudioContext | null = null;

// Synthesized two-tone chime via Web Audio API instead of shipping an audio
// file: no asset to license or bundle, and it degrades silently if the
// browser hasn't granted audio yet (autoplay policies require a prior user
// gesture, which normal dashboard interaction already provides).
export function playNotificationSound() {
    try {
        if (!audioCtx) {
            const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
            if (!Ctor) return;
            audioCtx = new Ctor();
        }

        if (audioCtx.state === "suspended") {
            audioCtx.resume().catch(() => {});
        }

        const ctx = audioCtx;
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
