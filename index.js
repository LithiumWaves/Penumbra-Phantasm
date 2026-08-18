const EXTENSION_NAME = 'Penumbra Phantasm';
const MODULE_URL = new URL('.', import.meta.url);

const ASSETS = {
    knife: new URL('assets/button/Toy_Knife.png', MODULE_URL).href,
    video: new URL('assets/sfx/open_fountain.webm', MODULE_URL).href,
    sfx: new URL('assets/sfx/open_fountain.mp3', MODULE_URL).href,
};

const EXAMPLE_ENTRY = `The Card Kingdom is a Dark World manifestation of Hometown School's abandoned classroom, connected to the Closet Dark World via the Great Door. Its theme is that of a whimsical, dark fantasy kingdom bearing the motif of anthropomorphised cards, checkers and chess pieces. The Kingdom is divided into four distinct regions: the Field, the Forest, the Great Board, and the Castle.

The Field is a sprawling expanse of twisting pathways through vibrant purple grass and towering trees with crimson leaves. It serves as the hub connecting to the Forest, Great Board, and the Great Door leading to Castle Town. The Forest is a dense maze of narrow paths blocked by thick red bushes and towering trees with blocky red leaves. The Great Board is an endless checkerboard terrain dotted with frozen pawn statues where C. Round and Ponmen wander aimlessly. The Castle is a towering black-and-white structure housing King's throne room and the Dark Fountain at its peak.`;

function getContext() {
    return SillyTavern.getContext();
}

function toast(type, message) {
    if (typeof toastr?.[type] === 'function') {
        toastr[type](message, EXTENSION_NAME);
        return;
    }
    console[type === 'error' ? 'error' : 'log'](`[${EXTENSION_NAME}] ${message}`);
}

function assetFailed(kind) {
    console.warn(`[${EXTENSION_NAME}] missing ${kind} asset`);
}

function buildDialogHtml() {
    return `
        <div id="pp-backdrop" class="pp-backdrop pp-hidden" role="dialog" aria-modal="true" aria-labelledby="pp-title">
            <form id="pp-dialog" class="pp-dialog">
                <h2 id="pp-title" class="pp-title">OPEN A DARK FOUNTAIN</h2>

                <div class="pp-field">
                    <label for="pp-name">Dark World name <span class="pp-optional">(optional)</span></label>
                    <input id="pp-name" name="name" type="text" maxlength="80" autocomplete="off" placeholder="Leave blank to let the darkness name it">
                </div>

                <div class="pp-field">
                    <label for="pp-location">Fountain location</label>
                    <input id="pp-location" name="location" type="text" maxlength="160" required autocomplete="off" placeholder="Where is the Dark Fountain being opened?">
                </div>

                <div class="pp-field">
                    <label for="pp-details">Location details</label>
                    <textarea id="pp-details" name="details" required placeholder="What is this place like in the Light World?"></textarea>
                </div>

                <div class="pp-field">
                    <label for="pp-guidelines">Guidelines <span class="pp-optional">(optional)</span></label>
                    <textarea id="pp-guidelines" name="guidelines" placeholder="Tone, motifs, connections, characters to include..."></textarea>
                </div>

                <div class="pp-field">
                    <label for="pp-lorebook">Lorebook</label>
                    <select id="pp-lorebook" name="lorebook" required></select>
                </div>

                <p id="pp-error" class="pp-error" aria-live="polite"></p>

                <div class="pp-actions">
                    <button type="button" id="pp-cancel" class="pp-btn">CLOSE</button>
                    <button type="submit" id="pp-open" class="pp-btn pp-btn-primary">OPEN DARK FOUNTAIN</button>
                </div>
            </form>
        </div>
    `;
}

