import { getSettings, toast } from './settings.js';
import {
    getMailStore,
    persistMailStore,
} from './store.js';
import { isPhoneWaveContact, PHONEWAVE_KEY } from './dmail.js';
import { beginIncomingCall, isCallActive, listCallContacts } from './call.js';

/** @type {ReturnType<typeof setTimeout> | null} */
let tickTimer = null;
/** @type {boolean} */
let generationBusy = false;
/** @type {number} */
let lastActivityAt = Date.now();
/** @type {number} */
let schedulerStartedAt = 0;
/** @type {boolean} */
let tickRunning = false;

/** @type {((session: import('./call.js').CallSession) => void) | null} */
let onIncomingHook = null;

/**
 * Phone UI can register to open / navigate when an initiative call rings.
 * @param {(session: import('./call.js').CallSession) => void} [fn]
 */
export function setCallInitiativeIncomingHandler(fn) {
    onIncomingHook = typeof fn === 'function' ? fn : null;
}

function getCallInitiativeState() {
    const store = getMailStore();
    if (!store.callInitiative || typeof store.callInitiative !== 'object') {
        store.callInitiative = { lastFireAt: 0, fires: [], lastByContact: {} };
    }
    if (!Array.isArray(store.callInitiative.fires)) {
        store.callInitiative.fires = [];
    }
    if (!store.callInitiative.lastByContact || typeof store.callInitiative.lastByContact !== 'object') {
        store.callInitiative.lastByContact = {};
    }
    if (!Number.isFinite(Number(store.callInitiative.lastFireAt))) {
        store.callInitiative.lastFireAt = 0;
    }
    return store.callInitiative;
}

function clampChance(n) {
    if (!Number.isFinite(n)) {
        return 0.2;
    }
    return Math.max(0, Math.min(1, n));
}

function randomBetweenSec(minSec, maxSec) {
    let min = Number(minSec);
    let max = Number(maxSec);
    if (!Number.isFinite(min) || min < 5) {
        min = 5;
    }
    if (!Number.isFinite(max) || max < min) {
        max = min;
    }
    return min + Math.random() * (max - min);
}

function isPhoneOpenDom() {
    const root = document.getElementById('pp-root');
    if (root?.classList.contains('pp-open')) {
        return true;
    }
    const overlay = document.getElementById('pp-overlay');
    return !!(overlay && (overlay.open || overlay.hasAttribute('open')));
}

function inQuietHours(s) {
    if (!s.callInitiativeQuietHoursEnabled) {
        return false;
    }
    let start = Math.floor(Number(s.callInitiativeQuietStart));
    let end = Math.floor(Number(s.callInitiativeQuietEnd));
    if (!Number.isFinite(start)) {
        start = 23;
    }
    if (!Number.isFinite(end)) {
        end = 8;
    }
    start = ((start % 24) + 24) % 24;
    end = ((end % 24) + 24) % 24;
    const hour = new Date().getHours();
    if (start === end) {
        return true;
    }
    if (start < end) {
        return hour >= start && hour < end;
    }
    return hour >= start || hour < end;
}

function eligibleContacts() {
    return listCallContacts().filter((c) => c && !isPhoneWaveContact(c.key) && c.key !== PHONEWAVE_KEY);
}

/**
 * @param {'active'|'all'|'weighted'} mode
 */
function pickContact(mode) {
    const pool = eligibleContacts();
    if (!pool.length) {
        return null;
    }
    const active = pool.find((c) => c.isActive) || pool[0];
    if (mode === 'active' || pool.length === 1) {
        return active;
    }
    if (mode === 'all') {
        return pool[Math.floor(Math.random() * pool.length)];
    }
    if (Math.random() < 0.7) {
        return active;
    }
    const others = pool.filter((c) => c.key !== active.key);
    if (!others.length) {
        return active;
    }
    return others[Math.floor(Math.random() * others.length)];
}

function pruneFires(fires, now) {
    const dayMs = 24 * 60 * 60 * 1000;
    return fires.filter((t) => Number.isFinite(t) && now - t < dayMs);
}

function countSince(fires, now, windowMs) {
    return fires.filter((t) => now - t < windowMs).length;
}

/**
 * @param {{ bypassChance?: boolean, bypassIdle?: boolean, bypassQuiet?: boolean, contactKey?: string }} [opts]
 */
