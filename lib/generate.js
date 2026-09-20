import { DEFAULT_MAIL_REPLY_PROMPT } from './constants.js';
import { getSettings, getContext, toast } from './settings.js';
import { getPersonaName } from './store.js';

/**
 * Build the mail-reply prompt from the editable template + contact card.
 * Independent of the active chat character / main chat history.
 * @param {{ subject: string, body: string, from: string, to: string }} outbound
 * @param {{ name?: string, description?: string, personality?: string, scenario?: string } | null} [character]
 * @returns {string}
 */
export function buildMailReplyPrompt(outbound, character = null) {
    const settings = getSettings();
    const template = String(settings.mailReplyPrompt || '').trim() || DEFAULT_MAIL_REPLY_PROMPT;
    const charName = character?.name || outbound.to || 'Character';
    const userName = outbound.from || getPersonaName();

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
    const charCard = cardParts.join('\n\n');

    /** @type {Record<string, string>} */
    const vars = {
        char: charName,
        char_name: charName,
        user: userName,
        persona: userName,
        subject: String(outbound.subject || ''),
        body: String(outbound.body || ''),
        from: String(outbound.from || userName),
        to: String(outbound.to || charName),
        description,
        personality,
        scenario,
        char_card: charCard,
    };

    return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key) => {
        const k = String(key || '').toLowerCase();
        return Object.prototype.hasOwnProperty.call(vars, k) ? vars[k] : '';
    }).replace(/\n{3,}/g, '\n\n').trim();
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
            'HTTP-Referer': typeof location !== 'undefined' ? location.origin : 'https://github.com/LithiumWaves/Penumbra-Phantasm',
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
