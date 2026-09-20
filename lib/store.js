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
    return { emails: [], memorySelections: {}, version: 2 };
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
    if (!chatMetadata[META_KEY].memorySelections
        || typeof chatMetadata[META_KEY].memorySelections !== 'object') {
        chatMetadata[META_KEY].memorySelections = {};
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
    store.memorySelections = {};
    await persistMailStore();
}

/**
 * @typedef {Object} MailMemorySelection
 * @property {'auto'|'manual'} mode
 * @property {string[]} ids
 */

/**
 * @param {string} characterKey
 * @returns {MailMemorySelection}
 */
export function getMemorySelection(characterKey) {
    const key = String(characterKey || '').trim();
    const store = getMailStore();
    const raw = key ? store.memorySelections[key] : null;
    if (!raw || typeof raw !== 'object') {
        return { mode: 'auto', ids: [] };
    }
    const mode = raw.mode === 'manual' ? 'manual' : 'auto';
    const ids = Array.isArray(raw.ids)
        ? raw.ids.map((id) => String(id)).filter(Boolean)
        : [];
    return { mode, ids };
}

/**
 * @param {string} characterKey
 * @param {Partial<MailMemorySelection>} selection
 */
export async function setMemorySelection(characterKey, selection) {
    const key = String(characterKey || '').trim();
    if (!key) {
        return getMemorySelection(key);
    }
    const store = getMailStore();
    const next = {
        mode: selection.mode === 'manual' ? 'manual' : 'auto',
        ids: Array.isArray(selection.ids)
            ? [...new Set(selection.ids.map((id) => String(id)).filter(Boolean))]
            : [],
    };
    if (next.mode === 'auto') {
        delete store.memorySelections[key];
    } else {
        store.memorySelections[key] = next;
    }
    await persistMailStore();
    return next;
}

/**
 * Auto candidates for a contact: mail to/from them (or all if scope is all).
 * @param {MailContact | { key?: string, name?: string } | null} contact
 * @param {'speaker'|'all'} [scope]
 * @returns {EmailMessage[]}
 */
export function listAutoMemoryEmails(contact, scope = 'speaker') {
    const all = getEmails();
    if (scope === 'all' || !contact) {
        return all;
    }
    return all.filter((e) => emailInvolvesContact(e, contact));
}

/**
 * Emails that will actually be injected for this character.
 * Manual picker overrides auto to/from filtering.
 * @param {MailContact | { key?: string, name?: string } | null} contact
 * @param {{ scope?: 'speaker'|'all', max?: number }} [opts]
 * @returns {EmailMessage[]}
 */
export function getEmailsForCharacterMemory(contact, opts = {}) {
    const scope = opts.scope === 'all' ? 'all' : 'speaker';
    const max = Number.isFinite(opts.max) ? Math.max(1, Math.min(80, opts.max)) : 40;
    const key = contact?.key ? String(contact.key) : '';
    const selection = key ? getMemorySelection(key) : { mode: 'auto', ids: [] };

    /** @type {EmailMessage[]} */
    let list;
    if (selection.mode === 'manual') {
        const byId = new Map(getEmails().map((e) => [e.id, e]));
        list = selection.ids.map((id) => byId.get(id)).filter(Boolean);
    } else {
        list = listAutoMemoryEmails(contact, scope);
    }

    return [...list]
        .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
        .slice(0, max);
}

/**
 * Toggle one mail in a character's manual memory set.
 * Switching from auto seeds the selection with current auto ids first.
 * @param {MailContact | { key?: string, name?: string }} contact
 * @param {string} emailId
 * @param {boolean} enabled
 * @param {'speaker'|'all'} [scope]
 */
