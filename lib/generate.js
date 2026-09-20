import { getSettings, getContext, toast } from './settings.js';

/**
 * @param {string} userPrompt
 * @param {{ name?: string, description?: string, personality?: string, scenario?: string } | null} [character]
 * @returns {Promise<string>}
 */
export async function generateMailText(userPrompt, character = null) {
    const settings = getSettings();
    const system = buildSystemPrompt(character);
    if (settings.mailBackend === 'openrouter') {
        return generateViaOpenRouter(userPrompt, system);
    }
    return generateViaMainApi(userPrompt, system, character);
}

function buildSystemPrompt(character) {
    const lines = [
        'You compose short e-mail replies for a Phone Trigger handset.',
        'Write ONLY the e-mail — no narration, no stage directions, no asterisks.',
        'Style: natural dialogue / personal messaging. Keep it concise (2–8 short sentences).',
        'You may optionally end with: REPLIES: option1 | option2 | option3',
    ];
    if (character?.name) {
        lines.push(`You are ${character.name}, writing from their phone.`);
        if (character.description) {
            lines.push(`Character description:\n${character.description}`);
        }
        if (character.personality) {
            lines.push(`Personality:\n${character.personality}`);
        }
        if (character.scenario) {
            lines.push(`Scenario:\n${character.scenario}`);
        }
        lines.push(`Stay in character as ${character.name}.`);
    }
    return lines.join('\n\n');
}

async function generateViaMainApi(userPrompt, system, character) {
    const ctx = getContext();
    const quietPrompt = [
        system,
        character?.name
            ? `Important: reply strictly as ${character.name}, even if the active chat character differs.`
            : '',
        userPrompt,
    ].filter(Boolean).join('\n\n');

    if (typeof ctx.generateQuietPrompt === 'function') {
        return String(await ctx.generateQuietPrompt({ quietPrompt }) || '');
    }
    if (typeof ctx.generateRaw === 'function') {
        return String(await ctx.generateRaw(quietPrompt) || '');
    }
    throw new Error('Main API generation unavailable');
}

async function generateViaOpenRouter(userPrompt, system) {
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
                { role: 'system', content: system },
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
