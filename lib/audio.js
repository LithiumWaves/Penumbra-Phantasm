import { SOUND_PRESETS } from './constants.js';
import { getSettings } from './settings.js';

/** @type {AudioContext|null} */
let audioCtx = null;
/** @type {HTMLAudioElement|null} */
let customAudio = null;

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
    'ring-classic'() {
        for (let i = 0; i < 3; i++) {
            const t = i * 0.35;
            tone(440, t, 0.12, 'square', 0.07);
            tone(554, t + 0.12, 0.12, 'square', 0.07);
        }
    },
    'ring-soft'() {
        for (let i = 0; i < 2; i++) {
            const t = i * 0.45;
            tone(523, t, 0.2, 'sine', 0.08);
            tone(659, t + 0.15, 0.22, 'sine', 0.06);
        }
    },
    silent() {},
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
        console.warn('[Penumbra-Phantasm] Failed to play custom sound:', err);
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

export async function playRingtone() {
    const settings = getSettings();
    if (!settings.soundEnabled) {
        return;
    }
    if (settings.customRingtoneUrl) {
        const ok = await playUrl(settings.customRingtoneUrl);
        if (ok) {
            return;
        }
    }
    await playPreset(settings.ringtoneId || 'ring-classic');
}

export function stopSounds() {
    if (customAudio) {
        customAudio.pause();
        customAudio = null;
    }
}
