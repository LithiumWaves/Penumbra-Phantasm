import { DEFAULT_MAIL_REPLY_PROMPT, DEFAULT_MAIL_FORCE_PROMPT, DEFAULT_MAIL_INITIATIVE_PROMPT } from './constants.js';
import { getSettings, getContext, toast } from './settings.js';
import { getPersonaName } from './store.js';

/**
 * Recent chat lines for optional mail-prompt story awareness.
 * @param {number} [limit]
 * @returns {string}
 */
export function buildChatSummary(limit) {
    const settings = getSettings();
    const max = Number.isFinite(limit) ? limit : Number(settings.chatSummaryMessages);
    const n = Number.isFinite(max) && max > 0 ? Math.min(Math.floor(max), 40) : 12;
    const ctx = getContext();
    const chat = Array.isArray(ctx.chat) ? ctx.chat : [];
    if (!chat.length) {
        return '';
    }

    const persona = getPersonaName();
    const slice = chat.slice(-n);
    const lines = [];
    for (const msg of slice) {
        if (!msg || msg.is_system) {
            continue;
        }
        const name = msg.name || (msg.is_user ? persona : 'Character');
        const text = String(msg.mes || '')
            .replace(/<email\b[^>]*>[\s\S]*?<\/email>/gi, ' ')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, 220);
        if (!text) {
            continue;
        }
        lines.push(`${name}: ${text}`);
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
    const settings = getSettings();
    if (!settings.injectChatIntoMail) {
        return '';
    }
    const raw = buildChatSummary();
    if (!raw) {
        return '';
    }
    return [
        'Recent story / chat context (for awareness only — do not narrate this; write an e-mail):',
        raw,
    ].join('\n');
}

/**
 * @param {string} template
 * @param {Record<string, string>} vars
 * @param {{ appendChatSummary?: boolean, chatSummary?: string }} [opts]
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
    }, {
        appendChatSummary: Boolean(settings.injectChatIntoMail),
        chatSummary,
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
    }, {
        appendChatSummary: Boolean(settings.injectChatIntoMail),
        chatSummary,
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
    }, {
        appendChatSummary: Boolean(settings.injectChatIntoMail),
        chatSummary,
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
 * @param {string} prompt
 */
async function generateViaMainApi(prompt) {
    const ctx = getContext();
    if (typeof ctx.generateRaw !== 'function') {
        throw new Error('Main API generateRaw unavailable');
    }

    // SillyTavern versions differ on generateRaw signatures; try object then positional.
    try {
        const result = await ctx.generateRaw({ prompt, quietToLoud: false });
        if (result != null && String(result).trim()) {
            return String(result);
        }
    } catch (err) {
        console.debug('[Phone Trigger] generateRaw(object) failed, trying positional', err);
    }

    const result = await ctx.generateRaw(prompt);
    return String(result || '');
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
