import { CALL_PROMPT_KEY, DEFAULT_CALL_MEMORY_PROMPT } from './constants.js';
import { getContext, getSettings, saveSettings, toast } from './settings.js';
import { getMailStore, persistMailStore, getPersonaName } from './store.js';
import { generateMailText } from './generate.js';

/**
 * @typedef {{
 *   id: string,
 *   contactKey: string,
 *   contactName: string,
 *   direction: 'in'|'out'|'',
 *   startedAt: number,
 *   endedAt: number,
 *   turns?: Array<{ role: string, text: string, timestamp?: number }>,
 *   summary?: string,
 *   summarized?: boolean,
 * }} CallMemoryRecord
 */

function ensureCallsArray() {
    const store = getMailStore();
    if (!Array.isArray(store.calls)) {
        store.calls = [];
    }
    return /** @type {CallMemoryRecord[]} */ (store.calls);
}

function maxStored() {
    const n = Number(getSettings().callMemoryMax);
    return Number.isFinite(n) && n > 0 ? Math.min(40, Math.floor(n)) : 8;
}

/**
 * @returns {CallMemoryRecord[]}
 */
export function getCallMemories() {
    return [...ensureCallsArray()];
}

/**
 * Persist a finished call session into chat metadata.
 * @param {{
 *   id?: string,
 *   contact?: { key?: string, name?: string } | null,
 *   direction?: string,
 *   startedAt?: number,
 *   endedAt?: number,
 *   connectedAt?: number,
 *   turns?: Array<{ role: string, text: string, timestamp?: number }>,
 * }} endedSession
 * @returns {Promise<CallMemoryRecord | null>}
 */
export async function recordCallMemory(endedSession) {
    if (!endedSession?.id && !endedSession?.turns?.length) {
        return null;
    }
    const spoken = (endedSession.turns || []).filter((t) => t.role === 'user' || t.role === 'char');
    // Skip empty rings with no dialogue unless we still want a missed-call marker
    const wasMissed = (endedSession.turns || []).some((t) => /missed/i.test(String(t.text || '')));
    if (!spoken.length && !wasMissed) {
        return null;
    }

    const record = /** @type {CallMemoryRecord} */ ({
        id: endedSession.id || `call_${Date.now().toString(36)}`,
        contactKey: String(endedSession.contact?.key || ''),
        contactName: String(endedSession.contact?.name || 'Unknown'),
        direction: endedSession.direction === 'in' || endedSession.direction === 'out'
            ? endedSession.direction
            : '',
        startedAt: Number(endedSession.startedAt) || Date.now(),
        endedAt: Number(endedSession.endedAt) || Date.now(),
        turns: (endedSession.turns || []).map((t) => ({
            role: t.role,
            text: String(t.text || ''),
            timestamp: t.timestamp,
        })),
        summary: '',
        summarized: false,
    });

    const list = ensureCallsArray();
    list.unshift(record);
    while (list.length > maxStored()) {
        list.pop();
    }
    await persistMailStore();

    const settings = getSettings();
    if (settings.callSummarizeOnEnd && spoken.length) {
        try {
            await summarizeCallRecord(record.id, { silent: true });
        } catch (err) {
            console.warn('[Phone Trigger] auto call summarize failed', err);
        }
    }

    updateCallMemoryPrompt();
    return record;
}

/**
 * @param {string} callId
 */
export async function removeCallMemory(callId) {
    const list = ensureCallsArray();
    const id = String(callId || '');
    const next = list.filter((c) => c.id !== id);
    getMailStore().calls = next;
    await persistMailStore();
    updateCallMemoryPrompt();
}

export async function clearCallMemories() {
    getMailStore().calls = [];
    await persistMailStore();
    updateCallMemoryPrompt();
}

/**
 * Build a compact transcript string for summarization / display.
 * @param {CallMemoryRecord} record
 * @param {string} [persona]
 */
export function formatCallTranscript(record, persona) {
    const user = persona || getPersonaName();
    const char = record.contactName || 'Character';
    const lines = [];
    for (const t of record.turns || []) {
        if (t.role === 'system') {
            continue;
        }
        const who = t.role === 'user' ? user : char;
        const text = String(t.text || '').replace(/\s+/g, ' ').trim();
        if (!text) {
            continue;
        }
        lines.push(`${who}: ${text}`);
    }
    return lines.join('\n');
}

/**
 * Summarize a stored call (token-efficient memory). Drops full turns when successful.
 * @param {string} callId
 * @param {{ silent?: boolean, keepTurns?: boolean }} [opts]
 * @returns {Promise<CallMemoryRecord | null>}
 */
