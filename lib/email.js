import { PROMPT_KEY } from './constants.js';
import { getSettings, getContext, toast } from './settings.js';
import {
    addEmail,
    getActiveCharacterKey,
    getActiveCharacterName,
    getPersonaName,
    getInbox,
    getOutbox,
    resolveMailContact,
    emailInvolvesContact,
    listMailContacts,
} from './store.js';
import { playNotification } from './audio.js';
import { buildMailReplyPrompt, generateMailText } from './generate.js';

/** @type {((email: import('./store.js').EmailMessage) => void) | null} */
let onMailReceived = null;

/** @type {Map<string, ReturnType<typeof setTimeout>>} */
const pendingReplyTimers = new Map();

export function setMailReceivedHandler(handler) {
    onMailReceived = handler;
}

const EMAIL_TAG_RE = /<email\b([^>]*)>([\s\S]*?)<\/email>/gi;
const ATTR_RE = /(\w+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g;

function parseAttrs(attrText) {
    /** @type {Record<string, string>} */
    const attrs = {};
    let m;
    ATTR_RE.lastIndex = 0;
    while ((m = ATTR_RE.exec(attrText)) !== null) {
        attrs[m[1].toLowerCase()] = m[2] ?? m[3] ?? m[4] ?? '';
    }
    return attrs;
}

/**
 * Strip and ingest <email> tags from character output.
 * @param {string} text
 * @returns {{ cleaned: string, emails: Array<{subject: string, body: string, from?: string, replyOptions?: string[]}> }}
 */
export function extractEmailTags(text) {
    if (!text || typeof text !== 'string') {
        return { cleaned: text || '', emails: [] };
    }
    const emails = [];
    const cleaned = text.replace(EMAIL_TAG_RE, (_, attrText, body) => {
        const attrs = parseAttrs(attrText || '');
        const replyRaw = attrs.replies || attrs.options || '';
        const replyOptions = replyRaw
            ? replyRaw.split('|').map((s) => s.trim()).filter(Boolean)
            : undefined;
        emails.push({
            subject: attrs.subject || '(no subject)',
            body: String(body || '').trim(),
            from: attrs.from || undefined,
            replyOptions,
        });
        return '';
    }).replace(/\n{3,}/g, '\n\n').trim();
    return { cleaned, emails };
}

/**
 * Receive an inbound email from a character (or tool).
 */
export async function receiveEmail({
    from,
    subject,
    body,
    replyOptions,
    characterKey,
    silent = false,
}) {
    const persona = getPersonaName();
    const sender = from || getActiveCharacterName();
    const email = await addEmail({
        direction: 'in',
        from: sender,
        to: persona,
        subject,
        body,
        replyOptions,
        characterKey: characterKey || getActiveCharacterKey(),
        read: false,
    });

    if (!silent) {
        await playNotification();
        const settings = getSettings();
        if (settings.notifyInChat && typeof toastr !== 'undefined') {
            toast(`New mail from ${email.from}: ${email.subject}`, 'info', '✉ Mail');
        }
    }

    if (typeof onMailReceived === 'function') {
        onMailReceived(email);
    }

    updateMailPrompt();
    return email;
}

/**
 * User sends an outbound email.
 * Reply generation is scheduled independently (does not await / does not bind to main chat).
 * @param {{ to?: string, toKey?: string, subject: string, body: string, inReplyTo?: string, requestReply?: boolean }} args
 */
export async function sendUserEmail({ to, toKey, subject, body, inReplyTo, requestReply = true }) {
    const persona = getPersonaName();
    const contact = resolveMailContact(toKey || to) || {
        key: toKey || to || getActiveCharacterKey(),
        name: to || getActiveCharacterName(),
    };
    const outbound = await addEmail({
        direction: 'out',
        from: persona,
        to: contact.name,
        subject,
        body,
        inReplyTo,
        characterKey: contact.key,
        read: true,
    });

    updateMailPrompt();

    if (requestReply) {
        scheduleCharacterEmailReply(outbound, contact);
    }

    return outbound;
}

/**
 * Pick a delay in ms from settings (min–max seconds, immersion gap).
 */
function pickReplyDelayMs() {
    const settings = getSettings();
    let min = Number(settings.mailReplyDelayMin);
    let max = Number(settings.mailReplyDelayMax);
    if (!Number.isFinite(min) || min < 0) {
        min = 3;
    }
    if (!Number.isFinite(max) || max < min) {
        max = Math.max(min, 8);
    }
    const sec = min + Math.random() * (max - min);
    return Math.round(sec * 1000);
}

/**
 * Schedule an independent mail reply after a short delay.
 * Does not block send; does not wait on the main chat turn.
 * @param {import('./store.js').EmailMessage} outbound
 * @param {import('./store.js').MailContact | null} [contact]
 */
export function scheduleCharacterEmailReply(outbound, contact = null) {
    if (!outbound?.id) {
        return;
    }

    const existing = pendingReplyTimers.get(outbound.id);
    if (existing) {
        clearTimeout(existing);
    }

    const delayMs = pickReplyDelayMs();
    const timer = setTimeout(() => {
        pendingReplyTimers.delete(outbound.id);
        void requestCharacterEmailReply(outbound, contact);
    }, delayMs);
    pendingReplyTimers.set(outbound.id, timer);
}

/**
 * Ask the selected mail contact to reply — independent of the main chat character.
 * Uses the editable prompt template + raw/OpenRouter generation.
 * @param {import('./store.js').EmailMessage} outbound
 * @param {import('./store.js').MailContact | null} [contact]
 */
export async function requestCharacterEmailReply(outbound, contact = null) {
    const who = contact || resolveMailContact(outbound.characterKey) || resolveMailContact(outbound.to) || {
        key: outbound.characterKey,
        name: outbound.to,
    };

    const prompt = buildMailReplyPrompt({
        subject: outbound.subject,
        body: outbound.body,
        from: outbound.from,
        to: outbound.to,
    }, who);

    try {
        const raw = await generateMailText(prompt);
        const parsed = parseGeneratedEmail(raw, outbound.subject);
        if (!parsed.body) {
            return null;
        }
        return await receiveEmail({
            from: outbound.to,
            subject: parsed.subject,
            body: parsed.body,
            replyOptions: parsed.replyOptions,
            characterKey: outbound.characterKey || who?.key,
        });
    } catch (err) {
        console.error('[Phone Trigger] Email reply generation failed:', err);
        toast(err?.message || 'Failed to generate email reply', 'error');
        return null;
    }
}

function parseGeneratedEmail(raw, fallbackSubject) {
    const text = String(raw || '').trim();
    let subject = fallbackSubject?.startsWith('Re:') ? fallbackSubject : `Re: ${fallbackSubject || ''}`;
    let body = text;
    let replyOptions;

    const subjectMatch = text.match(/^\s*SUBJECT:\s*(.+)$/im);
    if (subjectMatch) {
        subject = subjectMatch[1].trim();
    }

    const bodyMatch = text.match(/BODY:\s*([\s\S]*?)(?:(?:^|\n)\s*REPLIES:\s*|$)/i);
    if (bodyMatch) {
        body = bodyMatch[1].trim();
    } else if (subjectMatch) {
        body = text.replace(subjectMatch[0], '').replace(/^\s*BODY:\s*/i, '').trim();
    }

    const repliesMatch = text.match(/REPLIES:\s*(.+)$/im);
    if (repliesMatch) {
        replyOptions = repliesMatch[1].split('|').map((s) => s.trim()).filter(Boolean);
        body = body.replace(/\n?\s*REPLIES:\s*.+$/im, '').trim();
    }

    return { subject, body, replyOptions };
}

export function buildMailSystemPrompt(forContact = null) {
    const settings = getSettings();
    if (!settings.enabled || !settings.injectPrompt) {
        return '';
    }

    const ctx = getContext();
    /** @type {import('./store.js').MailContact | { key?: string, name?: string } | null} */
    let contact = forContact;

    if (settings.injectMailOwnOnly) {
        if (!contact) {
            contact = resolveMailContact(getActiveCharacterKey()) || resolveMailContact(getActiveCharacterName());
        }
        // In a group chat, never dump everyone's mail into a shared prompt without a speaker.
        if (ctx.groupId && !contact) {
            return '';
        }
    }

    const persona = getPersonaName();
    const filterOwn = (list) => {
        if (!settings.injectMailOwnOnly || !contact) {
            return list;
        }
        return list.filter((e) => emailInvolvesContact(e, contact));
    };

    const recentIn = filterOwn(getInbox()).slice(0, 3);
    const recentOut = filterOwn(getOutbox()).slice(0, 3);
    const unread = filterOwn(getInbox()).filter((e) => !e.read).length;

    const who = contact?.name ? ` for ${contact.name}` : '';
    const scopeNote = settings.injectMailOwnOnly
        ? `Only this character's mail is listed${who}. Other members' private mail is not shared.`
        : 'All mail in this chat is listed (shared memory).';

    const summarize = (list, label) => {
        if (!list.length) {
            return `${label}: (none)`;
        }
        return `${label}:\n` + list.map((e) => {
            const preview = e.body.replace(/\s+/g, ' ').slice(0, 120);
            return `- [${e.read ? 'read' : 'NEW'}] From ${e.from} → ${e.to} | ${e.subject}: ${preview}`;
        }).join('\n');
    };

    return [
        '[Phone Trigger — E-mail]',
        `The user (${persona}) has a Phone Trigger handset with an e-mail app.`,
        scopeNote,
        'E-mails are short personal messages — dialogue, not narration or stage directions.',
        'To send mail you may either:',
        '1) Call the send_email function tool, OR',
        '2) Include a tag in your reply (removed from chat and delivered to the phone):',
        '<email subject="Subject here" replies="optional|tap|phrases">Message body here</email>',
        'Do not narrate that you are sending mail; just send it when it fits.',
        `Unread inbox count${who}: ${unread}`,
        summarize(recentIn, 'Recent inbox'),
        summarize(recentOut, 'Recent outbox (from user)'),
    ].join('\n');
}

/**
 * @param {import('./store.js').MailContact | { key?: string, name?: string } | null} [forContact]
 */
export function updateMailPrompt(forContact = null) {
    const ctx = getContext();
    if (typeof ctx.setExtensionPrompt !== 'function') {
        return;
    }
    const settings = getSettings();
    const value = settings.enabled && settings.injectPrompt ? buildMailSystemPrompt(forContact) : '';
    // position 1 = in-chat, depth 0 = after latest message (common ST convention)
    try {
        ctx.setExtensionPrompt(PROMPT_KEY, value, 1, 0);
    } catch (err) {
        // Fallback signature variants across ST versions
        try {
            ctx.setExtensionPrompt(PROMPT_KEY, value, ctx.extension_prompt_types?.IN_CHAT ?? 1, 0);
        } catch (err2) {
            console.warn('[Phone Trigger] setExtensionPrompt failed:', err2);
        }
    }
}

/**
 * Best-effort resolve of who is about to speak (for per-character mail injection).
 * @param {any} [hint]
 */
export function resolveSpeakingContact(hint) {
    if (hint && typeof hint === 'object') {
        const key = hint.characterKey || hint.avatar || hint.key;
        const name = hint.name || hint.character_name || hint.characterName;
        const resolved = resolveMailContact(key) || resolveMailContact(name);
        if (resolved) {
            return resolved;
        }
    }
    if (typeof hint === 'string' || typeof hint === 'number') {
        const resolved = resolveMailContact(hint);
        if (resolved) {
            return resolved;
        }
    }
    return resolveMailContact(getActiveCharacterKey())
        || resolveMailContact(getActiveCharacterName())
        || listMailContacts().find((c) => c.isActive)
        || null;
}

export function registerEmailTool() {
    const ctx = getContext();
    if (typeof ctx.registerFunctionTool !== 'function') {
        console.warn('[Phone Trigger] registerFunctionTool unavailable');
        return;
    }

    try {
        ctx.registerFunctionTool({
            name: 'send_email',
            displayName: 'Send E-mail',
            description:
                'Send a short dialogue-focused e-mail to the user\'s phone inbox. Use for personal messages, not narration.',
            parameters: {
                $schema: 'http://json-schema.org/draft-04/schema#',
                type: 'object',
                properties: {
                    subject: {
                        type: 'string',
                        description: 'E-mail subject line',
                    },
                    body: {
                        type: 'string',
                        description: 'E-mail body — dialogue style, no prose narration',
                    },
                    from: {
                        type: 'string',
                        description: 'Optional sender display name (defaults to current character)',
                    },
                    replies: {
                        type: 'string',
                        description: 'Optional pipe-separated reply phrases the user can tap, e.g. "Upa|Mayushii|Okabe"',
                    },
                },
                required: ['subject', 'body'],
            },
            action: async ({ subject, body, from, replies }) => {
                const replyOptions = replies
                    ? String(replies).split('|').map((s) => s.trim()).filter(Boolean)
                    : undefined;
                const email = await receiveEmail({
                    from,
                    subject,
                    body,
                    replyOptions,
                });
                return JSON.stringify({
                    ok: true,
                    id: email.id,
                    delivered: true,
                    message: `E-mail "${email.subject}" delivered to phone inbox.`,
                });
            },
            formatMessage: ({ subject }) => `Sending e-mail: ${subject || '...'}`,
            shouldRegister: () => getSettings().enabled,
        });
    } catch (err) {
        console.warn('[Phone Trigger] Could not register send_email tool:', err);
    }
}

/**
 * Process a character message for embedded email tags.
 * Mutates the chat message text if tags are found.
 * @param {number} messageId
 */
export async function ingestEmailsFromMessage(messageId) {
    const ctx = getContext();
    const msg = ctx.chat?.[messageId];
    if (!msg || msg.is_user) {
        return;
    }
    const { cleaned, emails } = extractEmailTags(msg.mes || '');
    if (!emails.length) {
        return;
    }
    msg.mes = cleaned;
    for (const em of emails) {
        await receiveEmail({
            from: em.from || msg.name || getActiveCharacterName(),
            subject: em.subject,
            body: em.body,
            replyOptions: em.replyOptions,
        });
    }
}