function injectUi() {
    if (document.getElementById('pp-toy-knife')) {
        return;
    }

    const knife = document.createElement('button');
    knife.id = 'pp-toy-knife';
    knife.type = 'button';
    knife.title = 'Open a Dark Fountain';
    knife.setAttribute('aria-label', 'Open a Dark Fountain');
    knife.innerHTML = `<img src="${ASSETS.knife}" alt="">`;
    knife.querySelector('img').addEventListener('error', () => assetFailed('Toy_Knife.png'));
    document.body.appendChild(knife);

    document.body.insertAdjacentHTML('beforeend', buildDialogHtml());

    const overlay = document.createElement('div');
    overlay.id = 'pp-fountain-overlay';
    overlay.className = 'pp-fountain-overlay pp-hidden';
    overlay.innerHTML = `
        <video id="pp-fountain-video" playsinline preload="auto">
            <source src="${ASSETS.video}" type="video/webm">
        </video>
        <audio id="pp-fountain-audio" preload="auto" src="${ASSETS.sfx}"></audio>
    `;
    document.body.appendChild(overlay);

    knife.addEventListener('click', openDialog);
    document.getElementById('pp-cancel').addEventListener('click', closeDialog);
    document.getElementById('pp-backdrop').addEventListener('click', (event) => {
        if (event.target.id === 'pp-backdrop') {
            closeDialog();
        }
    });
    document.getElementById('pp-dialog').addEventListener('submit', onOpenFountain);
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && !document.getElementById('pp-backdrop').classList.contains('pp-hidden')) {
            closeDialog();
        }
    });
}

function setKnifeVisible(visible) {
    document.getElementById('pp-toy-knife')?.classList.toggle('pp-hidden', !visible);
}

function populateLorebooks() {
    const context = getContext();
    const select = document.getElementById('pp-lorebook');
    const names = typeof context.getWorldInfoNames === 'function'
        ? context.getWorldInfoNames()
        : [];
    const preferred = context.chatMetadata?.world_info || '';

    select.innerHTML = '';

    if (!Array.isArray(names) || names.length === 0) {
        const option = document.createElement('option');
        option.value = '';
        option.textContent = 'No lorebooks found';
        select.appendChild(option);
        return;
    }

    for (const name of names) {
        const option = document.createElement('option');
        option.value = name;
        option.textContent = name;
        if (name === preferred) {
            option.selected = true;
        }
        select.appendChild(option);
    }

    if (preferred && !names.includes(preferred) && names.length) {
        select.selectedIndex = 0;
    }
}

function setError(message) {
    const el = document.getElementById('pp-error');
    if (el) {
        el.textContent = message || '';
    }
}

function openDialog() {
    if (!document.getElementById('pp-fountain-overlay').classList.contains('pp-hidden')) {
        return;
    }
    populateLorebooks();
    setError('');
    document.getElementById('pp-backdrop').classList.remove('pp-hidden');
    setKnifeVisible(false);
    document.getElementById('pp-location').focus();
}

function closeDialog() {
    document.getElementById('pp-backdrop').classList.add('pp-hidden');
    if (document.getElementById('pp-fountain-overlay').classList.contains('pp-hidden')) {
        setKnifeVisible(true);
    }
}

function readForm() {
    return {
        name: document.getElementById('pp-name').value.trim(),
        location: document.getElementById('pp-location').value.trim(),
        details: document.getElementById('pp-details').value.trim(),
        guidelines: document.getElementById('pp-guidelines').value.trim(),
        lorebook: document.getElementById('pp-lorebook').value.trim(),
    };
}

function buildSystemPrompt() {
    return [
        'You write encyclopedic World Info entries for Deltarune-inspired Dark Worlds.',
        'A Dark World is a twisted, themed manifestation of a Light World location: objects, furniture, purpose, and atmosphere become geography, architecture, and inhabitants.',
        'Write in third person. No dialogue. No second person. No markdown. No bullet lists. No title line besides the required fields.',
        'The ENTRY must be 2 to 4 dense paragraphs in this shape:',
        '1) Name the Dark World, state that it is a Dark World manifestation of the Light World location, mention notable connections if any, and declare its theme/motif.',
        '2) State that it is divided into distinct named regions, then describe each region: visuals first, then its role (hub, maze, setpiece, castle) and any wanderers or landmarks.',
        '3) Place the Dark Fountain in a fitting climax location, usually at a peak, heart, or throne.',
        'Style example:',
        EXAMPLE_ENTRY,
        'Respond with EXACTLY this format and nothing else:',
        'NAME: <Dark World name>',
        'KEYS: <comma-separated trigger keywords>',
        'ENTRY:',
        '<the lorebook prose>',
    ].join('\n');
}