export async function summarizeCallRecord(callId, opts = {}) {
    const list = ensureCallsArray();
    const record = list.find((c) => c.id === callId);
    if (!record) {
        return null;
    }
    const transcript = formatCallTranscript(record);
    if (!transcript.trim()) {
        record.summary = record.summary || '(No spoken lines.)';
        record.summarized = true;
        if (!opts.keepTurns) {
            record.turns = [];
        }
        await persistMailStore();
        updateCallMemoryPrompt();
        return record;
    }

    const persona = getPersonaName();
    const prompt = [
        'Summarize this phone call for story memory.',
        'Write 2–5 plain sentences covering what was said and decided.',
        'Past tense. No quotes dump. No stage directions. No "as an AI".',
        'Output ONLY the summary.',
        '',
        `Participants: ${persona}, ${record.contactName}`,
        `Direction: ${record.direction === 'in' ? 'incoming' : record.direction === 'out' ? 'outgoing' : 'call'}`,
        '',
        'Transcript:',
        transcript,
    ].join('\n');

    let summary = '';
    try {
        summary = String(await generateMailText(prompt) || '').trim().replace(/^["']|["']$/g, '');
    } catch (err) {
        console.warn('[Phone Trigger] call summarize gen failed', err);
        if (!opts.silent) {
            toast('Call summarize failed', 'error');
        }
        throw err;
    }

    if (!summary) {
        summary = transcript.split('\n').slice(0, 4).join(' / ').slice(0, 320);
    }

    record.summary = summary.slice(0, 1200);
    record.summarized = true;
    if (!opts.keepTurns) {
        record.turns = [];
    }
    await persistMailStore();
    updateCallMemoryPrompt();
    if (!opts.silent) {
        toast('Call summarized', 'success', 'CALL');
    }
    return record;
}

/**
 * @param {CallMemoryRecord} record
 */
function formatCallInjectLine(record) {
    const when = record.endedAt || record.startedAt;
    const stamp = when ? new Date(when).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
    const dir = record.direction === 'in' ? '←' : record.direction === 'out' ? '→' : '·';
    if (record.summary) {
        return `- [${stamp}] ${dir} ${record.contactName}: ${record.summary}`;
    }
    const transcript = formatCallTranscript(record).replace(/\n/g, ' | ').slice(0, 220);
    return `- [${stamp}] ${dir} ${record.contactName}: ${transcript || '(empty)'}`;
}

export function buildCallMemoryPrompt() {
    const settings = getSettings();
    if (!settings.enabled || !settings.injectCallMemory) {
        return '';
    }
    const max = Number(settings.callMemoryInjectMax);
    const n = Number.isFinite(max) && max > 0 ? Math.min(20, Math.floor(max)) : 4;
    const calls = getCallMemories().slice(0, n);
    if (!calls.length) {
        return '';
    }
    const callList = calls.map(formatCallInjectLine).join('\n');
    const template = String(settings.callMemoryPrompt || '').trim() || DEFAULT_CALL_MEMORY_PROMPT;
    const persona = getPersonaName();
    return template
        .replace(/\{\{\s*call_list\s*\}\}/gi, callList)
        .replace(/\{\{\s*user\s*\}\}/gi, persona)
        .replace(/\{\{\s*persona\s*\}\}/gi, persona)
        .replace(/\{\{\s*char\s*\}\}/gi, 'Character')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

export function updateCallMemoryPrompt() {
    const ctx = getContext();
    if (typeof ctx.setExtensionPrompt !== 'function') {
        return;
    }
    const settings = getSettings();
    const value = settings.enabled && settings.injectCallMemory ? buildCallMemoryPrompt() : '';
    const position = Number.isFinite(Number(settings.callMemoryPromptPosition))
        ? Number(settings.callMemoryPromptPosition)
        : 1;
    const depth = Number.isFinite(Number(settings.callMemoryPromptDepth))
        ? Number(settings.callMemoryPromptDepth)
        : 1;
    try {
        ctx.setExtensionPrompt(CALL_PROMPT_KEY, value, position, depth);
    } catch {
        try {
            ctx.setExtensionPrompt(CALL_PROMPT_KEY, value, ctx.extension_prompt_types?.IN_CHAT ?? position, depth);
        } catch (err) {
            console.warn('[Phone Trigger] call memory setExtensionPrompt failed', err);
        }
    }
}

export function clearCallMemoryPrompt() {
    const ctx = getContext();
    if (typeof ctx.setExtensionPrompt !== 'function') {
        return;
    }
    try {
        ctx.setExtensionPrompt(CALL_PROMPT_KEY, '', 1, 0);
    } catch {
        try {
            ctx.setExtensionPrompt(CALL_PROMPT_KEY, '', ctx.extension_prompt_types?.IN_CHAT ?? 1, 0);
        } catch {
            /* ignore */
        }
    }
}

/**
 * Toggle call-memory inject from settings.
 * @param {boolean} on
 */
export function setCallMemoryInject(on) {
    const s = getSettings();
    s.injectCallMemory = Boolean(on);
    saveSettings();
    if (s.injectCallMemory) {
        updateCallMemoryPrompt();
    } else {
        clearCallMemoryPrompt();
    }
}
