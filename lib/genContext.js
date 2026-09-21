import { getContext, getSettings } from './settings.js';
import {
    getMailStore,
    persistMailStore,
    getEmails,
    getPersonaName,
    listAutoMemoryEmails,
    getEmailsForCharacterMemory,
} from './store.js';
import { getCallMemories, formatCallTranscript } from './callMemory.js';

/**
 * @typedef {'auto'|'manual'|'off'} GenContextMode
 * @typedef {{ mode: GenContextMode, ids: string[] }} GenContextBucket
 * @typedef {{
 *   mail: { chat: GenContextBucket, calls: GenContextBucket },
 *   call: { chat: GenContextBucket, mail: GenContextBucket, calls: GenContextBucket },
 * }} GenContextState
 */

/** @returns {GenContextBucket} */
function defaultBucket(mode = 'auto') {
    return { mode, ids: [] };
}

/** @returns {GenContextState} */
function defaultGenContext() {
    return {
        mail: {
            chat: defaultBucket('auto'),
            calls: defaultBucket('auto'),
        },
        call: {
            chat: defaultBucket('auto'),
            mail: defaultBucket('auto'),
            calls: defaultBucket('auto'),
        },
    };
}

/**
 * @param {unknown} raw
 * @param {GenContextMode} [fallbackMode]
 * @returns {GenContextBucket}
 */
function normalizeBucket(raw, fallbackMode = 'auto') {
    if (!raw || typeof raw !== 'object') {
        return defaultBucket(fallbackMode);
    }
    const mode = raw.mode === 'manual' || raw.mode === 'off' || raw.mode === 'auto'
        ? raw.mode
        : fallbackMode;
    const ids = Array.isArray(raw.ids)
        ? [...new Set(raw.ids.map((id) => String(id)).filter(Boolean))]
        : [];
    return { mode, ids };
}

/**
 * @returns {GenContextState}
 */
export function getGenContextState() {
    const store = getMailStore();
    if (!store.genContext || typeof store.genContext !== 'object') {
        store.genContext = defaultGenContext();
    }
    const raw = store.genContext;
    const mail = raw.mail && typeof raw.mail === 'object' ? raw.mail : {};
    const call = raw.call && typeof raw.call === 'object' ? raw.call : {};
    return {
        mail: {
            chat: normalizeBucket(mail.chat, 'auto'),
            calls: normalizeBucket(mail.calls, 'auto'),
        },
        call: {
            chat: normalizeBucket(call.chat, 'auto'),
            mail: normalizeBucket(call.mail, 'auto'),
            calls: normalizeBucket(call.calls, 'auto'),
        },
    };
}

/**
 * @param {'mail'|'call'} target
 * @param {'chat'|'mail'|'calls'} source
 * @returns {GenContextBucket}
 */
export function getGenContextBucket(target, source) {
    const state = getGenContextState();
    if (target === 'mail') {
        if (source === 'chat') {
            return state.mail.chat;
        }
        if (source === 'calls') {
            return state.mail.calls;
        }
        return defaultBucket('off');
    }
    if (source === 'chat') {
        return state.call.chat;
    }
    if (source === 'mail') {
        return state.call.mail;
    }
    if (source === 'calls') {
        return state.call.calls;
    }
    return defaultBucket('off');
}

/**
 * @param {'mail'|'call'} target
 * @param {'chat'|'mail'|'calls'} source
 * @param {Partial<GenContextBucket>} next
 */
export async function setGenContextBucket(target, source, next) {
    const store = getMailStore();
    const state = getGenContextState();
    const bucket = {
        mode: next.mode === 'manual' || next.mode === 'off' || next.mode === 'auto'
            ? next.mode
            : 'auto',
        ids: Array.isArray(next.ids)
            ? [...new Set(next.ids.map((id) => String(id)).filter(Boolean))]
            : [],
    };
    if (target === 'mail') {
        if (source === 'chat') {
            state.mail.chat = bucket;
        } else if (source === 'calls') {
            state.mail.calls = bucket;
        }
    } else if (target === 'call') {
        if (source === 'chat') {
            state.call.chat = bucket;
        } else if (source === 'mail') {
            state.call.mail = bucket;
        } else if (source === 'calls') {
            state.call.calls = bucket;
        }
    }
    store.genContext = state;
    await persistMailStore();
    return bucket;
}

/**
 * Toggle one id in a manual bucket (seeds from auto candidates when leaving auto).
 * @param {'mail'|'call'} target
 * @param {'chat'|'mail'|'calls'} source
 * @param {string} id
 * @param {boolean} enabled
 * @param {string[]} [autoIds] ids to seed when switching from auto
 */