function buildUserPrompt(form) {
    const lines = [
        `Light World location where the Dark Fountain is opened: ${form.location}`,
        `Details about that location:\n${form.details}`,
    ];

    if (form.name) {
        lines.push(`Use this Dark World name exactly: ${form.name}`);
    } else {
        lines.push('Invent a fitting Dark World name from the location\'s objects, purpose, and atmosphere.');
    }

    if (form.guidelines) {
        lines.push(`Additional guidelines from the user:\n${form.guidelines}`);
    }

    lines.push('Produce the NAME / KEYS / ENTRY block now.');
    return lines.join('\n\n');
}

function stripFences(text) {
    return String(text || '')
        .replace(/^\s*```(?:\w+)?\s*/i, '')
        .replace(/\s*```\s*$/i, '')
        .trim();
}

function uniqueKeys(keys) {
    const seen = new Set();
    const result = [];
    for (const raw of keys) {
        const key = String(raw || '').trim();
        if (!key) continue;
        const id = key.toLowerCase();
        if (seen.has(id)) continue;
        seen.add(id);
        result.push(key);
    }
    return result;
}

function parseGeneration(raw, fallbackName, location) {
    const text = stripFences(raw);
    const nameMatch = text.match(/^\s*NAME:\s*(.+)$/im);
    const keysMatch = text.match(/^\s*KEYS:\s*(.+)$/im);
    const entryMatch = text.match(/^\s*ENTRY:\s*([\s\S]+)$/im);

    const parsedName = nameMatch?.[1]?.trim().replace(/^["']|["']$/g, '');
    const name = parsedName || fallbackName || location || 'Dark World';

    let keys = [];
    if (keysMatch?.[1]) {
        keys = keysMatch[1].split(/[,;]/).map((part) => part.trim());
    }

    let content = (entryMatch?.[1] || text).trim();
    content = content
        .replace(/^\s*NAME:\s*.+$/im, '')
        .replace(/^\s*KEYS:\s*.+$/im, '')
        .replace(/^\s*ENTRY:\s*/im, '')
        .trim();

    keys = uniqueKeys([
        name,
        location,
        'Dark World',
        'Dark Fountain',
        ...keys,
    ]);

    return { name, keys, content };
}

function getFreeWorldEntryUid(data) {
    if (!data || typeof data.entries !== 'object' || data.entries === null) {
        return 0;
    }
    const MAX_UID = 1_000_000;
    for (let uid = 0; uid < MAX_UID; uid++) {
        if (!(uid in data.entries)) {
            return uid;
        }
    }
    return Date.now();
}

function createWorldInfoEntry(data, { name, keys, content }) {
    const uid = getFreeWorldEntryUid(data);
    data.entries = data.entries || {};
    data.entries[uid] = {
        uid,
        key: keys,
        keysecondary: [],
        comment: name,
        content,
        constant: false,
        vectorized: false,
        selective: true,
        selectiveLogic: 0,
        addMemo: true,
        order: 100,
        position: 0,
        disable: false,
        ignoreBudget: false,
        excludeRecursion: false,
        preventRecursion: false,
        matchPersonaDescription: false,
        matchCharacterDescription: false,
        matchCharacterPersonality: false,
        matchCharacterDepthPrompt: false,
        matchScenario: false,
        matchCreatorNotes: false,
        delayUntilRecursion: 0,
        probability: 100,
        useProbability: true,
        depth: 4,
        outletName: '',
        group: '',
        groupOverride: false,
        groupWeight: 100,
        scanDepth: null,
        caseSensitive: null,
        matchWholeWords: null,
        useGroupScoring: null,
        automationId: '',
        role: 0,
        sticky: null,
        cooldown: null,
        delay: null,
        triggers: [],
    };
    return uid;
}

async function generateDarkWorld(form) {
    const context = getContext();
    if (typeof context.generateRaw !== 'function') {
        throw new Error('This SillyTavern version does not expose generateRaw.');
    }

    const raw = await context.generateRaw({
        systemPrompt: buildSystemPrompt(),
        prompt: buildUserPrompt(form),
    });

    const parsed = parseGeneration(raw, form.name, form.location);
    if (!parsed.content) {
        throw new Error('The selected API returned an empty Dark World.');
    }
    return parsed;
}

async function saveDarkWorldEntry(lorebook, entry) {
    const context = getContext();
    if (typeof context.loadWorldInfo !== 'function' || typeof context.saveWorldInfo !== 'function') {
        throw new Error('This SillyTavern version does not expose the lorebook API.');
    }

    const data = await context.loadWorldInfo(lorebook);
    if (!data) {
        throw new Error(`Could not load lorebook "${lorebook}".`);
    }

    createWorldInfoEntry(data, entry);
    await context.saveWorldInfo(lorebook, data, true);

    if (typeof context.reloadWorldInfoEditor === 'function') {
        context.reloadWorldInfoEditor(lorebook, true);
    }
    if (typeof context.updateWorldInfoList === 'function') {
        await context.updateWorldInfoList();
    }
}

function waitForPlaybackEnd(video) {
    return new Promise((resolve) => {
        if (video.ended || video.error) {
            resolve();
            return;
        }
        const finish = () => resolve();
        video.addEventListener('ended', finish, { once: true });
        video.addEventListener('error', finish, { once: true });
    });
}

async function playFountainOverlay() {
    const overlay = document.getElementById('pp-fountain-overlay');
    const video = document.getElementById('pp-fountain-video');
    const audio = document.getElementById('pp-fountain-audio');

    overlay.classList.remove('pp-hidden');
    setKnifeVisible(false);

    video.loop = false;
    video.currentTime = 0;
    audio.pause();
    audio.currentTime = 0;

    let usedFallbackAudio = false;
    try {
        video.muted = false;
        await video.play();
    } catch (err) {
        console.warn(`[${EXTENSION_NAME}] video autoplay with sound failed`, err);
        try {
            video.muted = true;
            await video.play();
            usedFallbackAudio = true;
            audio.currentTime = 0;
            await audio.play().catch((audioErr) => {
                console.warn(`[${EXTENSION_NAME}] fountain SFX failed`, audioErr);
            });
        } catch (mutedErr) {
            console.warn(`[${EXTENSION_NAME}] fountain video failed`, mutedErr);
            assetFailed('open_fountain.webm');
        }
    }

    return {
        video,
        audio,
        usedFallbackAudio,
        firstPlay: video.paused ? Promise.resolve() : waitForPlaybackEnd(video),
    };
}

function stopFountainOverlay(playback) {
    const overlay = document.getElementById('pp-fountain-overlay');
    const video = playback?.video || document.getElementById('pp-fountain-video');
    const audio = playback?.audio || document.getElementById('pp-fountain-audio');

    if (video) {
        video.pause();
        video.loop = false;
    }
    if (audio) {
        audio.pause();
        audio.loop = false;
    }
    overlay?.classList.add('pp-hidden');
    setKnifeVisible(true);
}

async function waitForFountainAndGeneration(playback, generationPromise) {
    let generationDone = false;
    const tracked = generationPromise.finally(() => {
        generationDone = true;
    });

    await playback.firstPlay.catch(() => {});

    if (!generationDone) {
        playback.video.loop = true;
        if (playback.video.paused) {
            await playback.video.play().catch(() => {});
        }
        if (playback.usedFallbackAudio && playback.audio.paused) {
            playback.audio.loop = true;
            await playback.audio.play().catch(() => {});
        }
        await tracked;
    } else {
        await tracked;
    }
}

async function onOpenFountain(event) {
    event.preventDefault();
    const form = readForm();

    if (!form.location) {
        setError('A location is required to open a Dark Fountain.');
        return;
    }
    if (!form.details) {
        setError('Describe the Light World location.');
        return;
    }
    if (!form.lorebook) {
        setError('Choose a lorebook.');
        return;
    }

    setError('');
    closeDialog();

    const openButton = document.getElementById('pp-open');
    openButton.disabled = true;

    let playback;
    try {
        playback = await playFountainOverlay();
        const generationPromise = generateDarkWorld(form);
        const [entry] = await Promise.all([
            generationPromise,
            waitForFountainAndGeneration(playback, generationPromise),
        ]);
        await saveDarkWorldEntry(form.lorebook, entry);
        toast('success', `Dark Fountain opened: ${entry.name}`);
    } catch (err) {
        console.error(`[${EXTENSION_NAME}] failed to open Dark Fountain`, err);
        toast('error', err?.message || 'Failed to open a Dark Fountain.');
    } finally {
        stopFountainOverlay(playback);
        openButton.disabled = false;
    }
}

function init() {
    injectUi();
    console.log(`[${EXTENSION_NAME}] ready`);
}

jQuery(() => {
    init();
});
