import { EXTENSION_FOLDER } from './constants.js';
import { getContext } from './settings.js';
import { META_KEY, LEGACY_META_KEY } from './constants.js';

/** Exact display name — non-negotiable. */
export const PHONEWAVE_NAME = 'PhoneWave (name subject to change)';
export const PHONEWAVE_KEY = 'phonewave-nstc';

export const WORLDLINE_PROMPT_KEY = 'phone_trigger_worldline';

/**
 * @returns {import('./store.js').MailContact}
 */
export function getPhoneWaveContact() {
    return {
        key: PHONEWAVE_KEY,
        name: PHONEWAVE_NAME,
        isActive: false,
        description: 'Special transmission channel. Mail sent here becomes a D-Mail.',
        personality: '',
        scenario: '',
    };
}

/**
 * @param {string} [keyOrName]
 */
export function isPhoneWaveContact(keyOrName) {
    const s = String(keyOrName || '').trim();
    if (!s) {
        return false;
    }
    if (s === PHONEWAVE_KEY || s === PHONEWAVE_NAME) {
        return true;
    }
    return s.toLowerCase() === PHONEWAVE_NAME.toLowerCase();
}

function getMeta() {
    const { chatMetadata } = getContext();
    if (!chatMetadata[META_KEY] && chatMetadata[LEGACY_META_KEY]) {
        chatMetadata[META_KEY] = chatMetadata[LEGACY_META_KEY];
    }
    if (!chatMetadata[META_KEY]) {
        chatMetadata[META_KEY] = { emails: [], memorySelections: {}, dmails: [], worldlineFacts: [], version: 3 };
    }
    if (!Array.isArray(chatMetadata[META_KEY].dmails)) {
        chatMetadata[META_KEY].dmails = [];
    }
    if (!Array.isArray(chatMetadata[META_KEY].worldlineFacts)) {
        chatMetadata[META_KEY].worldlineFacts = [];
    }
    return chatMetadata[META_KEY];
}

async function persist() {
    const { saveMetadata } = getContext();
    if (typeof saveMetadata === 'function') {
        await saveMetadata();
    }
}

/**
 * @param {{ subject: string, body: string, id?: string }} mail
 * @param {string} [fact]
 */
export async function recordDmail(mail, fact) {
    const meta = getMeta();
    const entry = {
        id: mail.id || `dmail_${Date.now().toString(36)}`,
        subject: String(mail.subject || '').trim() || '(no subject)',
        body: String(mail.body || '').trim(),
        fact: String(fact || mail.body || '').trim(),
        timestamp: Date.now(),
    };
    meta.dmails.unshift(entry);
    if (entry.fact) {
        meta.worldlineFacts.unshift({
            id: `wl_${entry.id}`,
            text: entry.fact,
            dmailId: entry.id,
            timestamp: entry.timestamp,
        });
    }
    await persist();
    return entry;
}

export function getWorldlineFacts() {
    return [...(getMeta().worldlineFacts || [])];
}

export function getDmails() {
    return [...(getMeta().dmails || [])];
}

/**
 * Prompt block for current worldline state (chat inject).
 */
export function buildWorldlinePrompt() {
    const facts = getWorldlineFacts().slice(0, 12);
    if (!facts.length) {
        return '';
    }
    const lines = facts.map((f, i) => `${i + 1}. ${f.text}`);
    return [
        '[Phone Trigger — Worldline]',
        'A D-Mail was sent to the past. Treat the following as true on the current worldline.',
        'Do not narrate reading a system prompt. Characters simply live in a world where these hold.',
        'Do not invent Reading Steiner or other lab jargon unless the chat already established it.',
        '',
        ...lines,
    ].join('\n');
}

export function updateWorldlinePrompt() {
    const ctx = getContext();
    if (typeof ctx.setExtensionPrompt !== 'function') {
        return;
    }
    const value = buildWorldlinePrompt();
    try {
        ctx.setExtensionPrompt(WORLDLINE_PROMPT_KEY, value, 1, 0);
    } catch {
        try {
            ctx.setExtensionPrompt(WORLDLINE_PROMPT_KEY, value, ctx.extension_prompt_types?.IN_CHAT ?? 1, 0);
        } catch (err) {
            console.warn('[Phone Trigger] worldline setExtensionPrompt failed', err);
        }
    }
}

export function dmailVideoUrl() {
    // User-placed clip (lib/vid/divmeter.mp4 on the extension tree)
    return `/${EXTENSION_FOLDER}/lib/vid/divmeter.mp4`;
}

/** Alternate path if the clip is copied under assets/ */
export function dmailVideoUrlFallback() {
    return `/${EXTENSION_FOLDER}/assets/divmeter.mp4`;
}

/**
 * Full-viewport D-Mail / divergence sequence with end distortion.
 * Uses assets/divmeter.mp4 when present; otherwise a CSS meter fallback.
 * @returns {Promise<void>}
 */