export async function toggleGenContextId(target, source, id, enabled, autoIds = []) {
    const needle = String(id || '');
    if (!needle) {
        return getGenContextBucket(target, source);
    }
    const current = getGenContextBucket(target, source);
    let ids;
    if (current.mode === 'manual') {
        ids = [...current.ids];
    } else {
        ids = [...autoIds];
    }
    if (enabled) {
        if (!ids.includes(needle)) {
            ids.push(needle);
        }
    } else {
        ids = ids.filter((x) => x !== needle);
    }
    return setGenContextBucket(target, source, { mode: 'manual', ids });
}

/**
 * List recent chat lines for context pickers / builders.
 * @param {number} [limit]
 * @returns {Array<{ id: string, index: number, name: string, text: string }>}
 */
export function listChatContextItems(limit = 40) {
    const ctx = getContext();
    const chat = Array.isArray(ctx.chat) ? ctx.chat : [];
    const persona = getPersonaName();
    const max = Number.isFinite(limit) && limit > 0 ? Math.min(Math.floor(limit), 60) : 40;
    /** @type {Array<{ id: string, index: number, name: string, text: string }>} */
    const out = [];
    for (let i = chat.length - 1; i >= 0 && out.length < max; i--) {
        const msg = chat[i];
        if (!msg || msg.is_system) {
            continue;
        }
        const text = String(msg.mes || '')
            .replace(/<email\b[^>]*>[\s\S]*?<\/email>/gi, ' ')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, 220);
        if (!text) {
            continue;
        }
        const name = msg.name || (msg.is_user ? persona : 'Character');
        out.push({
            id: `chat_${i}`,
            index: i,
            name,
            text,
        });
    }
    return out.reverse();
}

/**
 * @param {number} [limit]
 * @returns {string[]}
 */
export function listAutoChatContextIds(limit) {
    const settings = getSettings();
    const n = Number.isFinite(limit)
        ? limit
        : Number(settings.chatSummaryMessages);
    const max = Number.isFinite(n) && n > 0 ? Math.min(Math.floor(n), 40) : 12;
    return listChatContextItems(Math.max(max, 40))
        .slice(-max)
        .map((item) => item.id);
}

/**
 * Resolve selected / auto chat lines into "Name: text" rows.
 * @param {'mail'|'call'} target
 * @returns {string[]}
 */
export function resolveChatContextLines(target) {
    const settings = getSettings();
    const masterOn = target === 'mail'
        ? settings.injectChatIntoMail !== false
        : settings.injectChatIntoCall !== false;
    if (!masterOn) {
        return [];
    }

    const bucket = getGenContextBucket(target, 'chat');
    if (bucket.mode === 'off') {
        return [];
    }

    const items = listChatContextItems(60);
    const byId = new Map(items.map((item) => [item.id, item]));
    // Also resolve absolute indices that may fall outside the recent window
    const ctx = getContext();
    const chat = Array.isArray(ctx.chat) ? ctx.chat : [];
    const persona = getPersonaName();

    /** @param {string} id */
    const resolveOne = (id) => {
        const hit = byId.get(id);
        if (hit) {
            return `${hit.name}: ${hit.text}`;
        }
        const m = /^chat_(\d+)$/.exec(String(id));
        if (!m) {
            return '';
        }
        const index = Number(m[1]);
        const msg = chat[index];
        if (!msg || msg.is_system) {
            return '';
        }
        const text = String(msg.mes || '')
            .replace(/<email\b[^>]*>[\s\S]*?<\/email>/gi, ' ')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, 220);
        if (!text) {
            return '';
        }
        const name = msg.name || (msg.is_user ? persona : 'Character');
        return `${name}: ${text}`;
    };

    if (bucket.mode === 'manual') {
        return bucket.ids.map(resolveOne).filter(Boolean);
    }

    // auto
    return listAutoChatContextIds().map(resolveOne).filter(Boolean);
}

/**
 * Format emails for gen-prompt injection.
 * @param {import('./store.js').EmailMessage[]} emails
 * @param {number} [previewLen]
 */
function formatMailLines(emails, previewLen = 160) {
    return emails.map((e) => {
        const dir = e.direction === 'in' ? '←' : '→';
        const stamp = e.timestamp
            ? new Date(e.timestamp).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
            : '';
        const body = String(e.body || '').replace(/\s+/g, ' ').trim().slice(0, previewLen);
        const dmail = e.isDmail ? ' [D-Mail]' : '';
        return `- [${stamp}] ${dir} ${e.from} → ${e.to} | ${e.subject}${dmail}: ${body}`;
    });
}

/**
 * Emails feeding call generation (for a contact).
 * @param {{ key?: string, name?: string } | null} [contact]
 * @returns {import('./store.js').EmailMessage[]}
 */
