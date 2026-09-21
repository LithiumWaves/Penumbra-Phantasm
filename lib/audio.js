import { SOUND_PRESETS } from './constants.js';
import { getSettings } from './settings.js';

/** @type {AudioContext|null} */
let audioCtx = null;
/** Notification / one-shot custom clips (never the ringtone). */
/** @type {HTMLAudioElement|null} */
let customAudio = null;
/** Dedicated looping ringtone element (custom URL). */
/** @type {HTMLAudioElement|null} */
let ringAudio = null;
/** Bumps on stop so pending synth ring cycles abort. */
let ringGeneration = 0;
/** @type {ReturnType<typeof setTimeout> | null} */
let ringLoopTimer = null;

function ctx() {
    if (!audioCtx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) {
            return null;
        }
        audioCtx = new AC();
    }
    if (audioCtx.state === 'suspended') {
        audioCtx.resume().catch(() => {});
    }
    return audioCtx;
}

function tone(frequency, start, duration, type = 'sine', gain = 0.12) {
    const ac = ctx();
    if (!ac) {
        return;
    }
    const osc = ac.createOscillator();
    const g = ac.createGain();
    osc.type = type;
    osc.frequency.value = frequency;
    g.gain.setValueAtTime(0.0001, ac.currentTime + start);
    g.gain.exponentialRampToValueAtTime(gain, ac.currentTime + start + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + start + duration);
    osc.connect(g);
    g.connect(ac.destination);
    osc.start(ac.currentTime + start);
    osc.stop(ac.currentTime + start + duration + 0.02);
}

const SYNTH = {
    chirp() {
        tone(880, 0, 0.08, 'square', 0.08);
        tone(1320, 0.09, 0.1, 'square', 0.07);
    },
    ping() {
        tone(1046, 0, 0.18, 'sine', 0.1);
    },
    blip() {
        tone(600, 0, 0.05, 'triangle', 0.09);
        tone(900, 0.06, 0.08, 'triangle', 0.07);
    },
    /**
     * One ring burst (~1.05s). Caller schedules the pause → next burst.
     * @returns {number} duration ms of this burst
     */
    'ring-classic'() {
        for (let i = 0; i < 3; i++) {
            const t = i * 0.35;
            tone(440, t, 0.12, 'square', 0.07);
            tone(554, t + 0.12, 0.12, 'square', 0.07);
        }
        return 1100;
    },
    'ring-soft'() {
        for (let i = 0; i < 2; i++) {
            const t = i * 0.45;
            tone(523, t, 0.2, 'sine', 0.08);
            tone(659, t + 0.15, 0.22, 'sine', 0.06);
        }
        return 1200;
    },
    silent() {
        return 0;
    },
};

async function playUrl(url) {
    if (!url) {
        return false;
    }
    try {
        if (customAudio) {
            customAudio.pause();
            customAudio = null;
        }
        customAudio = new Audio(url);
        customAudio.volume = 0.7;
        await customAudio.play();
        return true;
    } catch (err) {
        console.warn('[Phone Trigger] Failed to play custom sound:', err);
        return false;
    }
}

export async function playPreset(id) {
    const preset = SOUND_PRESETS.find((p) => p.id === id);
    if (!preset || preset.id === 'silent') {
        return;
    }
    const fn = SYNTH[preset.id];
    if (fn) {
        fn();
    }
}

export async function playNotification() {
    const settings = getSettings();
    if (!settings.soundEnabled) {
        return;
    }
    if (settings.customNotificationUrl) {
        const ok = await playUrl(settings.customNotificationUrl);
        if (ok) {
            return;
        }
    }
    await playPreset(settings.notificationSoundId || 'chirp');
}

/**
 * Play a single ringtone burst (tests). Prefer startRingtoneLoop for incoming calls.
 */
