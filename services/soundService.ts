
// Singleton AudioContext to manage browser audio resources efficiently
let audioCtx: AudioContext | null = null;

const getCtx = () => {
    if (!audioCtx) {
        // Support for standard and WebKit browsers (iOS)
        audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    return audioCtx;
};

/**
 * Plays a "Glassy Ping" sound.
 * Used for system notifications, background task completion, and alerts.
 * Frequency sweep: 600Hz -> 900Hz (Sine wave)
 */
export const playNotificationSound = () => {
    try {
        const ctx = getCtx();
        // Browsers require user interaction to resume context if suspended
        if (ctx.state === 'suspended') ctx.resume().catch(() => {});

        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.connect(gain);
        gain.connect(ctx.destination);

        // Sound Design: A clean, futuristic 'ding'
        osc.type = 'sine';
        osc.frequency.setValueAtTime(550, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(900, ctx.currentTime + 0.15);
        
        // Envelope: Quick attack, medium decay
        gain.gain.setValueAtTime(0, ctx.currentTime);
        gain.gain.linearRampToValueAtTime(0.1, ctx.currentTime + 0.02); // Soft attack
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6); // Long tail

        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.6);
    } catch (e) {
        // Silent fail if audio is not supported or blocked
        console.debug("Audio play skipped", e);
    }
};

/**
 * Plays a "Soft Pop" sound.
 * Used for incoming chat messages.
 * Frequency sweep: 300Hz -> 500Hz (Sine wave) with very short decay.
 */
export const playMessageSound = () => {
    try {
        const ctx = getCtx();
        if (ctx.state === 'suspended') ctx.resume().catch(() => {});

        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.connect(gain);
        gain.connect(ctx.destination);

        // Sound Design: A subtle 'bloop' or 'pop'
        osc.type = 'sine';
        osc.frequency.setValueAtTime(350, ctx.currentTime);
        osc.frequency.linearRampToValueAtTime(550, ctx.currentTime + 0.08);
        
        // Envelope: Instant attack, very short decay
        gain.gain.setValueAtTime(0.08, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);

        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.15);
    } catch (e) {
        console.debug("Audio play skipped", e);
    }
};
