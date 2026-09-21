import { EXTENSION_FOLDER, LEGACY_EXTENSION_FOLDER, WORLDLINE_CARD_START, WORLDLINE_CARD_END } from './constants.js';
import { getContext, getSettings, saveSettings } from './settings.js';
import { META_KEY, LEGACY_META_KEY } from './constants.js';
import { playDmailFxAudio } from './audio.js';

/** Exact display name — non-negotiable. */
export const PHONEWAVE_NAME = 'PhoneWave (name subject to change)';
export const PHONEWAVE_KEY = 'phonewave-nstc';

export const WORLDLINE_PROMPT_KEY = 'phone_trigger_worldline';

/**
 * @returns {{ spectacle: boolean, worldline: boolean, propose: boolean, apply: boolean }}
 */
export function getDmailTiers() {
    const s = getSettings();
    return {
        spectacle: s.dmailSpectacle !== false,
        worldline: s.dmailWorldline !== false,
        propose: s.dmailPropose === true,
        apply: s.dmailApply === true,
    };
}

/**
 * @param {'dmailSpectacle'|'dmailWorldline'|'dmailPropose'|'dmailApply'} key
 * @param {boolean} value
 */
export function setDmailTier(key, value) {
    const s = getSettings();
    s[key] = Boolean(value);
    if (key === 'dmailWorldline') {
        s.injectWorldline = Boolean(value);
        if (!value) {
            clearWorldlinePrompt();
        } else {
            updateWorldlinePrompt();
        }
    }
    saveSettings();
}

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
 * Archive a sent D-Mail. Worldline facts are opt-in via `recordWorldline`
 * (Spectacle-only must not create facts).
 * @param {{ subject: string, body: string, id?: string }} mail
 * @param {string} [fact]
 * @param {{ recordWorldline?: boolean }} [opts]
 */