export async function toggleCharacterMemoryEmail(contact, emailId, enabled, scope = 'speaker') {
    const key = String(contact?.key || '').trim();
    if (!key || !emailId) {
        return getMemorySelection(key);
    }
    const current = getMemorySelection(key);
    let ids;
    if (current.mode === 'manual') {
        ids = [...current.ids];
    } else {
        ids = listAutoMemoryEmails(contact, scope).map((e) => e.id);
    }
    if (enabled) {
        if (!ids.includes(emailId)) {
            ids.push(emailId);
        }
    } else {
        ids = ids.filter((id) => id !== emailId);
    }
    return setMemorySelection(key, { mode: 'manual', ids });
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

/**
 * @typedef {Object} MailContact
 * @property {string} key
 * @property {string} name
 * @property {number} [characterIndex]
 * @property {boolean} [isActive]
 * @property {string} [description]
 * @property {string} [personality]
 * @property {string} [scenario]
 */

function contactFromCharacter(ch, index, isActive = false) {
    if (!ch) {
        return null;
    }
    const data = ch.data || {};
    return {
        key: ch.avatar || ch.name || String(index),
        name: ch.name || data.name || `Character ${index}`,
        characterIndex: index,
        isActive,
        description: String(data.description || ch.description || '').slice(0, 1200),
        personality: String(data.personality || ch.personality || '').slice(0, 800),
        scenario: String(data.scenario || ch.scenario || '').slice(0, 600),
    };
}

/**
 * Find a character index for a group-member id (avatar filename, name, or index).
 * @param {any[]} characters
 * @param {string|number} memberId
 */
function findCharacterIndex(characters, memberId) {
    const needle = String(memberId ?? '').trim();
    if (!needle) {
        return -1;
    }
    let index = characters.findIndex((c) => c?.avatar === needle);
    if (index >= 0) {
        return index;
    }
    index = characters.findIndex((c) => c?.name === needle);
    if (index >= 0) {
        return index;
    }
    const asNum = Number(needle);
    if (Number.isInteger(asNum) && asNum >= 0 && asNum < characters.length) {
        return asNum;
    }
    return -1;
}

/**
 * Contacts for the To: picker — only characters in the active chat.
 * Group chat → group members. Solo chat → the active character only.
 */
export function listMailContacts() {
    const ctx = getContext();
    const characters = ctx.characters || [];
    /** @type {MailContact[]} */
    const contacts = [];
    const seen = new Set();

    const push = (contact) => {
        if (!contact?.key || seen.has(contact.key)) {
            return;
        }
        seen.add(contact.key);
        contacts.push(contact);
    };

    if (ctx.groupId) {
        const group = (ctx.groups || []).find((g) => g.id === ctx.groupId);
        const members = group?.members || [];
        for (const memberId of members) {
            const index = findCharacterIndex(characters, memberId);
            if (index >= 0) {
                const isActive = Number(ctx.characterId) === index;
                push(contactFromCharacter(characters[index], index, isActive));
            }
        }
    } else if (ctx.characterId != null && characters[ctx.characterId]) {
        push(contactFromCharacter(characters[ctx.characterId], Number(ctx.characterId), true));
    }

    contacts.sort((a, b) => {
        if (a.isActive && !b.isActive) return -1;
        if (!a.isActive && b.isActive) return 1;
        return a.name.localeCompare(b.name);
    });

    return contacts;
}

/**
 * Whether an email belongs to a given contact (for per-character chat injection).
 * @param {EmailMessage} email
 * @param {MailContact | { key?: string, name?: string } | null} contact
 */
export function emailInvolvesContact(email, contact) {
    if (!email || !contact) {
        return false;
    }
    const key = String(contact.key || '').trim();
    const name = String(contact.name || '').trim().toLowerCase();
    if (key && email.characterKey && email.characterKey === key) {
        return true;
    }
    if (name) {
        if (String(email.from || '').trim().toLowerCase() === name) {
            return true;
        }
        if (String(email.to || '').trim().toLowerCase() === name) {
            return true;
        }
    }
    if (key && (email.from === key || email.to === key)) {
        return true;
    }
    return false;
}

export function resolveMailContact(keyOrName) {
    const needle = String(keyOrName || '').trim();
    const contacts = listMailContacts();
    if (!needle) {
        return contacts.find((c) => c.isActive) || contacts[0] || null;
    }
    return contacts.find((c) => c.key === needle)
        || contacts.find((c) => c.name.toLowerCase() === needle.toLowerCase())
        || null;
}
