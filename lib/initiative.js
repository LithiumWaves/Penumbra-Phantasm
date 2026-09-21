import { DEFAULT_MAIL_INITIATIVE_PROMPT } from './constants.js';
import { getSettings, toast } from './settings.js';
import {
    getMailStore,
    persistMailStore,
    listMailContacts,
    getInbox,
    emailInvolvesContact,
} from './store.js';
import { isPhoneWaveContact, PHONEWAVE_KEY } from './dmail.js';
import { countPendingForceJobs, deliverInitiativeMail } from './email.js';

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

/**
 * @returns {{
 *   lastFireAt: number,
 *   fires: number[],
 *   lastByContact: Record<string, number>,
 * }}
 */
function getInitiativeState() {
    const store = getMailStore();
    if (!store.initiative || typeof store.initiative !== 'object') {
        store.initiative = { lastFireAt: 0, fires: [], lastByContact: {} };
    }
    if (!Array.isArray(store.initiative.fires)) {
        store.initiative.fires = [];
    }
    if (!store.initiative.lastByContact || typeof store.initiative.lastByContact !== 'object') {
        store.initiative.lastByContact = {};
    }
    if (!Number.isFinite(Number(store.initiative.lastFireAt))) {
        store.initiative.lastFireAt = 0;
    }
    return store.initiative;
}