export function evaluateCallInitiativeGates(opts = {}) {
    const s = getSettings();
    if (!s.enabled || s.callEnabled === false) {
        return { ok: false, reason: 'calls/extension off' };
    }
    if (!s.callInitiativeEnabled && !opts.bypassChance) {
        return { ok: false, reason: 'call initiative off' };
    }
    if (!opts.bypassQuiet && inQuietHours(s)) {
        return { ok: false, reason: 'quiet hours' };
    }
    if (s.callInitiativeRequireTabVisible !== false && document.visibilityState === 'hidden') {
        return { ok: false, reason: 'tab hidden' };
    }
    if (s.callInitiativePauseDuringGeneration !== false && generationBusy) {
        return { ok: false, reason: 'generation busy' };
    }
    if (s.callInitiativePauseWhilePhoneOpen && isPhoneOpenDom() && !opts.bypassIdle) {
        return { ok: false, reason: 'phone open' };
    }
    if (s.callInitiativeSkipIfBusy !== false && isCallActive()) {
        return { ok: false, reason: 'already on call' };
    }

    const now = Date.now();
    const graceSec = Number(s.callInitiativeStartupGraceSec);
    const graceMs = (Number.isFinite(graceSec) ? Math.max(0, graceSec) : 120) * 1000;
    if (!opts.bypassIdle && schedulerStartedAt && now - schedulerStartedAt < graceMs) {
        return { ok: false, reason: 'startup grace' };
    }

    if (s.callInitiativeOnlyWhenIdle !== false && !opts.bypassIdle) {
        const idleSec = Number(s.callInitiativeIdleSeconds);
        const need = (Number.isFinite(idleSec) ? Math.max(0, idleSec) : 90) * 1000;
        if (now - lastActivityAt < need) {
            return { ok: false, reason: 'not idle' };
        }
    }

    const state = getCallInitiativeState();
    const cooldownSec = Number(s.callInitiativeCooldownSec);
    const cooldownMs = (Number.isFinite(cooldownSec) ? Math.max(0, cooldownSec) : 420) * 1000;
    if (!opts.bypassIdle && state.lastFireAt && now - state.lastFireAt < cooldownMs) {
        return { ok: false, reason: 'cooldown' };
    }

    state.fires = pruneFires(state.fires, now);
    const maxHour = Number(s.callInitiativeMaxPerHour);
    if (Number.isFinite(maxHour) && maxHour > 0
        && countSince(state.fires, now, 60 * 60 * 1000) >= maxHour
        && !opts.bypassChance) {
        return { ok: false, reason: 'hourly cap' };
    }
    const maxDay = Number(s.callInitiativeMaxPerDay);
    if (Number.isFinite(maxDay) && maxDay > 0
        && countSince(state.fires, now, 24 * 60 * 60 * 1000) >= maxDay
        && !opts.bypassChance) {
        return { ok: false, reason: 'daily cap' };
    }

    let contact = null;
    if (opts.contactKey) {
        contact = eligibleContacts().find((c) => c.key === opts.contactKey) || null;
    } else {
        const mode = ['active', 'all', 'weighted'].includes(s.callInitiativeContacts)
            ? s.callInitiativeContacts
            : 'active';
        contact = pickContact(mode);
    }
    if (!contact) {
        return { ok: false, reason: 'no contact' };
    }

    if (!opts.bypassChance) {
        const chance = clampChance(Number(s.callInitiativeChance));
        if (Math.random() > chance) {
            return { ok: false, reason: 'chance miss', contact };
        }
    }

    return { ok: true, contact };
}

async function recordFire(contactKey) {
    const state = getCallInitiativeState();
    const now = Date.now();
    state.lastFireAt = now;
    state.fires = pruneFires([...state.fires, now], now);
    if (contactKey) {
        state.lastByContact[contactKey] = now;
    }
    await persistMailStore();
}

/**
 * @param {{ bypassChance?: boolean, bypassIdle?: boolean, bypassQuiet?: boolean, contactKey?: string, silent?: boolean }} [opts]
 */
export async function tryCallInitiative(opts = {}) {
    const gate = evaluateCallInitiativeGates(opts);
    if (!gate.ok || !gate.contact) {
        if (opts.bypassChance && !opts.silent) {
            toast(`Call initiative skipped (${gate.reason || 'blocked'})`, 'info');
        }
        return { rang: false, reason: gate.reason || 'blocked' };
    }

    try {
        const session = beginIncomingCall(gate.contact);
        await recordFire(gate.contact.key);
        if (typeof onIncomingHook === 'function') {
            onIncomingHook(session);
        }
        return { rang: true, session };
    } catch (err) {
        console.error('[Phone Trigger] call initiative failed', err);
        if (!opts.silent) {
            toast(err?.message || 'Incoming call failed', 'error');
        }
        return { rang: false, reason: 'error' };
    }
}

function clearTick() {
    if (tickTimer) {
        clearTimeout(tickTimer);
        tickTimer = null;
    }
}

function scheduleNextTick() {
    clearTick();
    const s = getSettings();
    if (!s.enabled || s.callEnabled === false || !s.callInitiativeEnabled) {
        return;
    }
    const delaySec = randomBetweenSec(s.callInitiativeIntervalMin, s.callInitiativeIntervalMax);
    tickTimer = setTimeout(() => {
        void runTick();
    }, Math.round(delaySec * 1000));
}

async function runTick() {
    if (tickRunning) {
        scheduleNextTick();
        return;
    }
    tickRunning = true;
    try {
        await tryCallInitiative({ silent: true });
    } finally {
        tickRunning = false;
        scheduleNextTick();
    }
}

export function syncCallInitiativeScheduler() {
    clearTick();
    const s = getSettings();
    if (!s.enabled || s.callEnabled === false || !s.callInitiativeEnabled) {
        return;
    }
    schedulerStartedAt = Date.now();
    const graceSec = Number(s.callInitiativeStartupGraceSec);
    const grace = (Number.isFinite(graceSec) ? Math.max(0, graceSec) : 120) * 1000;
    const delaySec = randomBetweenSec(s.callInitiativeIntervalMin, s.callInitiativeIntervalMax);
    const delayMs = Math.max(grace, Math.round(delaySec * 1000));
    tickTimer = setTimeout(() => {
        void runTick();
    }, delayMs);
    console.debug('[Phone Trigger] call initiative scheduler armed', { delayMs });
}

export function stopCallInitiativeScheduler() {
    clearTick();
}

export function noteCallInitiativeActivity() {
    lastActivityAt = Date.now();
}

/**
 * @param {boolean} busy
 */
export function setCallInitiativeGenerationBusy(busy) {
    generationBusy = Boolean(busy);
}
