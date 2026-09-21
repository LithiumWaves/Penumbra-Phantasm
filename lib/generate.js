import { DEFAULT_MAIL_REPLY_PROMPT, DEFAULT_MAIL_FORCE_PROMPT, DEFAULT_MAIL_INITIATIVE_PROMPT, DEFAULT_CALL_PROMPT } from './constants.js';
import { getSettings, getContext, toast } from './settings.js';
import { getPersonaName } from './store.js';
import {
    buildGenChatSummaryBlock,
    buildGenMailContextBlock,
    buildGenCallMemoryBlock,
    resolveChatContextLines,
} from './genContext.js';

/**
 * Recent chat lines for optional mail/call-prompt story awareness.
 * Prefers Inject-context picks (mail target). Empty when inject is off.
 * @param {number} [limit]
 * @returns {string}
 */
export function buildChatSummary(limit) {
    const settings = getSettings();
    if (settings.injectChatIntoMail === false) {
        return '';
    }
    const lines = resolveChatContextLines('mail');
    if (Number.isFinite(limit) && limit > 0 && lines.length) {
        return lines.slice(-Math.min(Math.floor(limit), 40)).join('\n');
    }
    return lines.join('\n');
}

/**
 * @param {{ name?: string, description?: string, personality?: string, scenario?: string } | null} character
 * @param {string} charName
 */
function buildCharCard(character, charName) {
    const description = String(character?.description || '').trim();
    const personality = String(character?.personality || '').trim();
    const scenario = String(character?.scenario || '').trim();
    const cardParts = [];
    if (description) {
        cardParts.push(`Character description:\n${description}`);
    }
    if (personality) {
        cardParts.push(`Personality:\n${personality}`);
    }
    if (scenario) {
        cardParts.push(`Scenario:\n${scenario}`);
    }
    if (cardParts.length) {
        cardParts.push(`Stay in character as ${charName}.`);
    }
    return {
        description,
        personality,
        scenario,
        charCard: cardParts.join('\n\n'),
    };
}

function buildChatSummaryBlock() {
    return buildGenChatSummaryBlock('mail');
}

function buildMailExtraBlocks(character = null) {
    return {
        call_memory: buildGenCallMemoryBlock('mail', character),
        mail_context: '',
    };
}

/**
 * @param {string} template
 * @param {Record<string, string>} vars
 * @param {{
 *   appendChatSummary?: boolean,
 *   chatSummary?: string,
 *   appendExtras?: string[],
 * }} [opts]
 */
function applyTemplate(template, vars, opts = {}) {
    let prompt = template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key) => {
        const k = String(key || '').toLowerCase();
        return Object.prototype.hasOwnProperty.call(vars, k) ? vars[k] : '';
    });

    const chatSummary = opts.chatSummary || '';
    if (opts.appendChatSummary && chatSummary && !/\{\{\s*chat_summary\s*\}\}/i.test(template)) {
        if (!prompt.includes(chatSummary)) {
            prompt = `${prompt}\n\n${chatSummary}`;
        }
    }

    for (const key of opts.appendExtras || []) {
        const block = vars[key] || '';
        if (!block) {
            continue;
        }
        const re = new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, 'i');
        if (!re.test(template) && !prompt.includes(block)) {
            prompt = `${prompt}\n\n${block}`;
        }
    }

    return prompt.replace(/\n{3,}/g, '\n\n').trim();
}

/**
 * Build the mail-reply prompt from the editable template + contact card.
 * @param {{ subject: string, body: string, from: string, to: string }} outbound
 * @param {{ name?: string, description?: string, personality?: string, scenario?: string } | null} [character]
 * @returns {string}
 */
export function buildMailReplyPrompt(outbound, character = null) {
    const settings = getSettings();
    const template = String(settings.mailReplyPrompt || '').trim() || DEFAULT_MAIL_REPLY_PROMPT;
    const charName = character?.name || outbound.to || 'Character';
    const userName = outbound.from || getPersonaName();
    const { description, personality, scenario, charCard } = buildCharCard(character, charName);
    const chatSummary = buildChatSummaryBlock();
    const extras = buildMailExtraBlocks(character);

    return applyTemplate(template, {
        char: charName,
        char_name: charName,
        user: userName,
        persona: userName,
        subject: String(outbound.subject || ''),
        body: String(outbound.body || ''),
        from: String(outbound.from || userName),
        to: String(outbound.to || charName),
        guidance: '',
        description,
        personality,
        scenario,
        char_card: charCard,
        chat_summary: chatSummary,
        call_memory: extras.call_memory,
        mail_context: '',
    }, {
        appendChatSummary: Boolean(settings.injectChatIntoMail) && Boolean(chatSummary),
        chatSummary,
        appendExtras: ['call_memory'],
    });
}