export async function recordDmail(mail, fact, opts = {}) {
    const meta = getMeta();
    const factText = String(fact || '').trim();
    const entry = {
        id: mail.id || `dmail_${Date.now().toString(36)}`,
        subject: String(mail.subject || '').trim() || '(no subject)',
        body: String(mail.body || '').trim(),
        fact: factText,
        timestamp: Date.now(),
    };
    meta.dmails.unshift(entry);
    if (opts.recordWorldline && factText) {
        meta.worldlineFacts.unshift({
            id: `wl_${entry.id}`,
            text: factText,
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
    const settings = getSettings();
    const depth = Number.isFinite(Number(settings.worldlinePromptDepth))
        ? Math.max(0, Math.floor(Number(settings.worldlinePromptDepth)))
        : 2;
    const value = buildWorldlinePrompt();
    try {
        ctx.setExtensionPrompt(WORLDLINE_PROMPT_KEY, value, 1, depth);
    } catch {
        try {
            ctx.setExtensionPrompt(WORLDLINE_PROMPT_KEY, value, ctx.extension_prompt_types?.IN_CHAT ?? 1, depth);
        } catch (err) {
            console.warn('[Phone Trigger] worldline setExtensionPrompt failed', err);
        }
    }
}

export function clearWorldlinePrompt() {
    const ctx = getContext();
    if (typeof ctx.setExtensionPrompt !== 'function') {
        return;
    }
    try {
        ctx.setExtensionPrompt(WORLDLINE_PROMPT_KEY, '', 1, 0);
    } catch {
        try {
            ctx.setExtensionPrompt(WORLDLINE_PROMPT_KEY, '', ctx.extension_prompt_types?.IN_CHAT ?? 1, 0);
        } catch {
            /* ignore */
        }
    }
}

/**
 * Accept a worldline fact: optional prompt overlay + optional strong Apply.
 * @param {string} fact
 * @param {{ worldline?: boolean, apply?: boolean }} [opts]
 */
export async function acceptWorldlineFact(fact, opts = {}) {
    const tiers = getDmailTiers();
    const doWorldline = opts.worldline ?? tiers.worldline;
    const doApply = opts.apply ?? tiers.apply;
    const text = String(fact || '').trim();
    if (!text) {
        return { worldline: false, applied: false };
    }

    const meta = getMeta();
    const last = meta.worldlineFacts?.[0];
    if (last) {
        if (last.text !== text) {
            last.text = text;
            const linked = meta.dmails?.find((d) => d.id === last.dmailId);
            if (linked) {
                linked.fact = text;
            }
            await persist();
        }
    } else {
        meta.worldlineFacts.unshift({
            id: `wl_${Date.now().toString(36)}`,
            text,
            dmailId: null,
            timestamp: Date.now(),
        });
        await persist();
    }

    if (doWorldline) {
        updateWorldlinePrompt();
    }

    let applied = false;
    if (doApply) {
        applied = await applyWorldlineStrong(text);
    }

    return { worldline: doWorldline, applied };
}

/**
 * Strong Apply: system chat note + sticky character-card worldline block + refreshed overlay.
 * @param {string} fact
 * @returns {Promise<boolean>}
 */
export async function applyWorldlineStrong(fact) {
    const text = String(fact || '').trim();
    if (!text) {
        return false;
    }

    const chatOk = await applyWorldlineToChat(text);
    const cardOk = await applyWorldlineToCharacterCard();
    // Ensure overlay reflects full fact list even if Worldline toggle is off but Apply is on
    updateWorldlinePrompt();
    return chatOk || cardOk;
}

/**
 * Insert a quiet system note into the active chat so the shift lives in history.
 * @param {string} fact
 * @returns {Promise<boolean>}
 */
export async function applyWorldlineToChat(fact) {
    const ctx = getContext();
    const text = String(fact || '').trim();
    if (!text) {
        return false;
    }
    const mes = `[Worldline] ${text}`;

    try {
        if (typeof ctx.sendSystemMessage === 'function') {
            await ctx.sendSystemMessage('generic', mes);
            return true;
        }
    } catch (err) {
        console.warn('[Phone Trigger] sendSystemMessage failed', err);
    }

    try {
        const chat = ctx.chat;
        if (!Array.isArray(chat)) {
            return false;
        }
        const message = {
            name: 'Worldline',
            is_user: false,
            is_system: true,
            send_date: Date.now(),
            mes,
            extra: { type: 'phone_trigger_worldline' },
        };
        chat.push(message);
        if (typeof ctx.addOneMessage === 'function') {
            ctx.addOneMessage(message);
        }
        if (typeof ctx.saveChat === 'function') {
            await ctx.saveChat();
        } else if (typeof ctx.saveChatDebounced === 'function') {
            ctx.saveChatDebounced();
        }
        return true;
    } catch (err) {
        console.warn('[Phone Trigger] applyWorldlineToChat failed', err);
        return false;
    }
}

function stripWorldlineCardBlock(desc) {
    const raw = String(desc || '');
    const re = new RegExp(
        `\\n*${escapeRegExp(WORLDLINE_CARD_START)}[\\s\\S]*?${escapeRegExp(WORLDLINE_CARD_END)}\\n*`,
        'g',
    );
    return raw.replace(re, '\n').trimEnd();
}

function escapeRegExp(s) {
    return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildWorldlineCardBlock() {
    const facts = getWorldlineFacts().slice(0, 12);
    if (!facts.length) {
        return '';
    }
    const lines = facts.map((f, i) => `${i + 1}. ${f.text}`);
    return `\n\n${WORLDLINE_CARD_START}\n${lines.join('\n')}\n${WORLDLINE_CARD_END}`;
}

/**
 * Append / refresh a tagged worldline block on the active character card (in-memory + save if possible).
 * @returns {Promise<boolean>}
 */
export async function applyWorldlineToCharacterCard() {
    const ctx = getContext();
    const characters = ctx.characters || [];
    const index = Number(ctx.characterId);
    if (!Number.isInteger(index) || index < 0 || !characters[index]) {
        return false;
    }
    const block = buildWorldlineCardBlock();
    const ch = characters[index];
    const base = stripWorldlineCardBlock(ch.description || ch.data?.description || '');
    const next = block ? `${base}${block}` : base;

    try {
        if (ch.data && typeof ch.data === 'object') {
            ch.data.description = next;
        }
        ch.description = next;

        if (typeof ctx.writeExtensionField === 'function') {
            // Keep a copy we can clean even if card edits are ephemeral
            await ctx.writeExtensionField(index, 'phone_trigger_worldline_block', block || '');
        }
        if (typeof ctx.saveCharacterDebounced === 'function') {
            ctx.saveCharacterDebounced();
        } else if (typeof ctx.saveCharacter === 'function') {
            await ctx.saveCharacter();
        }
        return true;
    } catch (err) {
        console.warn('[Phone Trigger] applyWorldlineToCharacterCard failed', err);
        return false;
    }
}

/**
 * @param {string} factId
 */
export async function removeWorldlineFact(factId) {
    const meta = getMeta();
    const id = String(factId || '');
    meta.worldlineFacts = (meta.worldlineFacts || []).filter((f) => f.id !== id);
    await persist();
    updateWorldlinePrompt();
    await applyWorldlineToCharacterCard();
}

export async function clearAllWorldlineFacts() {
    const meta = getMeta();
    meta.worldlineFacts = [];
    // Keep dmail archive; only clear live worldline state
    await persist();
    clearWorldlinePrompt();
    await applyWorldlineToCharacterCard();
}

export function dmailVideoUrl() {
    return `/${EXTENSION_FOLDER}/lib/vid/divmeter.mp4`;
}

/** Alternate path if the clip is copied under assets/ */
export function dmailVideoUrlFallback() {
    return `/${EXTENSION_FOLDER}/assets/divmeter.mp4`;
}

export function dmailVideoUrlLegacy() {
    return `/${LEGACY_EXTENSION_FOLDER}/lib/vid/divmeter.mp4`;
}

/**
 * Full-viewport D-Mail / divergence sequence with end distortion.
 * Shown via dialog.showModal() so it sits in the browser top layer
 * (above the phone dialog) — required for mobile visibility.
 * Uses lib/vid/divmeter.mp4 when present; otherwise a CSS meter fallback.
 * @returns {Promise<void>}
 */
export function playDmailSequence() {
    return new Promise((resolve) => {
        const existing = document.getElementById('pp-dmail-fx');
        if (existing) {
            try {
                if (typeof /** @type {HTMLDialogElement} */ (existing).close === 'function'
                    && /** @type {HTMLDialogElement} */ (existing).open) {
                    /** @type {HTMLDialogElement} */ (existing).close();
                }
            } catch (_err) {
                // ignore
            }
            existing.remove();
        }

        /** @type {HTMLDialogElement} */
        const root = document.createElement('dialog');
        root.id = 'pp-dmail-fx';
        root.className = 'pp-dmail-fx';
        root.setAttribute('aria-label', 'Divergence meter');
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

        const wantSound = getSettings().soundEnabled !== false
            && getSettings().dmailSpectacleSound !== false;
        /** @type {(() => void) | null} */
        let stopFxAudio = null;

        const openTopLayer = () => {
            try {
                if (typeof root.showModal === 'function') {
                    root.showModal();
                } else {
                    root.setAttribute('open', '');
                }
            } catch (_err) {
                root.setAttribute('open', '');
            }
            requestAnimationFrame(() => root.classList.add('pp-dmail-on'));
        };
        openTopLayer();

        const video = /** @type {HTMLVideoElement} */ (root.querySelector('#pp-dmail-video'));
        const fallback = root.querySelector('#pp-dmail-fallback');
        const distort = root.querySelector('#pp-dmail-distort');
        const flash = root.querySelector('#pp-dmail-flash');
        let finished = false;
        let distortArmed = false;

        const removeRoot = () => {
            try {
                stopFxAudio?.();
            } catch (_err) {
                // ignore
            }
            stopFxAudio = null;
            try {
                video.pause();
            } catch (_err) {
                // ignore
            }
            try {
                if (root.open && typeof root.close === 'function') {
                    root.close();
                }
            } catch (_err) {
                // ignore
            }
            root.remove();
            resolve();
        };

        const cleanup = () => {
            if (finished) {
                return;
            }
            finished = true;
            root.classList.add('pp-dmail-out');
            window.setTimeout(removeRoot, 520);
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
            // CSS meter has no clip audio — optional synth bed only here.
            if (wantSound && !stopFxAudio) {
                stopFxAudio = playDmailFxAudio(2800) || null;
            }
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
        // Real mp4 audio: start unmuted (Send D-Mail is a user gesture).
        video.muted = !wantSound;
        video.defaultMuted = !wantSound;
        video.playsInline = true;
        video.setAttribute('playsinline', '');
        video.setAttribute('webkit-playsinline', '');
        if (!wantSound) {
            video.setAttribute('muted', '');
        } else {
            video.removeAttribute('muted');
            video.volume = 1;
        }

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

        let triedFallbackSrc = 0;
        let usingCssFallback = false;
        let playAttempted = false;
        let mutedFallbackTried = false;

        const tryPlay = () => {
            if (usingCssFallback || playAttempted) {
                return;
            }
            playAttempted = true;
            // Re-assert unmuted right before play (some browsers reset muted on load).
            if (wantSound) {
                video.muted = false;
                video.removeAttribute('muted');
                video.volume = 1;
            }
            const playPromise = video.play();
            if (playPromise && typeof playPromise.catch === 'function') {
                playPromise.catch((err) => {
                    playAttempted = false;
                    console.debug('[Phone Trigger] D-Mail video play deferred', err?.name || err);
                    // Last resort: mute video so the picture still plays.
                    if (wantSound && !mutedFallbackTried && !video.muted) {
                        mutedFallbackTried = true;
                        video.muted = true;
                        video.setAttribute('muted', '');
                        window.setTimeout(() => {
                            if (!finished && !usingCssFallback) {
                                tryPlay();
                            }
                        }, 60);
                        return;
                    }
                    window.setTimeout(() => {
                        if (finished || usingCssFallback || playAttempted) {
                            return;
                        }
                        playAttempted = true;
                        const retry = video.play();
                        if (retry && typeof retry.catch === 'function') {
                            retry.catch(() => {
                                playAttempted = false;
                                if (!finished && !usingCssFallback) {
                                    usingCssFallback = true;
                                    startFallback();
                                }
                            });
                        }
                    }, 120);
                });
            }
        };

        video.addEventListener('loadeddata', tryPlay);
        video.addEventListener('canplay', tryPlay);

        video.addEventListener('error', () => {
            if (usingCssFallback) {
                return;
            }
            if (triedFallbackSrc === 0) {
                triedFallbackSrc = 1;
                playAttempted = false;
                video.src = dmailVideoUrlFallback();
                video.load();
                return;
            }
            if (triedFallbackSrc === 1) {
                triedFallbackSrc = 2;
                playAttempted = false;
                video.src = dmailVideoUrlLegacy();
                video.load();
                return;
            }
            usingCssFallback = true;
            startFallback();
        });

        // Kick load; play when data is ready (avoids racing software decode)
        video.load();
        tryPlay();

        window.setTimeout(() => {
            if (!finished && !usingCssFallback && video.readyState < 2) {
                usingCssFallback = true;
                startFallback();
            }
        }, 20000);
        window.setTimeout(() => {
            if (!finished) {
                armDistort();
                cleanup();
            }
        }, 45000);
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