export function resolveMailContextForCall(contact = null) {
    const settings = getSettings();
    if (settings.injectMailIntoCall === false) {
        return [];
    }
    const bucket = getGenContextBucket('call', 'mail');
    if (bucket.mode === 'off') {
        return [];
    }

    const max = Number(settings.callMailContextMax);
    const cap = Number.isFinite(max) && max > 0 ? Math.min(40, Math.floor(max)) : 8;

    if (bucket.mode === 'manual') {
        const byId = new Map(getEmails().map((e) => [e.id, e]));
        return bucket.ids.map((id) => byId.get(id)).filter(Boolean).slice(0, cap);
    }

    // auto — prefer character mail-memory picks, else involving contact
    if (contact?.key) {
        const remembered = getEmailsForCharacterMemory(contact, {
            scope: settings.mailMemoryScope === 'all' ? 'all' : 'speaker',
            max: cap,
        });
        if (remembered.length) {
            return remembered;
        }
        return listAutoMemoryEmails(contact, 'speaker').slice(0, cap);
    }
    return getEmails().slice(0, cap);
}

/**
 * @param {import('./callMemory.js').CallMemoryRecord} record
 */
function formatCallContextLine(record) {
    const when = record.endedAt || record.startedAt;
    const stamp = when
        ? new Date(when).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
        : '';
    const dir = record.direction === 'in' ? '←' : record.direction === 'out' ? '→' : '·';
    if (record.summary) {
        return `- [${stamp}] ${dir} ${record.contactName}: ${record.summary}`;
    }
    const transcript = formatCallTranscript(record).replace(/\s+/g, ' ').slice(0, 220);
    return `- [${stamp}] ${dir} ${record.contactName}: ${transcript || '(empty)'}`;
}

/**
 * Prior call memories for mail or call generation.
 * @param {'mail'|'call'} target
 * @param {{ key?: string, name?: string } | null} [contact]
 */
export function resolveCallMemoryForGen(target, contact = null) {
    const settings = getSettings();
    const masterOn = target === 'mail'
        ? settings.injectCallMemoryIntoMail !== false
        : settings.injectCallMemoryIntoCall !== false;
    if (!masterOn) {
        return [];
    }
    const bucket = getGenContextBucket(target, 'calls');
    if (bucket.mode === 'off') {
        return [];
    }

    const maxSetting = Number(settings.callMemoryInjectMax);
    const cap = Number.isFinite(maxSetting) && maxSetting > 0
        ? Math.min(20, Math.floor(maxSetting))
        : 4;
    const all = getCallMemories();

    if (bucket.mode === 'manual') {
        const byId = new Map(all.map((c) => [c.id, c]));
        return bucket.ids.map((id) => byId.get(id)).filter(Boolean).slice(0, cap);
    }

    // auto — prefer same contact, else newest
    if (contact?.key) {
        const keyed = all.filter((c) => c.contactKey === contact.key);
        if (keyed.length) {
            return keyed.slice(0, cap);
        }
    }
    return all.slice(0, cap);
}

/**
 * Build chat_summary block for mail or call prompts.
 * @param {'mail'|'call'} target
 * @returns {string}
 */
export function buildGenChatSummaryBlock(target) {
    const lines = resolveChatContextLines(target);
    if (!lines.length) {
        return '';
    }
    const header = target === 'call'
        ? 'Recent story / chat context (for awareness only — do not narrate this; speak on the phone):'
        : 'Recent story / chat context (for awareness only — do not narrate this; write an e-mail):';
    return [header, ...lines].join('\n');
}

/**
 * Build mail_context block for call prompts.
 * @param {{ key?: string, name?: string } | null} [contact]
 * @returns {string}
 */
export function buildGenMailContextBlock(contact = null) {
    const emails = resolveMailContextForCall(contact);
    if (!emails.length) {
        return '';
    }
    return [
        'Related e-mail memory (for awareness only — do not narrate reading mail; speak on the phone):',
        ...formatMailLines(emails),
    ].join('\n');
}

/**
 * Build call_memory block for mail or call prompts.
 * @param {'mail'|'call'} target
 * @param {{ key?: string, name?: string } | null} [contact]
 * @returns {string}
 */
export function buildGenCallMemoryBlock(target, contact = null) {
    const calls = resolveCallMemoryForGen(target, contact);
    if (!calls.length) {
        return '';
    }
    const header = target === 'call'
        ? 'Prior phone-call memory (for awareness only — do not narrate this; speak on the phone):'
        : 'Prior phone-call memory (for awareness only — do not narrate this; write an e-mail):';
    return [header, ...calls.map(formatCallContextLine)].join('\n');
}

/**
 * Ensure store has genContext on load.
 */
export function ensureGenContextStore() {
    getGenContextState();
}