/**
 * Build a guided unsolicited / forced inbound mail prompt.
 * @param {{ guidance?: string, subject?: string }} opts
 * @param {{ name?: string, description?: string, personality?: string, scenario?: string } | null} [character]
 * @returns {string}
 */
export function buildMailForcePrompt(opts = {}, character = null) {
    const settings = getSettings();
    const template = String(settings.mailForcePrompt || '').trim() || DEFAULT_MAIL_FORCE_PROMPT;
    const charName = character?.name || 'Character';
    const userName = getPersonaName();
    const guidance = String(opts.guidance || '').trim() || '(No special guidance — write a natural check-in e-mail that fits the current situation.)';
    const subject = String(opts.subject || '').trim();
    const { description, personality, scenario, charCard } = buildCharCard(character, charName);
    const chatSummary = buildChatSummaryBlock();
    const extras = buildMailExtraBlocks(character);

    let prompt = applyTemplate(template, {
        char: charName,
        char_name: charName,
        user: userName,
        persona: userName,
        subject: subject || '(choose a fitting subject)',
        body: '',
        from: charName,
        to: userName,
        guidance,
        description,
        personality,
        scenario,
        char_card: charCard,
        chat_summary: chatSummary,
        call_memory: extras.call_memory,
        mail_context: '',
    }, {
        appendChatSummary: Boolean(settings.injectChatIntoMail) && Boolean(chatSummary),
        chatSummary,
        appendExtras: ['call_memory'],
    });

    // If the custom template omitted {{guidance}}, append steering so it still applies.
    if (String(opts.guidance || '').trim() && !/\{\{\s*guidance\s*\}\}/i.test(template)) {
        const block = `Author guidance (follow this intent; stay in character; do not quote the guidance):\n${guidance}`;
        if (!prompt.includes(guidance)) {
            prompt = `${prompt}\n\n${block}`;
        }
    }

    return prompt.replace(/\n{3,}/g, '\n\n').trim();
}

/**
 * Build character-initiative inbound mail prompt.
 * Uses mailInitiativePrompt, or reuses the forced-mail template when configured.
 * @param {{ guidance?: string, subject?: string }} opts
 * @param {{ name?: string, description?: string, personality?: string, scenario?: string } | null} [character]
 * @returns {string}
 */
export function buildMailInitiativePrompt(opts = {}, character = null) {
    const settings = getSettings();
    if (settings.mailInitiativeUseForcePrompt) {
        return buildMailForcePrompt(opts, character);
    }

    const template = String(settings.mailInitiativePrompt || '').trim() || DEFAULT_MAIL_INITIATIVE_PROMPT;
    const charName = character?.name || 'Character';
    const userName = getPersonaName();
    const guidance = String(opts.guidance || '').trim()
        || '(No special guidance — spontaneously check in about something that fits the current situation.)';
    const subject = String(opts.subject || '').trim();
    const { description, personality, scenario, charCard } = buildCharCard(character, charName);
    const chatSummary = buildChatSummaryBlock();
    const extras = buildMailExtraBlocks(character);

    let prompt = applyTemplate(template, {
        char: charName,
        char_name: charName,
        user: userName,
        persona: userName,
        subject: subject || '(choose a fitting subject)',
        body: '',
        from: charName,
        to: userName,
        guidance,
        description,
        personality,
        scenario,
        char_card: charCard,
        chat_summary: chatSummary,
        call_memory: extras.call_memory,
        mail_context: '',
    }, {
        appendChatSummary: Boolean(settings.injectChatIntoMail) && Boolean(chatSummary),
        chatSummary,
        appendExtras: ['call_memory'],
    });

    if (String(opts.guidance || '').trim() && !/\{\{\s*guidance\s*\}\}/i.test(template)) {
        const block = `Optional mood / topic hint (follow if present; stay in character; do not quote it):\n${guidance}`;
        if (!prompt.includes(guidance)) {
            prompt = `${prompt}\n\n${block}`;
        }
    }

    return prompt.replace(/\n{3,}/g, '\n\n').trim();
}

