import { META_KEY, LEGACY_META_KEY } from './constants.js';
import { getContext } from './settings.js';

/**
 * @typedef {Object} EmailMessage
 * @property {string} id
 * @property {'in'|'out'} direction
 * @property {string} from
 * @property {string} to
 * @property {string} subject
 * @property {string} body
 * @property {number} timestamp
 * @property {boolean} read
 * @property {string[]} [replyOptions]
 * @property {string} [characterKey]
 * @property {string} [inReplyTo]
 */

function emptyStore() {
    return { emails: [], version: 1 };
}

export function getMailStore() {
    const { chatMetadata } = getContext();
    if (!chatMetadata[META_KEY] && chatMetadata[LEGACY_META_KEY]) {
        chatMetadata[META_KEY] = chatMetadata[LEGACY_META_KEY];
    }
    if (!chatMetadata[META_KEY]) {
        chatMetadata[META_KEY] = emptyStore();
    }
    if (!Array.isArray(chatMetadata[META_KEY].emails)) {
        chatMetadata[META_KEY].emails = [];
    }
    return chatMetadata[META_KEY];
}

export async function persistMailStore() {
    const { saveMetadata } = getContext();
    if (typeof saveMetadata === 'function') {
        await saveMetadata();
    }
}

function uid() {
    return `mail_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * @param {Partial<EmailMessage> & { direction: 'in'|'out', from: string, to: string, subject: string, body: string }} data
 * @returns {Promise<EmailMessage>}
 */
export async function addEmail(data) {
    const store = getMailStore();
    /** @type {EmailMessage} */
    const email = {
        id: data.id || uid(),
        direction: data.direction,
        from: String(data.from || '').trim() || 'Unknown',
        to: String(data.to || '').trim() || 'Unknown',
        subject: String(data.subject || '').trim() || '(no subject)',
        body: String(data.body || '').trim(),
        timestamp: data.timestamp ?? Date.now(),
        read: data.read ?? data.direction === 'out',
        replyOptions: Array.isArray(data.replyOptions) ? data.replyOptions.filter(Boolean) : undefined,
        characterKey: data.characterKey,
        inReplyTo: data.inReplyTo,
    };
    store.emails.unshift(email);
    await persistMailStore();
    return email;
}

export function getEmails() {
    return [...getMailStore().emails];
}

export function getInbox() {
    return getEmails().filter((e) => e.direction === 'in');
}

export function getOutbox() {
    return getEmails().filter((e) => e.direction === 'out');
}

export function getEmailById(id) {
    return getEmails().find((e) => e.id === id) || null;
}

export async function markRead(id) {
    const store = getMailStore();
    const email = store.emails.find((e) => e.id === id);
    if (!email || email.read) {
        return email;
    }
    email.read = true;
    await persistMailStore();
    return email;
}

export function getUnreadCount() {
    return getInbox().filter((e) => !e.read).length;
}

export async function clearAllMail() {
    const store = getMailStore();
    store.emails = [];
    await persistMailStore();
}

export function getPersonaName() {
    const ctx = getContext();
    return ctx.name1 || ctx.user?.name || 'User';
}

export function getActiveCharacterName() {
    const ctx = getContext();
    if (ctx.groupId) {
        return 'Group';
    }
    const ch = ctx.characters?.[ctx.characterId];
    return ch?.name || ctx.name2 || 'Character';
}

export function getActiveCharacterKey() {
    const ctx = getContext();
    if (ctx.groupId) {
        return `group:${ctx.groupId}`;
    }
    const ch = ctx.characters?.[ctx.characterId];
    return ch?.avatar || ch?.name || String(ctx.characterId ?? 'unknown');
}
