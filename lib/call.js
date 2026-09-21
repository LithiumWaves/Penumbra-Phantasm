import { getSettings, toast } from './settings.js';
import { listMailContacts, getPersonaName } from './store.js';
import { isPhoneWaveContact, PHONEWAVE_KEY } from './dmail.js';
import { buildCallPrompt, generateCallText } from './generate.js';
import { playRingtone, startRingtoneLoop, stopRingtoneLoop, stopNotificationSound } from './audio.js';
import { recordCallMemory } from './callMemory.js';

/**
 * @typedef {{ key: string, name: string, description?: string, personality?: string, scenario?: string, characterIndex?: number }} CallContact
 * @typedef {{ id: string, role: 'user'|'char'|'system', text: string, timestamp: number }} CallTurn
 * @typedef {{
 *   id: string,
 *   status: 'idle'|'dialing'|'ringing'|'connected'|'ended',
 *   direction: 'out'|'in'|'',
 *   contact: CallContact | null,
 *   startedAt: number,
 *   connectedAt: number,
 *   endedAt: number,
 *   turns: CallTurn[],
 *   busy: boolean,
 * }} CallSession
 */

/** @type {CallSession} */
let session = emptySession();

/** @type {((session: CallSession) => void) | null} */
let onCallChange = null;

/** @type {ReturnType<typeof setTimeout> | null} */
let ringTimeoutTimer = null;

function emptySession() {
    return {
        id: '',
        status: 'idle',
        direction: '',
        contact: null,
        startedAt: 0,
        connectedAt: 0,
        endedAt: 0,
        turns: [],
        busy: false,
    };
}

