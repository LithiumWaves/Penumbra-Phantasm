const EXTENSION_NAME = 'Penumbra Phantasm';
const SETTINGS_KEY = 'penumbraPhantasm';
const MODULE_URL = new URL('.', import.meta.url);
const DEFAULT_SETTINGS = {
    showKnife: true,
};

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

function getSettings() {
    const context = getContext();
    const settings = context.extensionSettings;
    if (!settings[SETTINGS_KEY] || typeof settings[SETTINGS_KEY] !== 'object') {
        settings[SETTINGS_KEY] = { ...DEFAULT_SETTINGS };
    }
    if (typeof settings[SETTINGS_KEY].showKnife !== 'boolean') {
        settings[SETTINGS_KEY].showKnife = DEFAULT_SETTINGS.showKnife;
    }
    return settings[SETTINGS_KEY];
}

function persistSettings() {
    getContext().saveSettingsDebounced();
}

function isKnifeEnabled() {
    return getSettings().showKnife !== false;
}

function setKnifeEnabled(enabled) {
    getSettings().showKnife = Boolean(enabled);
    persistSettings();
    const checkbox = document.getElementById('pp_show_knife');
    if (checkbox) {
        checkbox.checked = Boolean(enabled);
    }
    updateKnifeVisibility();
}

function buildDialogHtml() {
    return `
        <div id="pp-backdrop" class="pp-backdrop pp-hidden" role="dialog" aria-modal="true" aria-labelledby="pp-title">
            <form id="pp-dialog" class="pp-dialog">
                <h2 id="pp-title" class="pp-title">OPEN A DARK FOUNTAIN</h2>

                <div class="pp-field">
                    <label for="pp-name">Dark World name <span class="pp-optional">(optional)</span></label>
                    <input id="pp-name" name="name" type="text" maxlength="80" autocomplete="off" placeholder="Blank = AI names it">
                </div>

                <div class="pp-field">
                    <label for="pp-location">Fountain location</label>
                    <input id="pp-location" name="location" type="text" maxlength="160" required autocomplete="off" enterkeyhint="next" placeholder="Where is the fountain opened?">
                </div>

                <div class="pp-field">
                    <label for="pp-details">Location details</label>
                    <textarea id="pp-details" name="details" required placeholder="What is this Light World place like?"></textarea>
                </div>

                <div class="pp-field">
                    <label for="pp-guidelines">Guidelines <span class="pp-optional">(optional)</span></label>
                    <textarea id="pp-guidelines" name="guidelines" placeholder="Tone, motifs, connections..."></textarea>
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
    if (document.getElementById('pp-knife-cluster')) {
        return;
    }

    const cluster = document.createElement('div');
    cluster.id = 'pp-knife-cluster';
    cluster.innerHTML = `
        <button type="button" id="pp-hide-knife" title="Hide Toy Knife" aria-label="Hide Toy Knife">X</button>
        <button type="button" id="pp-toy-knife" title="Open a Dark Fountain" aria-label="Open a Dark Fountain">
            <img src="${ASSETS.knife}" alt="">
        </button>
    `;
    cluster.querySelector('img').addEventListener('error', () => assetFailed('Toy_Knife.png'));
    document.body.appendChild(cluster);

    document.body.insertAdjacentHTML('beforeend', buildDialogHtml());

    const overlay = document.createElement('div');
    overlay.id = 'pp-fountain-overlay';
    overlay.className = 'pp-fountain-overlay pp-hidden';
    overlay.innerHTML = `
        <video id="pp-fountain-video" playsinline webkit-playsinline preload="auto">
            <source src="${ASSETS.video}" type="video/webm">
        </video>
        <audio id="pp-fountain-audio" preload="auto" src="${ASSETS.sfx}"></audio>
        <div id="pp-skip-hint" class="pp-skip-hint">TAP TO SKIP</div>
    `;
    document.body.appendChild(overlay);

    document.getElementById('pp-toy-knife').addEventListener('click', openDialog);
    document.getElementById('pp-hide-knife').addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        hideKnife();
    });
    document.getElementById('pp-cancel').addEventListener('click', closeDialog);
    document.getElementById('pp-backdrop').addEventListener('click', (event) => {
        if (event.target.id === 'pp-backdrop') {
            closeDialog();
        }
    });
    document.getElementById('pp-dialog').addEventListener('submit', onOpenFountain);
    overlay.addEventListener('pointerdown', (event) => {
        event.preventDefault();
        skipFountainPlayback();
    });
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && isDialogOpen()) {
            closeDialog();
            return;
        }
        if ((event.key === 'Escape' || event.key === ' ' || event.key === 'Enter') && isOverlayOpen()) {
            event.preventDefault();
            skipFountainPlayback();
        }
    });

    const sync = () => syncFloatingUiToViewport();
    const viewport = window.visualViewport;
    if (viewport) {
        viewport.addEventListener('resize', sync);
        viewport.addEventListener('scroll', sync);
    }
    window.addEventListener('resize', sync);
    window.addEventListener('orientationchange', sync);
    window.addEventListener('scroll', sync, true);
    sync();
}

function injectSettings() {
    if (document.getElementById('pp_settings_drawer')) {
        return;
    }

    const html = `
        <div id="pp_settings_drawer" class="penumbra-phantasm-settings">
            <div class="inline-drawer">
                <div class="inline-drawer-toggle inline-drawer-header">
                    <b>Penumbra Phantasm</b>
                    <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
                </div>
                <div class="inline-drawer-content">
                    <label class="checkbox_label" for="pp_show_knife">
                        <input id="pp_show_knife" type="checkbox">
                        <span>Show Toy Knife button</span>
                    </label>
                    <small>Hide it with the X on the knife, or uncheck this. Use <code>/darkfountain</code> to open the form while it is hidden.</small>
                </div>
            </div>
        </div>
    `;

    const host = document.getElementById('extensions_settings2')
        || document.getElementById('extensions_settings');
    if (!host) {
        console.warn(`[${EXTENSION_NAME}] could not find the extensions settings panel`);
        return;
    }
    host.insertAdjacentHTML('beforeend', html);

    const checkbox = document.getElementById('pp_show_knife');
    checkbox.checked = isKnifeEnabled();
    checkbox.addEventListener('change', () => {
        setKnifeEnabled(checkbox.checked);
    });
}

function registerSlashCommand() {
    const context = getContext();
    const Parser = context.SlashCommandParser;
    const Command = context.SlashCommand;
    if (!Parser?.addCommandObject || !Command?.fromProps) {
        return;
    }

    try {
        Parser.addCommandObject(Command.fromProps({
            name: 'darkfountain',
            aliases: ['penumbra'],
            callback: () => {
                openDialog();
                return '';
            },
            helpString: 'Opens the Penumbra Phantasm Dark Fountain form, even if the Toy Knife is hidden.',
        }));
    } catch (err) {
        console.warn(`[${EXTENSION_NAME}] slash command registration failed`, err);
    }
}

function hideKnife() {
    setKnifeEnabled(false);
    toast('info', 'Toy Knife hidden. Re-enable it in Extensions → Penumbra Phantasm, or type /darkfountain.');
}

function isOverlayOpen() {
    return !document.getElementById('pp-fountain-overlay')?.classList.contains('pp-hidden');
}

function isDialogOpen() {
    return !document.getElementById('pp-backdrop')?.classList.contains('pp-hidden');
}

function getVisibleRect() {
    const viewport = window.visualViewport;
    if (viewport) {
        return {
            top: viewport.offsetTop,
            left: viewport.offsetLeft,
            width: viewport.width,
            height: viewport.height,
        };
    }
    return {
        top: window.scrollY || 0,
        left: window.scrollX || 0,
        width: window.innerWidth,
        height: window.innerHeight,
    };
}

function clearPinnedStyles(el) {
    if (!el) {
        return;
    }
    el.style.removeProperty('top');
    el.style.removeProperty('left');
    el.style.removeProperty('right');
    el.style.removeProperty('bottom');
    el.style.removeProperty('width');
    el.style.removeProperty('height');
}

function pinElementToVisibleRect(el, box) {
    if (!el) {
        return;
    }
    el.style.position = 'fixed';
    el.style.top = `${box.top}px`;
    el.style.left = `${box.left}px`;
    el.style.width = `${box.width}px`;
    el.style.height = `${box.height}px`;
    el.style.right = 'auto';
    el.style.bottom = 'auto';
    el.style.margin = '0';
}

function updateKnifeVisibility() {
    const cluster = document.getElementById('pp-knife-cluster');
    const show = isKnifeEnabled() && !isDialogOpen() && !isOverlayOpen();
    cluster?.classList.toggle('pp-hidden', !show);
    if (show) {
        syncFloatingUiToViewport();
    }
}

function syncFloatingUiToViewport() {
    const rect = getVisibleRect();
    const backdrop = document.getElementById('pp-backdrop');
    const overlay = document.getElementById('pp-fountain-overlay');
    const cluster = document.getElementById('pp-knife-cluster');

    if (backdrop && !backdrop.classList.contains('pp-hidden')) {
        pinElementToVisibleRect(backdrop, rect);
    } else {
        clearPinnedStyles(backdrop);
    }

    if (overlay && !overlay.classList.contains('pp-hidden')) {
        pinElementToVisibleRect(overlay, rect);
    } else {
        clearPinnedStyles(overlay);
    }

    if (cluster && !cluster.classList.contains('pp-hidden')) {
        const isPhone = Math.min(rect.width, rect.height) < 700 || rect.width <= 900;
        const clusterWidth = isPhone ? 64 : 80;
        const clusterHeight = isPhone ? 100 : 110;
        const edge = Math.max(10, isPhone ? 12 : 16);
        // Keep above SillyTavern's mobile send bar / browser chrome.
        const bottomClearance = isPhone ? Math.max(120, Math.round(rect.height * 0.14)) : Math.round(rect.height * 0.35);
        const top = rect.top + Math.max(edge, rect.height - clusterHeight - bottomClearance);
        const left = rect.left + Math.max(edge, rect.width - clusterWidth - edge);
        cluster.style.position = 'fixed';
        cluster.style.top = `${top}px`;
        cluster.style.left = `${left}px`;
        cluster.style.right = 'auto';
        cluster.style.bottom = 'auto';
        cluster.style.width = `${clusterWidth}px`;
        cluster.style.height = 'auto';
        cluster.style.margin = '0';
        cluster.style.transform = 'none';
    } else {
        clearPinnedStyles(cluster);
        if (cluster) {
            cluster.style.removeProperty('transform');
        }
    }
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
    if (isOverlayOpen()) {
        return;
    }
    populateLorebooks();
    setError('');
    document.getElementById('pp-backdrop').classList.remove('pp-hidden');
    updateKnifeVisibility();
    syncFloatingUiToViewport();
    document.getElementById('pp-location').focus();
}

function closeDialog() {
    document.getElementById('pp-backdrop').classList.add('pp-hidden');
    syncFloatingUiToViewport();
    updateKnifeVisibility();
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

let activeFountainPlayback = null;

function holdLastFrame(video) {
    if (!video || !Number.isFinite(video.duration) || video.duration <= 0) {
        return;
    }
    const end = Math.max(0, video.duration - 0.05);
    if (Math.abs(video.currentTime - end) > 0.02) {
        try {
            video.currentTime = end;
        } catch (err) {
            // Seeking can fail mid-load on some mobile browsers.
        }
    }
    video.pause();
}

function skipFountainPlayback() {
    const playback = activeFountainPlayback;
    if (!playback || playback.skipped) {
        return;
    }
    playback.skipped = true;
    holdLastFrame(playback.video);
    if (playback.audio) {
        playback.audio.pause();
    }
    const hint = document.getElementById('pp-skip-hint');
    if (hint) {
        hint.textContent = 'OPENING...';
    }
    playback.resolveSkip?.();
}

async function playFountainOverlay() {
    const overlay = document.getElementById('pp-fountain-overlay');
    const video = document.getElementById('pp-fountain-video');
    const audio = document.getElementById('pp-fountain-audio');
    const hint = document.getElementById('pp-skip-hint');

    if (hint) {
        hint.textContent = 'TAP TO SKIP';
        hint.classList.remove('pp-hidden');
    }

    overlay.classList.remove('pp-hidden');
    updateKnifeVisibility();
    syncFloatingUiToViewport();

    video.loop = false;
    video.currentTime = 0;
    audio.loop = false;
    audio.pause();
    audio.currentTime = 0;

    let resolveSkip;
    const skipPromise = new Promise((resolve) => {
        resolveSkip = resolve;
    });

    const endedPromise = new Promise((resolve) => {
        const finish = () => resolve();
        video.addEventListener('ended', finish, { once: true });
        video.addEventListener('error', finish, { once: true });
    });

    const playback = {
        video,
        audio,
        skipped: false,
        resolveSkip,
    };
    activeFountainPlayback = playback;

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
            resolveSkip();
        }
    }

    const durationMs = Number.isFinite(video.duration) && video.duration > 0
        ? (video.duration * 1000) + 750
        : 35000;

    const firstPlay = Promise.race([
        endedPromise.then(() => {
            holdLastFrame(video);
        }),
        skipPromise.then(() => {
            holdLastFrame(video);
        }),
        new Promise((resolve) => setTimeout(() => {
            holdLastFrame(video);
            resolve();
        }, durationMs)),
    ]);

    playback.usedFallbackAudio = usedFallbackAudio;
    playback.firstPlay = firstPlay;
    return playback;
}

function stopFountainOverlay(playback) {
    const overlay = document.getElementById('pp-fountain-overlay');
    const video = playback?.video || document.getElementById('pp-fountain-video');
    const audio = playback?.audio || document.getElementById('pp-fountain-audio');

    if (activeFountainPlayback === playback) {
        activeFountainPlayback = null;
    }

    if (video) {
        video.pause();
        video.loop = false;
    }
    if (audio) {
        audio.pause();
        audio.loop = false;
    }
    overlay?.classList.add('pp-hidden');
    clearPinnedStyles(overlay);
    updateKnifeVisibility();
    syncFloatingUiToViewport();
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
    document.getElementById('pp-backdrop').classList.add('pp-hidden');
    syncFloatingUiToViewport();

    const openButton = document.getElementById('pp-open');
    openButton.disabled = true;

    let playback;
    try {
        playback = await playFountainOverlay();
        const generationPromise = generateDarkWorld(form);
        await playback.firstPlay.catch(() => {});
        const entry = await generationPromise;
        await saveDarkWorldEntry(form.lorebook, entry);
        toast('success', `Dark Fountain opened: ${entry.name}`);
    } catch (err) {
        console.error(`[${EXTENSION_NAME}] failed to open Dark Fountain`, err);
        toast('error', err?.message || 'Failed to open a Dark Fountain.');
    } finally {
        stopFountainOverlay(playback);
        openButton.disabled = false;
        syncFloatingUiToViewport();
    }
}

function init() {
    getSettings();
    injectUi();
    injectSettings();
    registerSlashCommand();
    updateKnifeVisibility();
    syncFloatingUiToViewport();
    console.log(`[${EXTENSION_NAME}] ready`);
}

jQuery(() => {
    init();
});