/**
 * Build a live phone-call reply prompt (handset UI turns).
 * @param {{
 *   turns: Array<{ role: string, text: string }>,
 *   contact: { name?: string, key?: string, description?: string, personality?: string, scenario?: string } | null,
 *   lastUser?: string,
 * }} opts
 * @returns {string}
 */
export function buildCallPrompt(opts = {}) {
    const settings = getSettings();
    const template = String(settings.callPrompt || '').trim() || DEFAULT_CALL_PROMPT;
    const contact = opts.contact || {};
    const charName = contact.name || 'Character';
    const userName = getPersonaName();
    const guidance = String(settings.callGuidance || '').trim()
        || '(No special guidance — stay in character on the call.)';
    const { description, personality, scenario, charCard } = buildCharCard(contact, charName);
    const chatSummary = buildGenChatSummaryBlock('call');
    const mailContext = buildGenMailContextBlock(contact);
    const callMemory = buildGenCallMemoryBlock('call', contact);

    let maxTurns = Number(settings.callContextTurns);
    if (!Number.isFinite(maxTurns) || maxTurns < 2) {
        maxTurns = 16;
    }
    maxTurns = Math.min(40, Math.floor(maxTurns));

    const spoken = (opts.turns || []).filter((t) => t.role === 'user' || t.role === 'char');
    const slice = spoken.slice(-maxTurns);
    const transcript = slice.length
        ? slice.map((t) => {
            const who = t.role === 'user' ? userName : charName;
            return `${who}: ${String(t.text || '').trim()}`;
        }).join('\n')
        : '(Call just connected — no lines yet.)';

    const lastUser = String(opts.lastUser || '').trim()
        || [...spoken].reverse().find((t) => t.role === 'user')?.text
        || '(silence)';

    return applyTemplate(template, {
        char: charName,
        char_name: charName,
        user: userName,
        persona: userName,
        subject: '',
        body: '',
        from: charName,
        to: userName,
        guidance,
        transcript,
        last_user: lastUser,
        description,
        personality,
        scenario,
        char_card: charCard,
        chat_summary: chatSummary,
        mail_context: mailContext,
        call_memory: callMemory,
    }, {
        appendChatSummary: Boolean(settings.injectChatIntoCall !== false) && Boolean(chatSummary),
        chatSummary,
        appendExtras: ['mail_context', 'call_memory'],
    }).replace(/\n{3,}/g, '\n\n').trim();
}

/**
 * Generate a spoken call reply using the configured mode.
 * @param {string} uniquePrompt Full call-template prompt
 * @param {{
 *   contact?: { name?: string, characterIndex?: number } | null,
 *   lastUser?: string,
 *   shortMainPrompt?: string,
 * }} [opts]
 * @returns {Promise<string>}
 */
export async function generateCallText(uniquePrompt, opts = {}) {
    const settings = getSettings();
    const mode = ['unique', 'main', 'both'].includes(settings.callGenerationMode)
        ? settings.callGenerationMode
        : 'unique';

    if (mode === 'unique') {
        return generateMailText(uniquePrompt);
    }

    const quietPrompt = mode === 'both'
        ? uniquePrompt
        : (opts.shortMainPrompt || buildShortCallQuietPrompt(opts));

    const viaChat = await generateViaChatQuiet(quietPrompt, opts.contact);
    if (viaChat && String(viaChat).trim()) {
        return String(viaChat);
    }

    // Fallback if quiet generation unavailable
    console.warn('[Phone Trigger] chat quiet generation empty; falling back to unique call prompt');
    return generateMailText(uniquePrompt);
}

/**
 * @param {{ contact?: { name?: string } | null, lastUser?: string }} opts
 */
function buildShortCallQuietPrompt(opts = {}) {
    const charName = opts.contact?.name || 'Character';
    const userName = getPersonaName();
    const last = String(opts.lastUser || '').trim() || '(silence on the line)';
    return [
        `You are ${charName} on a live phone call with ${userName}.`,
        'Reply with ONLY what you say aloud on the phone — no narration, no asterisks, no quotes around the whole line.',
        'Keep it to 1–4 short spoken sentences.',
        '',
        `${userName} just said:`,
        last,
        '',
        `Speak now as ${charName}:`,
    ].join('\n');
}

/**
 * Use SillyTavern chat completion presets / context via generateQuietPrompt.
 * @param {string} quietPrompt
 * @param {{ name?: string, characterIndex?: number } | null} [contact]
 * @returns {Promise<string>}
 */
