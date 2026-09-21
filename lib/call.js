import { getSettings, toast } from './settings.js';
import { listMailContacts, getPersonaName } from './store.js';
import { isPhoneWaveContact, PHONEWAVE_KEY } from './dmail.js';
import { buildCallPrompt, generateMailText } from './generate.js';

/**
 * @typedef {{ key: string, name: string, description?: string, personality?: string, scenario?: string }} CallContact
 * @typedef {{ id: string, role: 'user'|'char'|'system', text: string, timestamp: number }} CallTurn
 * @typedef {{
 *   id: string,
 *   status: 'idle'|'dialing'|'connected'|'ended',
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

function emptySession() {
    return {
        id: '',
        status: 'idle',
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
    return session.status === 'dialing' || session.status === 'connected';
}

export function isCallConnected() {
    return session.status === 'connected';
}

/**
 * Contacts that can be dialed (never PhoneWave).
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

    session = {
        id: uid('call'),
        status: 'dialing',
        contact: {
            key: String(who.key),
            name: String(who.name),
            description: String(who.description || ''),
            personality: String(who.personality || ''),
            scenario: String(who.scenario || ''),
        },
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

    // User may have hung up while dialing
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
 * Hang up / cancel dialing.
 * @returns {CallSession}
 */
export function endCall() {
    if (session.status === 'idle' || session.status === 'ended') {
        session = emptySession();
        emit();
        return getCallSession();
    }
    const name = session.contact?.name || 'call';
    session.status = 'ended';
    session.endedAt = Date.now();
    session.busy = false;
    session.turns.push({
        id: uid('turn'),
        role: 'system',
        text: 'Call ended',
        timestamp: Date.now(),
    });
    emit();
    const durationMs = (session.connectedAt || session.startedAt)
        ? session.endedAt - (session.connectedAt || session.startedAt)
        : 0;
    const sec = Math.max(0, Math.round(durationMs / 1000));
    toast(sec ? `Call ended · ${sec}s` : 'Call ended', 'info', name);
    // Reset to idle after a beat so UI can show ended state once if needed
    const ended = getCallSession();
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
        const raw = await generateMailText(prompt);
        const spoken = cleanCallReply(raw);
        if (!spoken) {
            toast('No reply on the line', 'warning');
            session.busy = false;
            emit();
            return null;
        }
        // Hung up while waiting
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
    // Drop accidental SUBJECT/BODY mail formatting
    text = text.replace(/^\s*SUBJECT:\s*.+$/im, '').replace(/^\s*BODY:\s*/im, '').trim();
    // Strip wrapping quotes
    if (
        (text.startsWith('"') && text.endsWith('"'))
        || (text.startsWith('“') && text.endsWith('”'))
    ) {
        text = text.slice(1, -1).trim();
    }
    // Drop leading Name: style
    text = text.replace(/^[A-Z][\w'’.\- ]{0,40}:\s+/u, '').trim();
    return text.slice(0, 1200);
}

export function getPersonaLabel() {
    return getPersonaName();
}
