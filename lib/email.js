import { PROMPT_KEY } from './constants.js';
import { getSettings, getContext, toast } from './settings.js';
import {
    addEmail,
    getActiveCharacterKey,
    getActiveCharacterName,
    getPersonaName,
    resolveMailContact,
    listMailContacts,
    getEmailsForCharacterMemory,
    getMemorySelection,
} from './store.js';
import { playNotification } from './audio.js';
import { buildMailReplyPrompt, buildMailForcePrompt, buildMailInitiativePrompt, generateMailText } from './generate.js';
import { notifyIncomingMail } from './notify.js';
import {
    isPhoneWaveContact,
    deriveWorldlineFact,
    recordDmail,
    updateWorldlinePrompt,
    getDmailTiers,
    acceptWorldlineFact,
} from './dmail.js';

/** @type {((email: import('./store.js').EmailMessage) => void) | null} */
let onMailReceived = null;
/** @type {(() => void) | null} */
let onOpenInbox = null;

/** @type {Map<string, ReturnType<typeof setTimeout>>} */
const pendingReplyTimers = new Map();

export function setMailReceivedHandler(handler) {
    onMailReceived = handler;
}

export function setMailOpenHandler(handler) {
    onOpenInbox = handler;
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
        if (settings.notifyInChat) {
            notifyIncomingMail({
                from: email.from,
                subject: email.subject,
                onOpen: () => {
                    if (typeof onOpenInbox === 'function') {
                        onOpenInbox();
                    }
                },
            });
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
 * Sending to PhoneWave (name subject to change) records a D-Mail and updates the worldline overlay — no AI reply.
 * @param {{
 *   to?: string,
 *   toKey?: string,
 *   subject: string,
 *   body: string,
 *   inReplyTo?: string,
 *   requestReply?: boolean,
 *   dmailContextLines?: string[],
 * }} args
 * @returns {Promise<import('./store.js').EmailMessage & {
 *   isDmail?: boolean,
 *   worldlineFact?: string,
 *   acceptResult?: Awaited<ReturnType<typeof acceptWorldlineFact>>,
 * }>}
 */
export async function sendUserEmail({
    to,
    toKey,
    subject,
    body,
    inReplyTo,
    requestReply = true,
    dmailContextLines,
}) {
    const persona = getPersonaName();
    const contact = resolveMailContact(toKey || to) || {
        key: toKey || to || getActiveCharacterKey(),
        name: to || getActiveCharacterName(),
    };
    const dmail = isPhoneWaveContact(contact.key) || isPhoneWaveContact(contact.name);

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

    if (dmail) {
        // Spectacle = FX only. Facts only when Worldline / Propose / Apply need them.
        const tiers = getDmailTiers();
        const needsFact = tiers.worldline || tiers.propose || tiers.apply;
        let fact = '';
        /** @type {Awaited<ReturnType<typeof acceptWorldlineFact>> | undefined} */
        let acceptResult;
        if (needsFact) {
            const contextLines = Array.isArray(dmailContextLines) ? dmailContextLines : [];
            fact = await deriveWorldlineFact(
                {
                    subject: outbound.subject,
                    body: outbound.body,
                },
                {
                    sender: persona,
                    contextLines,
                },
            );
        }
        // Archive the D-Mail always; only stash a live worldline fact when
        // Worldline/Apply are on and Propose is not deferring acceptance.
        await recordDmail(outbound, fact, {
            recordWorldline: Boolean(fact) && !tiers.propose && (tiers.worldline || tiers.apply),
        });
        if (!tiers.propose && (tiers.worldline || tiers.apply) && fact) {
            acceptResult = await acceptWorldlineFact(fact, tiers);
        }
        return Object.assign(outbound, {
            isDmail: true,
            worldlineFact: fact || undefined,
            acceptResult,
        });
    }

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

/** @type {Map<string, ReturnType<typeof setTimeout>>} */
const pendingForceTimers = new Map();

/** How many guided / initiative force jobs are waiting. */
export function countPendingForceJobs() {
    return pendingForceTimers.size;
}

/**
 * Schedule a guided unsolicited inbound mail from a character (independent of chat).
 * @param {import('./store.js').MailContact | null} contact
 * @param {{ guidance?: string, subject?: string, delay?: boolean }} [opts]
 * @returns {{ jobId: string, delayMs: number }}
 */
export function scheduleForcedCharacterMail(contact, opts = {}) {
    const who = contact || resolveMailContact(null) || listMailContacts()[0];
    if (!who?.name) {
        toast('No character available', 'warning');
        throw new Error('No character available for forced mail');
    }

    const jobId = `force_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
    const delayMs = opts.delay === false ? 0 : pickReplyDelayMs();

    const existing = pendingForceTimers.get(jobId);
    if (existing) {
        clearTimeout(existing);
    }

    const run = () => {
        pendingForceTimers.delete(jobId);
        void requestForcedCharacterMail(who, opts);
    };

    if (delayMs <= 0) {
        run();
    } else {
        const timer = setTimeout(run, delayMs);
        pendingForceTimers.set(jobId, timer);
    }

    return { jobId, delayMs };
}

/**
 * Immediately generate a guided inbound mail from a character.
 * @param {import('./store.js').MailContact | null} contact
 * @param {{ guidance?: string, subject?: string }} [opts]
 */
export async function requestForcedCharacterMail(contact, opts = {}) {
    const who = contact || resolveMailContact(null) || listMailContacts()[0];
    if (!who?.name) {
        toast('No character available', 'warning');
        return null;
    }

    const prompt = buildMailForcePrompt({
        guidance: opts.guidance,
        subject: opts.subject,
    }, who);

    try {
        const raw = await generateMailText(prompt);
        const parsed = parseGeneratedEmail(raw, opts.subject || 'Message');
        if (!parsed.body) {
            toast('Empty mail generated', 'warning');
            return null;
        }
        return await receiveEmail({
            from: who.name,
            subject: parsed.subject,
            body: parsed.body,
            replyOptions: parsed.replyOptions,
            characterKey: who.key,
        });
    } catch (err) {
        console.error('[Phone Trigger] Forced mail generation failed:', err);
        toast(err?.message || 'Failed to generate mail', 'error');
        return null;
    }
}

/**
 * Character-initiative inbound mail (uses initiative prompt / settings).
 * @param {import('./store.js').MailContact | null} contact
 * @param {{ guidance?: string, subject?: string }} [opts]
 */
export async function deliverInitiativeMail(contact, opts = {}) {
    const who = contact || resolveMailContact(null) || listMailContacts().find((c) => !isPhoneWaveContact(c.key));
    if (!who?.name) {
        toast('No character available', 'warning');
        return null;
    }

    const prompt = buildMailInitiativePrompt({
        guidance: opts.guidance,
        subject: opts.subject,
    }, who);

    try {
        const raw = await generateMailText(prompt);
        const parsed = parseGeneratedEmail(raw, opts.subject || 'Message');
        if (!parsed.body) {
            console.warn('[Phone Trigger] Empty initiative mail');
            return null;
        }
        return await receiveEmail({
            from: who.name,
            subject: parsed.subject,
            body: parsed.body,
            replyOptions: parsed.replyOptions,
            characterKey: who.key,
        });
    } catch (err) {
        console.error('[Phone Trigger] Initiative mail generation failed:', err);
        throw err;
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

/**
 * Format one mail for chat-memory injection.
 * @param {import('./store.js').EmailMessage} email
 * @param {string} entryTemplate
 * @param {number} previewLen
 */
function formatMailMemoryEntry(email, entryTemplate, previewLen) {
    const preview = String(email.body || '').replace(/\s+/g, ' ').trim().slice(0, previewLen);
    const vars = {
        status: email.read ? 'read' : 'NEW',
        direction: email.direction === 'in' ? 'in' : 'out',
        from: email.from || '',
        to: email.to || '',
        subject: email.subject || '(no subject)',
        preview,
        body: String(email.body || '').trim(),
        id: email.id || '',
    };
    return String(entryTemplate || '').replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key) => {
        const k = String(key || '').toLowerCase();
        return Object.prototype.hasOwnProperty.call(vars, k) ? vars[k] : '';
    });
}

/**
 * Build per-speaker mail memory for the main chat prompt.
 * Uses the phone Memory picker's manual set when present; otherwise auto to/from (or all).
 * @param {import('./store.js').MailContact | { key?: string, name?: string } | null} [forContact]
 */
export function buildMailSystemPrompt(forContact = null) {
    const settings = getSettings();
    if (!settings.enabled || !settings.injectPrompt) {
        return '';
    }

    const ctx = getContext();
    const scope = settings.mailMemoryScope === 'all' ? 'all' : 'speaker';
    /** @type {import('./store.js').MailContact | { key?: string, name?: string } | null} */
    let contact = forContact;

    if (!contact) {
        contact = resolveSpeakingContact();
    }
    if (scope === 'speaker') {
        if (ctx.groupId && !contact) {
            return '';
        }
        if (!contact) {
            contact = resolveMailContact(getActiveCharacterKey()) || resolveMailContact(getActiveCharacterName());
        }
        if (!contact) {
            return '';
        }
    }

    const max = Math.max(1, Math.min(40, Number(settings.mailMemoryMax) || 6));
    const previewLen = Math.max(20, Math.min(500, Number(settings.mailMemoryPreviewLength) || 140));
    const entryTemplate = String(settings.mailMemoryEntryTemplate || '').trim()
        || '- [{{status}}] {{from}} → {{to}} | {{subject}}: {{preview}}';

    const selected = getEmailsForCharacterMemory(contact, { scope, max: max * 2 });
    const recentIn = selected.filter((e) => e.direction === 'in').slice(0, max);
    const recentOut = selected.filter((e) => e.direction === 'out').slice(0, max);
    const combined = selected.slice(0, max * 2);
    const unread = selected.filter((e) => e.direction === 'in' && !e.read).length;
    const memoryMode = contact?.key ? getMemorySelection(contact.key).mode : 'auto';

    const formatList = (list) => {
        if (!list.length) {
            return '(none)';
        }
        return list.map((e) => formatMailMemoryEntry(e, entryTemplate, previewLen)).join('\n');
    };

    const persona = getPersonaName();
    const charName = contact?.name || getActiveCharacterName() || 'Character';
    const template = String(settings.mailMemoryPrompt || '').trim()
        || [
            '[Phone Trigger — {{char}}\'s mail]',
            '{{inbox}}',
            '{{outbox}}',
        ].join('\n');
    const sendInstructions = String(settings.mailMemorySendInstructions || '').trim();

    /** @type {Record<string, string>} */
    const vars = {
        char: charName,
        char_name: charName,
        user: persona,
        persona,
        inbox: formatList(recentIn),
        outbox: formatList(recentOut),
        mail_list: formatList(combined),
        unread_count: String(unread),
        mail_count: String(selected.length),
        send_instructions: sendInstructions,
        scope: memoryMode === 'manual' ? 'manual' : scope,
        mode: memoryMode,
    };

    return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key) => {
        const k = String(key || '').toLowerCase();
        return Object.prototype.hasOwnProperty.call(vars, k) ? vars[k] : '';
    }).replace(/\n{3,}/g, '\n\n').trim();
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
    const position = Number.isFinite(Number(settings.mailMemoryPromptPosition))
        ? Number(settings.mailMemoryPromptPosition)
        : 1;
    const depth = Number.isFinite(Number(settings.mailMemoryPromptDepth))
        ? Number(settings.mailMemoryPromptDepth)
        : 0;
    try {
        ctx.setExtensionPrompt(PROMPT_KEY, value, position, depth);
    } catch (err) {
        try {
            ctx.setExtensionPrompt(PROMPT_KEY, value, ctx.extension_prompt_types?.IN_CHAT ?? position, depth);
        } catch (err2) {
            console.warn('[Phone Trigger] setExtensionPrompt failed:', err2);
        }
    }
}

/** Last resolved speaker for mail memory (group generations). */
let lastSpeakingContact = null;

/**
 * Best-effort resolve of who is about to speak (for per-character mail injection).
 * @param {any} [hint]
 */
export function resolveSpeakingContact(hint) {
    if (hint && typeof hint === 'object') {
        const key = hint.characterKey || hint.avatar || hint.key || hint.character_avatar;
        const name = hint.name || hint.character_name || hint.characterName || hint.original;
        const resolved = resolveMailContact(key) || resolveMailContact(name);
        if (resolved) {
            lastSpeakingContact = resolved;
            return resolved;
        }
        // Nested payloads some ST versions pass
        if (hint.character) {
            return resolveSpeakingContact(hint.character);
        }
    }
    if (typeof hint === 'string' || typeof hint === 'number') {
        const resolved = resolveMailContact(hint);
        if (resolved) {
            lastSpeakingContact = resolved;
            return resolved;
        }
    }

    const fromActive = resolveMailContact(getActiveCharacterKey())
        || resolveMailContact(getActiveCharacterName())
        || listMailContacts().find((c) => c.isActive)
        || null;
    if (fromActive) {
        lastSpeakingContact = fromActive;
        return fromActive;
    }
    return lastSpeakingContact;
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