async function generateViaChatQuiet(quietPrompt, contact = null) {
    const ctx = getContext();
    const prompt = String(quietPrompt || '').trim();
    if (!prompt) {
        return '';
    }

    const forceChId = Number.isFinite(Number(contact?.characterIndex))
        ? Number(contact.characterIndex)
        : null;

    if (typeof ctx.generateQuietPrompt === 'function') {
        try {
            // Modern object form
            const result = await ctx.generateQuietPrompt({
                quietPrompt: prompt,
                quietToLoud: false,
                forceChId,
            });
            if (result != null && String(result).trim()) {
                return String(result);
            }
        } catch (err) {
            console.debug('[Phone Trigger] generateQuietPrompt(object) failed, trying positional', err);
        }
        try {
            // Legacy positional: (quietPrompt, quietToLoud, skipWIAN, ...)
            const result = await ctx.generateQuietPrompt(prompt, false, false);
            if (result != null && String(result).trim()) {
                return String(result);
            }
        } catch (err) {
            console.debug('[Phone Trigger] generateQuietPrompt(positional) failed', err);
        }
    }

    return '';
}

/**
 * Generate a mail reply without using the main chat pipeline / active character.
 * @param {string} prompt
 * @returns {Promise<string>}
 */
export async function generateMailText(prompt) {
    const settings = getSettings();
    if (settings.mailBackend === 'openrouter') {
        return generateViaOpenRouter(prompt);
    }
    return generateViaMainApi(prompt);
}

/**
 * Main SillyTavern API — raw completion only (no quiet/chat character binding).
 * Retries once when the generation queue reports busy (common during force-initiative).
 * @param {string} prompt
 */
async function generateViaMainApi(prompt) {
    const ctx = getContext();
    if (typeof ctx.generateRaw !== 'function') {
        throw new Error('Main API generateRaw unavailable');
    }

    const tryOnce = async () => {
        try {
            const result = await ctx.generateRaw({ prompt, quietToLoud: false });
            if (result != null && String(result).trim()) {
                return String(result);
            }
        } catch (err) {
            console.debug('[Phone Trigger] generateRaw(object) failed, trying positional', err);
            const msg = String(err?.message || err || '');
            if (/busy|queue/i.test(msg)) {
                throw err;
            }
        }
        const result = await ctx.generateRaw(prompt);
        return String(result || '');
    };

    try {
        return await tryOnce();
    } catch (err) {
        const msg = String(err?.message || err || '');
        if (!/busy|queue/i.test(msg)) {
            throw err;
        }
        // Wait briefly for the chat generation lock to clear, then retry once.
        await new Promise((r) => setTimeout(r, 1200));
        try {
            return await tryOnce();
        } catch (err2) {
            const msg2 = String(err2?.message || err2 || '');
            if (/busy|queue/i.test(msg2) && typeof ctx.generateQuietPrompt === 'function') {
                // Last resort: quiet channel (may still bind character — better than failing force).
                try {
                    const quiet = await ctx.generateQuietPrompt(prompt, false, false);
                    if (quiet && String(quiet).trim()) {
                        return String(quiet).trim();
                    }
                } catch (err3) {
                    console.debug('[Phone Trigger] quiet fallback after busy failed', err3);
                }
            }
            throw err2;
        }
    }
}

/**
 * OpenRouter chat completions — fully independent of SillyTavern chat.
 * @param {string} prompt
 */
async function generateViaOpenRouter(prompt) {
    const settings = getSettings();
    const apiKey = String(settings.openRouterApiKey || '').trim();
    const model = String(settings.openRouterModel || '').trim() || 'openai/gpt-4o-mini';

    if (!apiKey) {
        toast('OpenRouter API key missing', 'error');
        throw new Error('OpenRouter API key missing');
    }

    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': typeof location !== 'undefined' ? location.origin : 'https://github.com/LithiumWaves/Phone-Trigger',
            'X-Title': 'Phone Trigger',
        },
        body: JSON.stringify({
            model,
            temperature: 0.8,
            messages: [
                {
                    role: 'system',
                    content: 'You write short in-character e-mail replies. Output only the e-mail in the requested format.',
                },
                { role: 'user', content: prompt },
            ],
        }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
        const msg = data?.error?.message || data?.message || `HTTP ${res.status}`;
        throw new Error(`OpenRouter: ${msg}`);
    }

    const content = data?.choices?.[0]?.message?.content;
    if (!content) {
        throw new Error('OpenRouter returned an empty response');
    }
    return String(content);
}