function clampChance(n) {
    if (!Number.isFinite(n)) {
        return 0.25;
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
    if (!s.mailInitiativeQuietHoursEnabled) {
        return false;
    }
    let start = Math.floor(Number(s.mailInitiativeQuietStart));
    let end = Math.floor(Number(s.mailInitiativeQuietEnd));
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

/**
 * Eligible non-PhoneWave contacts for this chat.
 * @returns {import('./store.js').MailContact[]}
 */
function eligibleContacts() {
    return listMailContacts().filter((c) => c && !isPhoneWaveContact(c.key) && c.key !== PHONEWAVE_KEY);
}

/**
 * @param {'active'|'all'|'weighted'} mode
 * @returns {import('./store.js').MailContact | null}
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
    // weighted — ~70% active
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
 * @returns {{ ok: boolean, reason?: string, contact?: import('./store.js').MailContact | null }}
 */
export function evaluateInitiativeGates(opts = {}) {
    const s = getSettings();
    if (!s.enabled) {
        return { ok: false, reason: 'extension disabled' };
    }
    if (!s.mailInitiativeEnabled && !opts.bypassChance) {
        return { ok: false, reason: 'initiative off' };
    }
    if (!opts.bypassQuiet && inQuietHours(s)) {
        return { ok: false, reason: 'quiet hours' };
    }
    if (s.mailInitiativeRequireTabVisible !== false && document.visibilityState === 'hidden') {
        return { ok: false, reason: 'tab hidden' };
    }
    if (s.mailInitiativePauseDuringGeneration !== false && generationBusy && !opts.bypassGeneration) {
        return { ok: false, reason: 'generation busy' };
    }
    if (s.mailInitiativePauseWhilePhoneOpen !== false && isPhoneOpenDom()) {
        return { ok: false, reason: 'phone open' };
    }

    const now = Date.now();
    const graceSec = Number(s.mailInitiativeStartupGraceSec);
    const graceMs = (Number.isFinite(graceSec) ? Math.max(0, graceSec) : 90) * 1000;
    if (!opts.bypassIdle && schedulerStartedAt && now - schedulerStartedAt < graceMs) {
        return { ok: false, reason: 'startup grace' };
    }

    if (s.mailInitiativeOnlyWhenIdle !== false && !opts.bypassIdle) {
        const idleSec = Number(s.mailInitiativeIdleSeconds);
        const need = (Number.isFinite(idleSec) ? Math.max(0, idleSec) : 60) * 1000;
        if (now - lastActivityAt < need) {
            return { ok: false, reason: 'not idle' };
        }
    }

    const state = getInitiativeState();
    const cooldownSec = Number(s.mailInitiativeCooldownSec);
    const cooldownMs = (Number.isFinite(cooldownSec) ? Math.max(0, cooldownSec) : 300) * 1000;
    if (!opts.bypassIdle && state.lastFireAt && now - state.lastFireAt < cooldownMs) {
        return { ok: false, reason: 'cooldown' };
    }

    state.fires = pruneFires(state.fires, now);
    const maxHour = Number(s.mailInitiativeMaxPerHour);
    if (Number.isFinite(maxHour) && maxHour > 0
        && countSince(state.fires, now, 60 * 60 * 1000) >= maxHour
        && !opts.bypassChance) {
        return { ok: false, reason: 'hourly cap' };
    }
    const maxDay = Number(s.mailInitiativeMaxPerDay);
    if (Number.isFinite(maxDay) && maxDay > 0
        && countSince(state.fires, now, 24 * 60 * 60 * 1000) >= maxDay
        && !opts.bypassChance) {
        return { ok: false, reason: 'daily cap' };
    }

    const maxPending = Number(s.mailInitiativeMaxPending);
    const pendingCap = Number.isFinite(maxPending) ? Math.max(0, Math.floor(maxPending)) : 1;
    if (pendingCap > 0 && countPendingForceJobs() >= pendingCap) {
        return { ok: false, reason: 'pending jobs' };
    }

    if (s.mailInitiativeSkipIfUnread && getInbox().some((e) => !e.read)) {
        return { ok: false, reason: 'unread inbox' };
    }

    let contact = null;
    if (opts.contactKey) {
        contact = eligibleContacts().find((c) => c.key === opts.contactKey) || null;
    } else {
        const mode = ['active', 'all', 'weighted'].includes(s.mailInitiativeContacts)
            ? s.mailInitiativeContacts
            : 'active';
        contact = pickContact(mode);
    }
    if (!contact) {
        return { ok: false, reason: 'no contact' };
    }

    if (s.mailInitiativeSkipIfUnreadFromSender !== false) {
        const unreadFrom = getInbox().some((e) => !e.read && emailInvolvesContact(e, contact));
        if (unreadFrom) {
            return { ok: false, reason: 'unread from sender', contact };
        }
    }

    if (!opts.bypassChance) {
        const chance = clampChance(Number(s.mailInitiativeChance));
        if (Math.random() > chance) {
            return { ok: false, reason: 'chance miss', contact };
        }
    }

    return { ok: true, contact };
}

/**
 * Record a successful initiative send for rate limits.
 * @param {string} [contactKey]
 */
async function recordFire(contactKey) {
    const state = getInitiativeState();
    const now = Date.now();
    state.lastFireAt = now;
    state.fires = pruneFires([...state.fires, now], now);
    if (contactKey) {
        state.lastByContact[contactKey] = now;
    }
    await persistMailStore();
}

/**
 * Attempt one initiative send. Used by the scheduler and the Test button.
 * @param {{
 *   bypassChance?: boolean,
 *   bypassIdle?: boolean,
 *   bypassQuiet?: boolean,
 *   bypassGeneration?: boolean,
 *   contactKey?: string,
 *   silent?: boolean,
 * }} [opts]
 * @returns {Promise<{ sent: boolean, reason?: string }>}
 */
export async function tryInitiativeMail(opts = {}) {
    if (opts.bypassGeneration || opts.bypassChance) {
        // Force/test clicks must not stall on a stale GENERATION_STARTED flag
        // or SillyTavern's main queue busy state from an earlier turn.
        generationBusy = false;
    }
    const gate = evaluateInitiativeGates(opts);
    if (!gate.ok || !gate.contact) {
        if (opts.bypassChance && !opts.silent) {
            toast(`Initiative skipped (${gate.reason || 'blocked'})`, 'info');
        }
        return { sent: false, reason: gate.reason || 'blocked' };
    }

    const s = getSettings();
    const guidance = String(s.mailInitiativeGuidance || '').trim();

    try {
        const email = await deliverInitiativeMail(gate.contact, { guidance });
        if (!email) {
            return { sent: false, reason: 'empty or failed' };
        }
        await recordFire(gate.contact.key);
        if (opts.bypassChance && !opts.silent) {
            toast(`Initiative mail from ${gate.contact.name}`, 'success', 'MAIL');
        }
        return { sent: true };
    } catch (err) {
        console.error('[Phone Trigger] initiative mail failed', err);
        if (!opts.silent) {
            toast(err?.message || 'Initiative mail failed', 'error');
        }
        return { sent: false, reason: 'error' };
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
    if (!s.enabled || !s.mailInitiativeEnabled) {
        return;
    }
    const delaySec = randomBetweenSec(s.mailInitiativeIntervalMin, s.mailInitiativeIntervalMax);
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
        await tryInitiativeMail({ silent: true });
    } finally {
        tickRunning = false;
        scheduleNextTick();
    }
}

/**
 * Start or restart the initiative scheduler from current settings.
 */
export function syncInitiativeScheduler() {
    clearTick();
    const s = getSettings();
    if (!s.enabled || !s.mailInitiativeEnabled) {
        return;
    }
    schedulerStartedAt = Date.now();
    const graceSec = Number(s.mailInitiativeStartupGraceSec);
    const grace = (Number.isFinite(graceSec) ? Math.max(0, graceSec) : 90) * 1000;
    const delaySec = randomBetweenSec(s.mailInitiativeIntervalMin, s.mailInitiativeIntervalMax);
    const delayMs = Math.max(grace, Math.round(delaySec * 1000));
    tickTimer = setTimeout(() => {
        void runTick();
    }, delayMs);
    console.debug('[Phone Trigger] initiative scheduler armed', { delayMs });
}

export function stopInitiativeScheduler() {
    clearTick();
}

export function noteInitiativeActivity() {
    lastActivityAt = Date.now();
}

/**
 * @param {boolean} busy
 */
export function setInitiativeGenerationBusy(busy) {
    generationBusy = Boolean(busy);
}

/**
 * Prompt text used for initiative (for settings preview / reset).
 */
export function resolveInitiativePromptTemplate() {
    const s = getSettings();
    if (s.mailInitiativeUseForcePrompt) {
        return String(s.mailForcePrompt || '').trim() || DEFAULT_MAIL_INITIATIVE_PROMPT;
    }
    return String(s.mailInitiativePrompt || '').trim() || DEFAULT_MAIL_INITIATIVE_PROMPT;
}
