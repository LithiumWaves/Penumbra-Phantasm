import { getSettings, getContext, toast } from './settings.js';

const MAIL_SYSTEM = [
    'You compose short e-mail replies for a Phone Trigger handset.',
    'Write ONLY the e-mail — no narration, no stage directions, no asterisks.',
    'Style: natural dialogue / personal messaging. Keep it concise (2–8 short sentences).',
    'You may optionally end with: REPLIES: option1 | option2 | option3',
].join(' ');

/**
 * @param {string} userPrompt
 * @returns {Promise<string>}
 */
export async function generateMailText(userPrompt) {
    const settings = getSettings();
    if (settings.mailBackend === 'openrouter') {
        return generateViaOpenRouter(userPrompt);
    }
    return generateViaMainApi(userPrompt);
}

async function generateViaMainApi(userPrompt) {
    const ctx = getContext();
    const quietPrompt = `${MAIL_SYSTEM}\n\n${userPrompt}`;

    if (typeof ctx.generateQuietPrompt === 'function') {
        return String(await ctx.generateQuietPrompt({ quietPrompt }) || '');
    }
    if (typeof ctx.generateRaw === 'function') {
        return String(await ctx.generateRaw(quietPrompt) || '');
    }
    throw new Error('Main API generation unavailable');
}

async function generateViaOpenRouter(userPrompt) {
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
                { role: 'system', content: MAIL_SYSTEM },
                { role: 'user', content: userPrompt },
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
