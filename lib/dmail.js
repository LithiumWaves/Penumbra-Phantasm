import {
    EXTENSION_FOLDER,
    LEGACY_EXTENSION_FOLDER,
    WORLDLINE_CARD_START,
    WORLDLINE_CARD_END,
    WORLDLINE_LOREBOOK_NAME,
    WORLDLINE_LOREBOOK_COMMENT,
    META_KEY,
    LEGACY_META_KEY,
} from './constants.js';
import { getContext, getSettings, saveSettings } from './settings.js';
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
 * Accept a worldline fact: optional soft prompt inject + optional hard Apply (lorebook).
 * Character-card writes are never automatic — callers show a confirm screen using `cardPreview`.
 * @param {string} fact
 * @param {{ worldline?: boolean, apply?: boolean }} [opts]
 * @returns {Promise<{
 *   worldline: boolean,
 *   lorebook: boolean,
 *   applied: boolean,
 *   cardPreview: { characterName: string, block: string, next: string, base: string } | null,
 * }>}
 */
export async function acceptWorldlineFact(fact, opts = {}) {
    const tiers = getDmailTiers();
    const doWorldline = opts.worldline ?? tiers.worldline;
    const doApply = opts.apply ?? tiers.apply;
    const text = String(fact || '').trim();
    if (!text) {
        return { worldline: false, lorebook: false, applied: false, cardPreview: null };
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

    let lorebook = false;
    /** @type {{ characterName: string, block: string, next: string, base: string } | null} */
    let cardPreview = null;
    if (doApply) {
        lorebook = await applyWorldlineToLorebook();
        // Keep soft overlay in sync even when only Apply is on
        updateWorldlinePrompt();
        cardPreview = previewWorldlineCharacterCard();
    }

    return {
        worldline: doWorldline,
        lorebook,
        applied: lorebook,
        cardPreview,
    };
}

/**
 * Strong Apply: lorebook write + character-card preview (card confirm is separate).
 * Does not paste into chat history.
 * @param {string} [_fact]
 * @returns {Promise<boolean>}
 */
export async function applyWorldlineStrong(_fact) {
    const loreOk = await applyWorldlineToLorebook();
    updateWorldlinePrompt();
    return loreOk;
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

function buildWorldlineLoreContent() {
    const facts = getWorldlineFacts().slice(0, 12);
    if (!facts.length) {
        return '';
    }
    const lines = facts.map((f, i) => `${i + 1}. ${f.text}`);
    return [
        'Worldline state (from D-Mail). Treat as true for this chat.',
        'Do not narrate reading a lorebook. Characters simply live where these hold.',
        '',
        ...lines,
    ].join('\n');
}

/**
 * Preview the character-card description that Apply would write (no save).
 * @returns {{ characterName: string, block: string, next: string, base: string } | null}
 */
export function previewWorldlineCharacterCard() {
    const ctx = getContext();
    const characters = ctx.characters || [];
    const index = Number(ctx.characterId);
    if (!Number.isInteger(index) || index < 0 || !characters[index]) {
        return null;
    }
    const ch = characters[index];
    const block = buildWorldlineCardBlock();
    const base = stripWorldlineCardBlock(ch.description || ch.data?.description || '');
    const next = block ? `${base}${block}` : base;
    return {
        characterName: String(ch.name || ch.data?.name || 'Character'),
        block,
        next,
        base,
    };
}

/**
 * Append / refresh a tagged worldline block on the active character card (in-memory + save if possible).
 * Call only after the user confirms the card preview screen.
 * @returns {Promise<boolean>}
 */
export async function applyWorldlineToCharacterCard() {
    const ctx = getContext();
    const characters = ctx.characters || [];
    const index = Number(ctx.characterId);
    if (!Number.isInteger(index) || index < 0 || !characters[index]) {
        return false;
    }
    const preview = previewWorldlineCharacterCard();
    if (!preview) {
        return false;
    }
    const ch = characters[index];
    const next = preview.next;
    const block = preview.block;

    try {
        if (ch.data && typeof ch.data === 'object') {
            ch.data.description = next;
        }
        ch.description = next;

        if (typeof ctx.writeExtensionField === 'function') {
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
 * Ensure the Phone Trigger Worldline lorebook exists and return its data.
 * @returns {Promise<{ name: string, data: { entries: Record<string|number, any> } } | null>}
 */
async function ensureWorldlineLorebook() {
    const ctx = getContext();
    if (typeof ctx.loadWorldInfo !== 'function' || typeof ctx.saveWorldInfo !== 'function') {
        console.warn('[Phone Trigger] World Info API unavailable — cannot write lorebook');
        return null;
    }

    const name = WORLDLINE_LOREBOOK_NAME;
    let data = await ctx.loadWorldInfo(name);
    if (!data) {
        try {
            if (typeof ctx.createWorldBook === 'function') {
                await ctx.createWorldBook(name, { interactive: false });
            } else if (typeof ctx.createNewWorldInfo === 'function') {
                await ctx.createNewWorldInfo(name);
            }
        } catch (err) {
            console.warn('[Phone Trigger] create lorebook failed', err);
        }
        data = await ctx.loadWorldInfo(name);
        if (!data) {
            data = { entries: {} };
            try {
                await ctx.saveWorldInfo(name, data, true);
                if (typeof ctx.updateWorldInfoList === 'function') {
                    await ctx.updateWorldInfoList();
                }
                data = (await ctx.loadWorldInfo(name)) || data;
            } catch (err) {
                console.warn('[Phone Trigger] seed lorebook failed', err);
                return null;
            }
        }
    }
    if (!data.entries || typeof data.entries !== 'object') {
        data.entries = {};
    }
    return { name, data };
}

/**
 * Bind the worldline lorebook to the current chat (or global selection as fallback).
 * @param {string} name
 */
async function bindWorldlineLorebook(name) {
    const ctx = getContext();
    try {
        if (ctx.chatWorldInfo && typeof ctx.chatWorldInfo.setSelection === 'function') {
            const current = typeof ctx.chatWorldInfo.getNames === 'function'
                ? ctx.chatWorldInfo.getNames()
                : [];
            const list = Array.isArray(current) ? [...current] : [];
            if (!list.includes(name)) {
                list.push(name);
                ctx.chatWorldInfo.setSelection(list);
                if (typeof ctx.saveMetadata === 'function') {
                    await ctx.saveMetadata();
                } else if (typeof ctx.saveMetadataDebounced === 'function') {
                    ctx.saveMetadataDebounced();
                }
            }
            return;
        }
    } catch (err) {
        console.warn('[Phone Trigger] chatWorldInfo bind failed', err);
    }

    try {
        if (ctx.worldInfoEntry && typeof ctx.worldInfoEntry.setGlobalSelection === 'function') {
            await ctx.worldInfoEntry.setGlobalSelection(name, true);
        }
    } catch (err) {
        console.warn('[Phone Trigger] global WI bind failed', err);
    }
}

/**
 * Create or update the always-on worldline lorebook entry from current facts.
 * @returns {Promise<boolean>}
 */
export async function applyWorldlineToLorebook() {
    const ensured = await ensureWorldlineLorebook();
    if (!ensured) {
        return false;
    }
    const { name, data } = ensured;
    const ctx = getContext();
    const content = buildWorldlineLoreContent();
    const facts = getWorldlineFacts();

    /** @type {any} */
    let entry = Object.values(data.entries).find(
        (e) => e
            && (e.comment === WORLDLINE_LOREBOOK_COMMENT
                || (Array.isArray(e.key) && e.key.includes('phone_trigger_worldline'))),
    );

    if (!entry) {
        try {
            if (ctx.worldInfoEntry && typeof ctx.worldInfoEntry.create === 'function') {
                entry = ctx.worldInfoEntry.create(name, data);
            } else if (typeof ctx.createWorldInfoEntry === 'function') {
                entry = ctx.createWorldInfoEntry(name, data);
            }
        } catch (err) {
            console.warn('[Phone Trigger] create WI entry helper failed', err);
        }
    }

    if (!entry) {
        const uids = Object.keys(data.entries).map(Number).filter((n) => Number.isFinite(n));
        const uid = (uids.length ? Math.max(...uids) : -1) + 1;
        entry = {
            uid,
            key: ['phone_trigger_worldline'],
            keysecondary: [],
            comment: WORLDLINE_LOREBOOK_COMMENT,
            content: '',
            constant: true,
            selective: false,
            selectiveLogic: 0,
            addMemo: false,
            order: 100,
            position: 0,
            disable: false,
            excludeRecursion: false,
            probability: 100,
            useProbability: true,
            depth: 4,
            group: '',
            groupOverride: false,
            groupWeight: 100,
            scanDepth: null,
            caseSensitive: null,
            matchWholeWords: null,
            useGroupScoring: false,
            automationId: '',
            role: null,
            vectorized: false,
            displayIndex: uid,
        };
        data.entries[uid] = entry;
    }

    entry.comment = WORLDLINE_LOREBOOK_COMMENT;
    entry.key = Array.isArray(entry.key) && entry.key.length
        ? entry.key
        : ['phone_trigger_worldline'];
    if (!entry.key.includes('phone_trigger_worldline')) {
        entry.key = [...entry.key, 'phone_trigger_worldline'];
    }
    entry.content = content;
    entry.constant = true;
    entry.disable = !facts.length || !content;
    entry.selective = false;
    entry.probability = 100;
    entry.useProbability = true;
    if (entry.order == null) {
        entry.order = 100;
    }
    if (entry.position == null) {
        entry.position = 0;
    }

    try {
        await ctx.saveWorldInfo(name, data, true, { refreshEditor: true });
        if (typeof ctx.updateWorldInfoList === 'function') {
            await ctx.updateWorldInfoList();
        }
        if (typeof ctx.reloadWorldInfoEditor === 'function') {
            try {
                ctx.reloadWorldInfoEditor(name, true);
            } catch {
                /* ignore */
            }
        }
        await bindWorldlineLorebook(name);
        return true;
    } catch (err) {
        console.warn('[Phone Trigger] applyWorldlineToLorebook failed', err);
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
    await applyWorldlineToLorebook();
    // Refresh card only if a previous Apply already wrote the tagged block
    const ctx = getContext();
    const ch = ctx.characters?.[Number(ctx.characterId)];
    const live = String(ch?.description || ch?.data?.description || '');
    if (live.includes(WORLDLINE_CARD_START)) {
        await applyWorldlineToCharacterCard();
    }
}

export async function clearAllWorldlineFacts() {
    const meta = getMeta();
    meta.worldlineFacts = [];
    // Keep dmail archive; only clear live worldline state
    await persist();
    clearWorldlinePrompt();
    await applyWorldlineToLorebook();
    // Strip card block if present (user clearing worldline intends a clean slate)
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
 * Recent non-system chat lines the user can attach as D-Mail derive context.
 * @param {number} [limit]
 * @returns {Array<{ id: string, name: string, text: string, index: number }>}
 */
export function listDmailChatContext(limit = 24) {
    const ctx = getContext();
    const chat = Array.isArray(ctx.chat) ? ctx.chat : [];
    const persona = String(ctx.name1 || ctx.user?.name || 'User');
    const max = Number.isFinite(limit) && limit > 0 ? Math.min(Math.floor(limit), 40) : 24;
    /** @type {Array<{ id: string, name: string, text: string, index: number }>} */
    const out = [];
    for (let i = chat.length - 1; i >= 0 && out.length < max; i--) {
        const msg = chat[i];
        if (!msg || msg.is_system) {
            continue;
        }
        const text = String(msg.mes || '')
            .replace(/<email\b[^>]*>[\s\S]*?<\/email>/gi, ' ')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, 220);
        if (!text) {
            continue;
        }
        const name = msg.name || (msg.is_user ? persona : 'Character');
        out.push({
            id: `chat_${i}`,
            index: i,
            name,
            text,
        });
    }
    return out.reverse();
}

/**
 * Names of people on this chat (persona + active character / group members).
 * @returns {string[]}
 */
export function listDmailParticipants() {
    const ctx = getContext();
    const names = new Set();
    const persona = String(ctx.name1 || ctx.user?.name || '').trim();
    if (persona) {
        names.add(persona);
    }
    const characters = ctx.characters || [];
    if (ctx.groupId && Array.isArray(ctx.groups)) {
        const group = ctx.groups.find((g) => g?.id === ctx.groupId) || ctx.groups.find((g) => String(g?.id) === String(ctx.groupId));
        const members = group?.members || [];
        for (const memberId of members) {
            const needle = String(memberId ?? '');
            const ch = characters.find((c) => c?.avatar === needle || c?.name === needle)
                || (Number.isInteger(Number(needle)) ? characters[Number(needle)] : null);
            const n = String(ch?.name || '').trim();
            if (n) {
                names.add(n);
            }
        }
    } else {
        const ch = characters[ctx.characterId];
        const n = String(ch?.name || ctx.name2 || '').trim();
        if (n) {
            names.add(n);
        }
    }
    return [...names];
}

/**
 * Turn a D-Mail into a short worldline fact (sender, participants, optional chat context).
 * @param {{ subject: string, body: string }} mail
 * @param {{
 *   sender?: string,
 *   participants?: string[],
 *   contextLines?: string[],
 * }} [opts]
 * @returns {Promise<string>}
 */
export async function deriveWorldlineFact(mail, opts = {}) {
    const ctx = getContext();
    const sender = String(
        opts.sender || ctx.name1 || ctx.user?.name || 'User',
    ).trim() || 'User';
    const participants = Array.isArray(opts.participants) && opts.participants.length
        ? opts.participants.map((p) => String(p).trim()).filter(Boolean)
        : listDmailParticipants();
    const contextLines = Array.isArray(opts.contextLines)
        ? opts.contextLines.map((l) => String(l).trim()).filter(Boolean).slice(0, 24)
        : [];

    const prompt = [
        'A person is sending a short D-Mail into the past to change the worldline.',
        `Sender (who is transmitting the D-Mail): ${sender}`,
        participants.length
            ? `Chat participants who exist on this worldline: ${participants.join(', ')}`
            : 'Chat participants: (unknown)',
        contextLines.length
            ? [
                'Selected recent chat context (use only to understand what should change):',
                ...contextLines.map((l) => `- ${l}`),
            ].join('\n')
            : 'No chat context was selected for this transmission.',
        '',
        'Summarize the intended change to reality in ONE or TWO plain sentences.',
        'Write as a worldline fact, present tense, no spoilers, no lecture.',
        'Make the change concrete enough that a lorebook entry and character card can adopt it.',
        'Do not mention D-Mails, microwaves, SERN, or Reading Steiner unless the mail itself does.',
        'Do not invent who sent it — the Sender line is authoritative.',
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
        return `${sender} changed something small about the past; this worldline no longer matches what everyone remembered.`;
    }
    return `On this worldline (${sender}'s change): ${body.slice(0, 260)}`;
}