export function playDmailSequence() {
    return new Promise((resolve) => {
        const existing = document.getElementById('pp-dmail-fx');
        existing?.remove();

        const root = document.createElement('div');
        root.id = 'pp-dmail-fx';
        root.className = 'pp-dmail-fx';
        root.innerHTML = `
            <video class="pp-dmail-video" id="pp-dmail-video" playsinline preload="auto"></video>
            <div class="pp-dmail-fallback" id="pp-dmail-fallback" hidden>
                <div class="pp-dmail-meter">
                    <div class="pp-dmail-meter-label">DIVERGENCE</div>
                    <div class="pp-dmail-meter-value" id="pp-dmail-meter-value">0.000000</div>
                </div>
            </div>
            <div class="pp-dmail-distort" id="pp-dmail-distort" aria-hidden="true"></div>
            <div class="pp-dmail-flash" id="pp-dmail-flash" aria-hidden="true"></div>
        `;
        document.body.appendChild(root);
        requestAnimationFrame(() => root.classList.add('pp-dmail-on'));

        const video = /** @type {HTMLVideoElement} */ (root.querySelector('#pp-dmail-video'));
        const fallback = root.querySelector('#pp-dmail-fallback');
        const distort = root.querySelector('#pp-dmail-distort');
        const flash = root.querySelector('#pp-dmail-flash');
        let finished = false;
        let distortArmed = false;

        const cleanup = () => {
            if (finished) {
                return;
            }
            finished = true;
            root.classList.add('pp-dmail-out');
            window.setTimeout(() => {
                root.remove();
                resolve();
            }, 520);
        };

        const armDistort = () => {
            if (distortArmed) {
                return;
            }
            distortArmed = true;
            root.classList.add('pp-dmail-distort-on');
            distort?.classList.add('pp-dmail-distort-on');
            flash?.classList.add('pp-dmail-flash-on');
        };

        const startFallback = () => {
            video.style.display = 'none';
            fallback?.removeAttribute('hidden');
            const valueEl = root.querySelector('#pp-dmail-meter-value');
            const start = performance.now();
            const duration = 2800;
            const tick = (now) => {
                const t = Math.min(1, (now - start) / duration);
                const n = (0.3 + t * 0.2 + Math.sin(t * 40) * 0.002).toFixed(6);
                if (valueEl) {
                    valueEl.textContent = n;
                }
                if (t >= 0.72) {
                    armDistort();
                }
                if (t < 1) {
                    requestAnimationFrame(tick);
                } else {
                    cleanup();
                }
            };
            requestAnimationFrame(tick);
        };

        video.src = dmailVideoUrl();
        video.muted = true;

        video.addEventListener('timeupdate', () => {
            if (!Number.isFinite(video.duration) || video.duration <= 0) {
                return;
            }
            const left = video.duration - video.currentTime;
            if (left <= 0.85) {
                armDistort();
            }
        });

        video.addEventListener('ended', () => {
            armDistort();
            window.setTimeout(cleanup, 380);
        });

        let triedFallbackSrc = false;
        video.addEventListener('error', () => {
            if (!triedFallbackSrc) {
                triedFallbackSrc = true;
                video.src = dmailVideoUrlFallback();
                const retry = video.play();
                if (retry && typeof retry.catch === 'function') {
                    retry.catch(() => startFallback());
                }
                return;
            }
            startFallback();
        });

        const playPromise = video.play();
        if (playPromise && typeof playPromise.catch === 'function') {
            playPromise.catch(() => startFallback());
        }

        // Safety timeout if video hangs
        window.setTimeout(() => {
            if (!finished && video.paused && video.readyState < 2) {
                startFallback();
            }
        }, 1200);
        window.setTimeout(() => {
            if (!finished) {
                armDistort();
                cleanup();
            }
        }, 20000);
    });
}

/**
 * Turn a D-Mail body into a short worldline fact (no spoilers, no jargon dump).
 * @param {{ subject: string, body: string }} mail
 * @returns {Promise<string>}
 */
export async function deriveWorldlineFact(mail) {
    const ctx = getContext();
    const prompt = [
        'A character sent a short D-Mail into the past.',
        'Summarize the intended change to reality in ONE or TWO plain sentences.',
        'Write as a worldline fact, present tense, no spoilers, no lecture.',
        'Do not mention D-Mails, microwaves, SERN, or Reading Steiner unless the mail itself does.',
        'Output ONLY the fact text.',
        '',
        `Subject: ${mail.subject}`,
        `Message: ${mail.body}`,
    ].join('\n');

    try {
        if (typeof ctx.generateRaw === 'function') {
            try {
                const raw = await ctx.generateRaw({ prompt, quietToLoud: false });
                if (raw && String(raw).trim()) {
                    return String(raw).trim().replace(/^["']|["']$/g, '').slice(0, 400);
                }
            } catch {
                const raw = await ctx.generateRaw(prompt);
                if (raw && String(raw).trim()) {
                    return String(raw).trim().slice(0, 400);
                }
            }
        }
    } catch (err) {
        console.warn('[Phone Trigger] worldline fact gen failed', err);
    }

    // Deterministic fallback — the mail itself is the directive
    const body = String(mail.body || '').replace(/\s+/g, ' ').trim();
    if (!body) {
        return 'Something small about the past no longer matches what everyone remembered.';
    }
    return `On this worldline: ${body.slice(0, 280)}`;
}