export async function playRingtone() {
    const settings = getSettings();
    if (!settings.soundEnabled) {
        return;
    }
    if (settings.customRingtoneUrl) {
        try {
            const once = new Audio(settings.customRingtoneUrl);
            once.volume = 0.7;
            await once.play();
            return;
        } catch (err) {
            console.warn('[Phone Trigger] custom ringtone once failed', err);
        }
    }
    const id = settings.ringtoneId || 'ring-classic';
    const fn = SYNTH[id] || SYNTH['ring-classic'];
    fn();
}

/**
 * Fully stop ringtone loop + any custom ring audio.
 * Safe to call from answer / decline / hang-up.
 */
export function stopRingtoneLoop() {
    ringGeneration += 1;
    if (ringLoopTimer) {
        clearTimeout(ringLoopTimer);
        ringLoopTimer = null;
    }
    if (ringAudio) {
        try {
            ringAudio.pause();
            ringAudio.currentTime = 0;
            ringAudio.src = '';
        } catch (_err) {
            // ignore
        }
        ringAudio = null;
    }
}

/**
 * Continuous ringtone while an incoming call is ringing.
 * Custom URL: HTMLAudioElement.loop. Synth: burst → short pause → burst (no dead gap).
 */
export function startRingtoneLoop() {
    stopRingtoneLoop();
    const settings = getSettings();
    if (!settings.soundEnabled) {
        return;
    }
    const gen = ringGeneration;

    const customUrl = String(settings.customRingtoneUrl || '').trim();
    if (customUrl) {
        try {
            ringAudio = new Audio(customUrl);
            ringAudio.loop = true;
            ringAudio.volume = 0.75;
            void ringAudio.play().catch((err) => {
                console.warn('[Phone Trigger] ringtone loop play failed', err);
            });
            return;
        } catch (err) {
            console.warn('[Phone Trigger] ringtone loop setup failed', err);
        }
    }

    const id = settings.ringtoneId || 'ring-classic';
    const fn = SYNTH[id] || SYNTH['ring-classic'];
    const pauseMs = 450;

    const cycle = () => {
        if (gen !== ringGeneration) {
            return;
        }
        const burstMs = Number(fn()) || 1100;
        ringLoopTimer = setTimeout(cycle, burstMs + pauseMs);
    };
    cycle();
}

/**
 * Divergence-meter style bed for D-Mail spectacle (when video is muted / silent).
 * @param {number} [durationMs]
 */
export function playDmailFxAudio(durationMs = 3200) {
    const settings = getSettings();
    if (!settings.soundEnabled || settings.dmailSpectacleSound === false) {
        return () => {};
    }
    const ac = ctx();
    if (!ac) {
        return () => {};
    }

    const start = ac.currentTime;
    const dur = Math.max(1.2, durationMs / 1000);

    const drone = ac.createOscillator();
    const droneGain = ac.createGain();
    drone.type = 'sawtooth';
    drone.frequency.value = 55;
    droneGain.gain.setValueAtTime(0.0001, start);
    droneGain.gain.exponentialRampToValueAtTime(0.045, start + 0.15);
    droneGain.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    drone.connect(droneGain);
    droneGain.connect(ac.destination);
    drone.start(start);
    drone.stop(start + dur + 0.05);

    const tickCount = Math.min(28, Math.floor(dur * 8));
    for (let i = 0; i < tickCount; i++) {
        const t = (i / tickCount) * (dur * 0.85);
        const f = 420 + (i % 5) * 40 + Math.sin(i) * 30;
        tone(f, t, 0.04, 'square', 0.035);
    }

    const warpAt = Math.max(0.2, dur - 0.85);
    tone(180, warpAt, 0.35, 'sawtooth', 0.06);
    tone(720, warpAt + 0.2, 0.4, 'square', 0.05);
    tone(1400, warpAt + 0.45, 0.25, 'sine', 0.07);

    return () => {
        try {
            drone.stop();
        } catch (_err) {
            // ignore
        }
    };
}

/** Stop mail notification audio only — does not touch the ringtone. */
export function stopNotificationSound() {
    if (customAudio) {
        try {
            customAudio.pause();
        } catch (_err) {
            // ignore
        }
        customAudio = null;
    }
}

export function stopSounds() {
    stopRingtoneLoop();
    stopNotificationSound();
}