function uid(prefix) {
    return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

function emit() {
    if (typeof onCallChange === 'function') {
        onCallChange(getCallSession());
    }
}

function clearRingTimeout() {
    if (ringTimeoutTimer) {
        clearTimeout(ringTimeoutTimer);
        ringTimeoutTimer = null;
    }
}

function contactPayload(who) {
    return {
        key: String(who.key),
        name: String(who.name),
        description: String(who.description || ''),
        personality: String(who.personality || ''),
        scenario: String(who.scenario || ''),
        characterIndex: Number.isFinite(Number(who.characterIndex)) ? Number(who.characterIndex) : undefined,
    };
}

/**
 * @param {(session: CallSession) => void} [fn]
 */
export function setCallChangeHandler(fn) {
    onCallChange = typeof fn === 'function' ? fn : null;
}

/** @returns {CallSession} */
export function getCallSession() {
    return {
        ...session,
        contact: session.contact ? { ...session.contact } : null,
        turns: session.turns.map((t) => ({ ...t })),
    };
}

export function isCallActive() {
    return session.status === 'dialing'
        || session.status === 'ringing'
        || session.status === 'connected';
}

export function isCallConnected() {
    return session.status === 'connected';
}

export function isCallRinging() {
    return session.status === 'ringing';
}

/**
 * Contacts that can be dialed / can call (never PhoneWave).
 * @returns {import('./store.js').MailContact[]}
 */
export function listCallContacts() {
    return listMailContacts().filter((c) => c && !isPhoneWaveContact(c.key) && c.key !== PHONEWAVE_KEY);
}

/**
 * Start an outbound call to a contact.
 * @param {CallContact | import('./store.js').MailContact | null} contact
 * @returns {Promise<CallSession>}
 */
export async function startOutboundCall(contact) {
    const s = getSettings();
    if (s.callEnabled === false) {
        toast('Calls are disabled', 'warning');
        throw new Error('Calls disabled');
    }
    if (isCallActive()) {
        toast('Already on a call', 'warning');
        throw new Error('Call already active');
    }
    const who = contact?.key
        ? listCallContacts().find((c) => c.key === contact.key) || contact
        : listCallContacts().find((c) => c.isActive) || listCallContacts()[0];
    if (!who?.name || isPhoneWaveContact(who.key)) {
        toast('No one to call', 'warning');
        throw new Error('No call contact');
    }

    stopRingtoneLoop();
    clearRingTimeout();

    session = {
        id: uid('call'),
        status: 'dialing',
        direction: 'out',
        contact: contactPayload(who),
        startedAt: Date.now(),
        connectedAt: 0,
        endedAt: 0,
        turns: [],
        busy: false,
    };
    emit();

    let delay = Number(s.callDialDelayMs);
    if (!Number.isFinite(delay) || delay < 0) {
        delay = 900;
    }
    delay = Math.min(4000, delay);

    if (delay > 0) {
        await new Promise((resolve) => setTimeout(resolve, delay));
    }

    if (session.status !== 'dialing') {
        return getCallSession();
    }

    session.status = 'connected';
    session.connectedAt = Date.now();
    session.turns.push({
        id: uid('turn'),
        role: 'system',
        text: `Connected with ${session.contact.name}`,
        timestamp: Date.now(),
    });
    emit();
    return getCallSession();
}

/**
 * Begin an incoming ring from a character (initiative / test).
 * @param {CallContact | import('./store.js').MailContact | null} contact
 * @param {{ ringTimeoutSec?: number }} [opts]
 * @returns {CallSession}
 */
export function beginIncomingCall(contact, opts = {}) {
    const s = getSettings();
    if (s.callEnabled === false) {
        throw new Error('Calls disabled');
    }
    if (isCallActive()) {
        throw new Error('Call already active');
    }
    const who = contact?.key
        ? listCallContacts().find((c) => c.key === contact.key) || contact
        : listCallContacts().find((c) => c.isActive) || listCallContacts()[0];
    if (!who?.name || isPhoneWaveContact(who.key)) {
        throw new Error('No call contact');
    }

    clearRingTimeout();
    stopNotificationSound();
    session = {
        id: uid('call'),
        status: 'ringing',
        direction: 'in',
        contact: contactPayload(who),
        startedAt: Date.now(),
        connectedAt: 0,
        endedAt: 0,
        turns: [],
        busy: false,
    };
    emit();

    void playRingtone();
    startRingtoneLoop();

    let timeoutSec = Number(opts.ringTimeoutSec ?? s.callInitiativeRingTimeoutSec);
    if (!Number.isFinite(timeoutSec)) {
        timeoutSec = 45;
    }
    if (timeoutSec > 0) {
        ringTimeoutTimer = setTimeout(() => {
            if (session.status === 'ringing') {
                toast('Missed call', 'info', session.contact?.name || 'Call');
                endCall({ silent: true, reason: 'missed' });
            }
        }, Math.round(timeoutSec * 1000));
    }

    toast(`Incoming call · ${who.name}`, 'info', 'CALL');
    return getCallSession();
}

/**
 * Answer a ringing inbound call.
 * @returns {CallSession}
 */
export function answerIncomingCall() {
    if (session.status !== 'ringing' || !session.contact) {
        return getCallSession();
    }
    clearRingTimeout();
    stopRingtoneLoop();
    session.status = 'connected';
    session.connectedAt = Date.now();
    session.turns.push({
        id: uid('turn'),
        role: 'system',
        text: `Connected with ${session.contact.name}`,
        timestamp: Date.now(),
    });
    emit();
    return getCallSession();
}

/**
 * Hang up / cancel dialing / decline ring.
 * @param {{ silent?: boolean, reason?: string }} [opts]
 * @returns {CallSession}
 */
export function endCall(opts = {}) {
    clearRingTimeout();
    stopRingtoneLoop();
    if (session.status === 'idle' || session.status === 'ended') {
        session = emptySession();
        emit();
        return getCallSession();
    }
    const name = session.contact?.name || 'call';
    const wasRinging = session.status === 'ringing';
    session.status = 'ended';
    session.endedAt = Date.now();
    session.busy = false;
    session.turns.push({
        id: uid('turn'),
        role: 'system',
        text: wasRinging ? (opts.reason === 'missed' ? 'Missed call' : 'Declined') : 'Call ended',
        timestamp: Date.now(),
    });
    emit();
    if (!opts.silent) {
        if (wasRinging) {
            toast(opts.reason === 'missed' ? 'Missed call' : 'Declined', 'info', name);
        } else {
            const durationMs = (session.connectedAt || session.startedAt)
                ? session.endedAt - (session.connectedAt || session.startedAt)
                : 0;
            const sec = Math.max(0, Math.round(durationMs / 1000));
            toast(sec ? `Call ended · ${sec}s` : 'Call ended', 'info', name);
        }
    }
    const ended = getCallSession();
    // Persist before wiping in-memory session (fire-and-forget summarize may continue)
    void recordCallMemory(ended).catch((err) => {
        console.warn('[Phone Trigger] recordCallMemory failed', err);
    });
    session = emptySession();
    emit();
    return ended;
}

/**
 * User speaks a line on the call; character replies asynchronously.
 * @param {string} text
 * @returns {Promise<CallTurn | null>} character turn, or null
 */
export async function sendCallLine(text) {
    const line = String(text || '').trim();
    if (!line) {
        return null;
    }
    if (session.status !== 'connected' || !session.contact) {
        toast('Not on a call', 'warning');
        return null;
    }
    if (session.busy) {
        toast('Wait for a reply…', 'info');
        return null;
    }

    const userTurn = {
        id: uid('turn'),
        role: /** @type {'user'} */ ('user'),
        text: line,
        timestamp: Date.now(),
    };
    session.turns.push(userTurn);
    session.busy = true;
    emit();

    try {
        const prompt = buildCallPrompt({
            turns: session.turns,
            contact: session.contact,
            lastUser: line,
        });
        const raw = await generateCallText(prompt, {
            contact: session.contact,
            lastUser: line,
        });
        const spoken = cleanCallReply(raw);
        if (!spoken) {
            toast('No reply on the line', 'warning');
            session.busy = false;
            emit();
            return null;
        }
        if (session.status !== 'connected') {
            return null;
        }
        const charTurn = {
            id: uid('turn'),
            role: /** @type {'char'} */ ('char'),
            text: spoken,
            timestamp: Date.now(),
        };
        session.turns.push(charTurn);
        session.busy = false;
        emit();
        return charTurn;
    } catch (err) {
        console.error('[Phone Trigger] call reply failed', err);
        session.busy = false;
        emit();
        toast(err?.message || 'Call reply failed', 'error');
        return null;
    }
}

/**
 * Strip common LLM wrappers from a spoken line.
 * @param {string} raw
 */
export function cleanCallReply(raw) {
    let text = String(raw || '').trim();
    if (!text) {
        return '';
    }
    text = text.replace(/^\s*SUBJECT:\s*.+$/im, '').replace(/^\s*BODY:\s*/im, '').trim();
    if (
        (text.startsWith('"') && text.endsWith('"'))
        || (text.startsWith('“') && text.endsWith('”'))
    ) {
        text = text.slice(1, -1).trim();
    }
    text = text.replace(/^[A-Z][\w'’.\- ]{0,40}:\s+/u, '').trim();
    return text.slice(0, 1200);
}

export function getPersonaLabel() {
    return getPersonaName();
}
