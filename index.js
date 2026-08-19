const EXTENSION_NAME = 'Penumbra Phantasm';
const SETTINGS_KEY = 'penumbraPhantasm';
const MODULE_URL = new URL('.', import.meta.url);
const OPENROUTER_BASE = 'https://openrouter.ai/api/v1';
const DEFAULT_OPENROUTER_MODEL = 'anthropic/claude-sonnet-4';

const EXAMPLE_ENTRY = `The Card Kingdom is a Dark World manifestation of Hometown School's abandoned classroom, connected to the Closet Dark World via the Great Door. Its theme is that of a whimsical, dark fantasy kingdom bearing the motif of anthropomorphised cards, checkers and chess pieces. The Kingdom is divided into four distinct regions: the Field, the Forest, the Great Board, and the Castle.

The Field is a sprawling expanse of twisting pathways through vibrant purple grass and towering trees with crimson leaves. It serves as the hub connecting to the Forest, Great Board, and the Great Door leading to Castle Town. The Forest is a dense maze of narrow paths blocked by thick red bushes and towering trees with blocky red leaves. The Great Board is an endless checkerboard terrain dotted with frozen pawn statues where C. Round and Ponmen wander aimlessly. The Castle is a towering black-and-white structure housing King's throne room and the Dark Fountain at its peak.`;

const DEFAULT_SYSTEM_PROMPT = [
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

const DEFAULT_USER_PROMPT_TEMPLATE = [
    'Light World location where the Dark Fountain is opened: {{location}}',
    '',
    'Details about that location:',
    '{{details}}',
    '',
    '{{name_instruction}}',
    '',
    '{{guidelines_block}}',
    '',
    'Produce the NAME / KEYS / ENTRY block now.',
].join('\n');

const DEFAULT_SETTINGS = {
    showKnife: true,
    useOpenRouter: false,
    openRouterApiKey: '',
    openRouterModel: DEFAULT_OPENROUTER_MODEL,
    systemPrompt: DEFAULT_SYSTEM_PROMPT,
    userPromptTemplate: DEFAULT_USER_PROMPT_TEMPLATE,
    skipAnimation: false,
};

const APPEND_TYPES = {
    region: {
        label: 'Add region',
        instruction: 'Add one new distinct named region to this Dark World. Describe its visuals, role, and how it connects to existing regions. Keep the original prose and weave the new region in naturally.',
    },
    npcs: {
        label: 'Add NPCs',
        instruction: 'Add a small cast of new Dark World NPCs/denizens that fit the existing motif. Describe who they are, where they wander, and how they fit the theme. Keep the original prose and weave them in naturally.',
    },
    secret: {
        label: 'Add secret area',
        instruction: 'Add one secret/hidden area to this Dark World. Describe how it is concealed, what it contains, and how it relates to the Dark Fountain or existing regions. Keep the original prose and weave it in naturally.',
    },
};

const RANDOM_SEEDS = [
    {
        location: 'Abandoned computer lab',
        details: 'Rows of dusty CRT monitors, tangled ethernet cables, a locked server closet, and sticky notes with forgotten passwords.',
        guidelines: 'Cyber-royal motif; digital royalty and virus knights.',
    },
    {
        location: '24-hour laundromat',
        details: 'Buzzing fluorescent lights, spinning washers, lost socks, detergent smell, and a broken change machine.',
        guidelines: 'Soft fabric kingdoms and soap-bubble magic.',
    },
    {
        location: 'Empty bowling alley',
        details: 'Oiled lanes, pinsetters behind curtains, neon beer signs, rental shoes, and a silent arcade corner.',
        guidelines: 'Sports-arena fantasy with pin soldiers.',
    },
    {
        location: 'School music room',
        details: 'Stacked chairs, a dusty piano, instrument cases, sheet music littered across stands, and a locked practice closet.',
        guidelines: 'Musical dark fantasy; notes become terrain.',
    },
    {
        location: 'Closed aquarium gift shop',
        details: 'Plush sharks, snow globes, saltwater posters, a drained touch-tank, and boxes of keychains.',
        guidelines: 'Deep-sea carnival motif.',
    },
    {
        location: 'Office supply closet',
        details: 'Towering shelves of paper, stapler forts, toner stains, binder clips, and a flickering overhead bulb.',
        guidelines: 'Bureaucracy as mythology; paper knights and ink beasts.',
    },
    {
        location: 'Suburban garage',
        details: 'Half-finished projects, holiday decorations in bins, a rusty bike, oil stains, and a workbench of mismatched tools.',
        guidelines: 'Junkyard adventure kingdom.',
    },
    {
        location: 'Late-night diner kitchen',
        details: 'Greasy grill, ticket carousel, walk-in freezer, coffee that never ends, and a back alley dumpster door.',
        guidelines: 'Noir diner underworld.',
    },
];

const ASSETS = {
    knife: new URL('assets/button/Toy_Knife.png', MODULE_URL).href,
    video: new URL('assets/sfx/open_fountain.webm', MODULE_URL).href,
    sfx: new URL('assets/sfx/open_fountain.mp3', MODULE_URL).href,
};

let openRouterModelsCache = [];
let settingsPanelOpen = false;
let activeFountainPlayback = null;
let lorebookEntriesCache = [];
let successToastTimer = null;

function getContext() {
    return SillyTavern.getContext();
}

function toast(type, message) {
    if (type === 'success') {
        showThemedToast(message);
        return;
    }
    if (typeof toastr?.[type] === 'function') {
        toastr[type](message, EXTENSION_NAME);
        return;
    }
    console[type === 'error' ? 'error' : 'log'](`[${EXTENSION_NAME}] ${message}`);
}

function showThemedToast(message, { title = '* The Dark Fountain answers.' } = {}) {
    let host = document.getElementById('pp-toast');
    if (!host) {
        host = document.createElement('div');
        host.id = 'pp-toast';
        host.className = 'pp-toast pp-hidden';
        host.innerHTML = `
            <div class="pp-toast-box" role="status" aria-live="polite">
                <div id="pp-toast-title" class="pp-toast-title"></div>
                <div id="pp-toast-body" class="pp-toast-body"></div>
            </div>
        `;
        document.body.appendChild(host);
        host.addEventListener('click', hideThemedToast);
    }

    document.getElementById('pp-toast-title').textContent = title;
    document.getElementById('pp-toast-body').textContent = message;
    host.classList.remove('pp-hidden');
    syncFloatingUiToViewport();

    if (successToastTimer) {
        clearTimeout(successToastTimer);
    }
    successToastTimer = setTimeout(hideThemedToast, 5200);
}

function hideThemedToast() {
    document.getElementById('pp-toast')?.classList.add('pp-hidden');
    if (successToastTimer) {
        clearTimeout(successToastTimer);
        successToastTimer = null;
    }
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

    const stored = settings[SETTINGS_KEY];
    for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
        if (stored[key] === undefined || stored[key] === null) {
            stored[key] = value;
        }
    }
    if (!String(stored.systemPrompt || '').trim()) {
        stored.systemPrompt = DEFAULT_SYSTEM_PROMPT;
    }
    if (!String(stored.userPromptTemplate || '').trim()) {
        stored.userPromptTemplate = DEFAULT_USER_PROMPT_TEMPLATE;
    }
    if (!String(stored.openRouterModel || '').trim()) {
        stored.openRouterModel = DEFAULT_OPENROUTER_MODEL;
    }
    return stored;
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
    const dialogHide = document.getElementById('pp-hide-knife');
    if (dialogHide) {
        dialogHide.textContent = enabled ? 'HIDE TOY KNIFE' : 'SHOW TOY KNIFE';
    }
    updateKnifeVisibility();
}

function buildDialogHtml() {
    const appendOptions = Object.entries(APPEND_TYPES)
        .map(([value, meta]) => `<option value="${value}">${meta.label}</option>`)
        .join('');

    return `
        <div id="pp-backdrop" class="pp-backdrop pp-hidden" role="dialog" aria-modal="true" aria-labelledby="pp-title">
            <form id="pp-dialog" class="pp-dialog">
                <div class="pp-dialog-top">
                    <h2 id="pp-title" class="pp-title">OPEN A DARK FOUNTAIN</h2>
                    <div class="pp-dialog-tools">
                        <button type="button" id="pp-settings-toggle" class="pp-btn pp-btn-compact">SETTINGS</button>
                        <button type="button" id="pp-hide-knife" class="pp-btn pp-btn-compact">HIDE TOY KNIFE</button>
                    </div>
                </div>

                <div id="pp-main-panel">
                    <div class="pp-field">
                        <label for="pp-mode">Mode</label>
                        <select id="pp-mode" name="mode">
                            <option value="create">Create new Dark World</option>
                            <option value="append">Append to existing Dark World</option>
                        </select>
                    </div>

                    <div id="pp-create-fields">
                        <div class="pp-field">
                            <label for="pp-name">Dark World name <span class="pp-optional">(optional)</span></label>
                            <input id="pp-name" name="name" type="text" maxlength="80" autocomplete="off" placeholder="Blank = AI names it">
                        </div>

                        <div class="pp-field">
                            <label for="pp-location">Fountain location</label>
                            <input id="pp-location" name="location" type="text" maxlength="160" autocomplete="off" enterkeyhint="next" placeholder="Where is the fountain opened?">
                        </div>

                        <div class="pp-field">
                            <label for="pp-details">Location details</label>
                            <textarea id="pp-details" name="details" placeholder="What is this Light World place like?"></textarea>
                        </div>
                    </div>

                    <div id="pp-append-fields" class="pp-hidden">
                        <div class="pp-field">
                            <label for="pp-existing-entry">Existing Dark World entry</label>
                            <select id="pp-existing-entry" name="existingEntry"></select>
                        </div>

                        <div class="pp-field">
                            <label for="pp-append-type">Append</label>
                            <select id="pp-append-type" name="appendType">
                                ${appendOptions}
                            </select>
                        </div>

                        <div class="pp-field">
                            <label for="pp-append-notes">Addition notes <span class="pp-optional">(optional)</span></label>
                            <textarea id="pp-append-notes" name="appendNotes" placeholder="What should be added? Leave blank to let the AI invent it."></textarea>
                        </div>
                    </div>

                    <div class="pp-field">
                        <label for="pp-guidelines">Guidelines <span class="pp-optional">(optional)</span></label>
                        <textarea id="pp-guidelines" name="guidelines" placeholder="Tone, motifs, connections..."></textarea>
                    </div>

                    <div class="pp-field">
                        <label for="pp-lorebook">Lorebook</label>
                        <select id="pp-lorebook" name="lorebook" required></select>
                    </div>
                </div>

                <div id="pp-settings-panel" class="pp-settings-panel pp-hidden">
                    <p class="pp-settings-note">Saved in extension settings. OpenRouter bypasses the main SillyTavern API connection.</p>

                    <label class="pp-check" for="pp-use-openrouter">
                        <input id="pp-use-openrouter" type="checkbox">
                        <span>Use OpenRouter instead of main API</span>
                    </label>

                    <label class="pp-check" for="pp-skip-animation">
                        <input id="pp-skip-animation" type="checkbox">
                        <span>Always skip fountain animation</span>
                    </label>

                    <div class="pp-field">
                        <label for="pp-openrouter-key">OpenRouter API key</label>
                        <input id="pp-openrouter-key" type="password" autocomplete="off" spellcheck="false" placeholder="sk-or-...">
                    </div>

                    <div class="pp-field">
                        <label for="pp-openrouter-model">OpenRouter model</label>
                        <div class="pp-model-row">
                            <select id="pp-openrouter-model"></select>
                            <button type="button" id="pp-refresh-models" class="pp-btn pp-btn-compact">REFRESH</button>
                        </div>
                        <input id="pp-openrouter-model-custom" type="text" autocomplete="off" spellcheck="false" placeholder="Or type a model id, e.g. anthropic/claude-sonnet-4">
                    </div>

                    <div class="pp-field">
                        <label for="pp-system-prompt">System prompt</label>
                        <textarea id="pp-system-prompt" class="pp-prompt-box" spellcheck="false"></textarea>
                    </div>

                    <div class="pp-field">
                        <label for="pp-user-prompt">User prompt template</label>
                        <textarea id="pp-user-prompt" class="pp-prompt-box" spellcheck="false"></textarea>
                        <small class="pp-hint">Placeholders: {{location}} {{details}} {{name}} {{guidelines}} {{name_instruction}} {{guidelines_block}}</small>
                    </div>

                    <div class="pp-actions pp-settings-actions">
                        <button type="button" id="pp-reset-prompts" class="pp-btn">RESET PROMPTS</button>
                        <button type="button" id="pp-settings-done" class="pp-btn pp-btn-primary">DONE</button>
                    </div>
                </div>

                <p id="pp-error" class="pp-error" aria-live="polite"></p>

                <div id="pp-main-actions" class="pp-actions pp-main-actions">
                    <button type="button" id="pp-randomize" class="pp-btn">RANDOM</button>
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
    document.getElementById('pp-cancel').addEventListener('click', closeDialog);
    document.getElementById('pp-randomize').addEventListener('click', onRandomize);
    document.getElementById('pp-settings-toggle').addEventListener('click', () => setSettingsPanelOpen(!settingsPanelOpen));
    document.getElementById('pp-settings-done').addEventListener('click', () => {
        saveSettingsFromForm();
        setSettingsPanelOpen(false);
    });
    document.getElementById('pp-hide-knife').addEventListener('click', toggleKnifeFromDialog);
    document.getElementById('pp-reset-prompts').addEventListener('click', resetPrompts);
    document.getElementById('pp-refresh-models').addEventListener('click', () => refreshOpenRouterModels(true));
    document.getElementById('pp-use-openrouter').addEventListener('change', saveSettingsFromForm);
    document.getElementById('pp-skip-animation').addEventListener('change', saveSettingsFromForm);
    document.getElementById('pp-openrouter-key').addEventListener('change', saveSettingsFromForm);
    document.getElementById('pp-openrouter-model').addEventListener('change', () => {
        const select = document.getElementById('pp-openrouter-model');
        document.getElementById('pp-openrouter-model-custom').value = select.value;
        saveSettingsFromForm();
    });
    document.getElementById('pp-openrouter-model-custom').addEventListener('change', saveSettingsFromForm);
    document.getElementById('pp-system-prompt').addEventListener('change', saveSettingsFromForm);
    document.getElementById('pp-user-prompt').addEventListener('change', saveSettingsFromForm);
    document.getElementById('pp-mode').addEventListener('change', updateModeUi);
    document.getElementById('pp-lorebook').addEventListener('change', () => {
        populateExistingEntries();
    });
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
            if (settingsPanelOpen) {
                setSettingsPanelOpen(false);
                return;
            }
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
                    <small>You can also hide/show it from the Dark Fountain creator UI. Use <code>/darkfountain</code> to open the form while the knife is hidden. OpenRouter key, model, and prompt edits live in the creator SETTINGS panel.</small>
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

function toggleKnifeFromDialog() {
    const enabled = isKnifeEnabled();
    setKnifeEnabled(!enabled);
    if (enabled) {
        toast('info', 'Toy Knife hidden. Re-enable it here, in Extensions → Penumbra Phantasm, or type /darkfountain.');
        closeDialog();
    } else {
        toast('success', 'Toy Knife shown again.');
    }
}

function setSettingsPanelOpen(open) {
    settingsPanelOpen = Boolean(open);
    document.getElementById('pp-settings-panel')?.classList.toggle('pp-hidden', !settingsPanelOpen);
    document.getElementById('pp-main-panel')?.classList.toggle('pp-hidden', settingsPanelOpen);
    document.getElementById('pp-main-actions')?.classList.toggle('pp-hidden', settingsPanelOpen);
    const toggle = document.getElementById('pp-settings-toggle');
    if (toggle) {
        toggle.textContent = settingsPanelOpen ? 'BACK' : 'SETTINGS';
    }
    if (settingsPanelOpen) {
        loadSettingsIntoForm();
    } else {
        saveSettingsFromForm();
    }
}

function loadSettingsIntoForm() {
    const settings = getSettings();
    document.getElementById('pp-use-openrouter').checked = Boolean(settings.useOpenRouter);
    document.getElementById('pp-skip-animation').checked = Boolean(settings.skipAnimation);
    document.getElementById('pp-openrouter-key').value = settings.openRouterApiKey || '';
    document.getElementById('pp-system-prompt').value = settings.systemPrompt || DEFAULT_SYSTEM_PROMPT;
    document.getElementById('pp-user-prompt').value = settings.userPromptTemplate || DEFAULT_USER_PROMPT_TEMPLATE;
    document.getElementById('pp-openrouter-model-custom').value = settings.openRouterModel || DEFAULT_OPENROUTER_MODEL;
    populateModelSelect(settings.openRouterModel || DEFAULT_OPENROUTER_MODEL);
    document.getElementById('pp-hide-knife').textContent = isKnifeEnabled() ? 'HIDE TOY KNIFE' : 'SHOW TOY KNIFE';
}

function saveSettingsFromForm() {
    const settings = getSettings();
    settings.useOpenRouter = Boolean(document.getElementById('pp-use-openrouter')?.checked);
    settings.skipAnimation = Boolean(document.getElementById('pp-skip-animation')?.checked);
    settings.openRouterApiKey = document.getElementById('pp-openrouter-key')?.value.trim() || '';
    const customModel = document.getElementById('pp-openrouter-model-custom')?.value.trim();
    const selectedModel = document.getElementById('pp-openrouter-model')?.value.trim();
    settings.openRouterModel = customModel || selectedModel || DEFAULT_OPENROUTER_MODEL;
    settings.systemPrompt = document.getElementById('pp-system-prompt')?.value || DEFAULT_SYSTEM_PROMPT;
    settings.userPromptTemplate = document.getElementById('pp-user-prompt')?.value || DEFAULT_USER_PROMPT_TEMPLATE;
    persistSettings();
}

function resetPrompts() {
    document.getElementById('pp-system-prompt').value = DEFAULT_SYSTEM_PROMPT;
    document.getElementById('pp-user-prompt').value = DEFAULT_USER_PROMPT_TEMPLATE;
    saveSettingsFromForm();
    toast('info', 'Prompts reset to defaults.');
}

function populateModelSelect(selectedId) {
    const select = document.getElementById('pp-openrouter-model');
    if (!select) {
        return;
    }

    const models = openRouterModelsCache.length
        ? openRouterModelsCache
        : [{ id: selectedId || DEFAULT_OPENROUTER_MODEL, name: selectedId || DEFAULT_OPENROUTER_MODEL }];

    const ids = new Set(models.map((model) => model.id));
    if (selectedId && !ids.has(selectedId)) {
        models.unshift({ id: selectedId, name: selectedId });
    }

    select.innerHTML = '';
    for (const model of models) {
        const option = document.createElement('option');
        option.value = model.id;
        option.textContent = model.name ? `${model.name} (${model.id})` : model.id;
        if (model.id === selectedId) {
            option.selected = true;
        }
        select.appendChild(option);
    }
}

async function refreshOpenRouterModels(showToast = false) {
    saveSettingsFromForm();
    const settings = getSettings();
    const key = settings.openRouterApiKey?.trim();
    if (!key) {
        toast('warning', 'Enter an OpenRouter API key first.');
        return;
    }

    try {
        const response = await fetch(`${OPENROUTER_BASE}/models`, {
            headers: {
                Authorization: `Bearer ${key}`,
            },
        });
        if (!response.ok) {
            throw new Error(`OpenRouter models request failed (${response.status})`);
        }
        const payload = await response.json();
        const list = Array.isArray(payload?.data) ? payload.data : [];
        openRouterModelsCache = list
            .map((model) => ({
                id: model.id,
                name: model.name || model.id,
            }))
            .filter((model) => model.id)
            .sort((a, b) => String(a.id).localeCompare(String(b.id)));
        populateModelSelect(settings.openRouterModel || DEFAULT_OPENROUTER_MODEL);
        if (showToast) {
            toast('success', `Loaded ${openRouterModelsCache.length} OpenRouter models.`);
        }
    } catch (err) {
        console.error(`[${EXTENSION_NAME}] failed to load OpenRouter models`, err);
        toast('error', err?.message || 'Could not load OpenRouter models.');
    }
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
    const toastEl = document.getElementById('pp-toast');

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

    if (toastEl && !toastEl.classList.contains('pp-hidden')) {
        pinElementToVisibleRect(toastEl, rect);
    } else {
        clearPinnedStyles(toastEl);
    }

    if (cluster && !cluster.classList.contains('pp-hidden')) {
        const isPhone = Math.min(rect.width, rect.height) < 700 || rect.width <= 900;
        const clusterWidth = isPhone ? 56 : 72;
        const clusterHeight = isPhone ? 56 : 72;
        const edge = Math.max(10, isPhone ? 12 : 16);
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
    const previous = select.value;

    select.innerHTML = '';

    if (!Array.isArray(names) || names.length === 0) {
        const option = document.createElement('option');
        option.value = '';
        option.textContent = 'No lorebooks found';
        select.appendChild(option);
        lorebookEntriesCache = [];
        populateExistingEntries();
        return;
    }

    for (const name of names) {
        const option = document.createElement('option');
        option.value = name;
        option.textContent = name;
        if (name === previous || (!previous && name === preferred)) {
            option.selected = true;
        }
        select.appendChild(option);
    }

    if (!select.value && names.length) {
        select.selectedIndex = 0;
    }

    populateExistingEntries();
}

function entryLabel(entry) {
    const comment = String(entry.comment || '').trim();
    if (comment) {
        return comment;
    }
    const key = Array.isArray(entry.key) ? entry.key.filter(Boolean).join(', ') : '';
    if (key) {
        return key;
    }
    const preview = String(entry.content || '').replace(/\s+/g, ' ').trim().slice(0, 48);
    return preview || `Entry ${entry.uid}`;
}

async function populateExistingEntries() {
    const select = document.getElementById('pp-existing-entry');
    const lorebook = document.getElementById('pp-lorebook')?.value.trim();
    const previous = select?.value;
    if (!select) {
        return;
    }

    select.innerHTML = '';
    lorebookEntriesCache = [];

    if (!lorebook) {
        const option = document.createElement('option');
        option.value = '';
        option.textContent = 'Choose a lorebook first';
        select.appendChild(option);
        return;
    }

    const context = getContext();
    if (typeof context.loadWorldInfo !== 'function') {
        const option = document.createElement('option');
        option.value = '';
        option.textContent = 'Lorebook API unavailable';
        select.appendChild(option);
        return;
    }

    try {
        const data = await context.loadWorldInfo(lorebook);
        const entries = Object.values(data?.entries || {})
            .filter((entry) => entry && entry.uid !== undefined && entry.uid !== null)
            .sort((a, b) => entryLabel(a).localeCompare(entryLabel(b)));
        lorebookEntriesCache = entries;

        if (!entries.length) {
            const option = document.createElement('option');
            option.value = '';
            option.textContent = 'No entries in this lorebook';
            select.appendChild(option);
            return;
        }

        for (const entry of entries) {
            const option = document.createElement('option');
            option.value = String(entry.uid);
            option.textContent = entryLabel(entry);
            if (String(entry.uid) === String(previous)) {
                option.selected = true;
            }
            select.appendChild(option);
        }
    } catch (err) {
        console.error(`[${EXTENSION_NAME}] failed to load lorebook entries`, err);
        const option = document.createElement('option');
        option.value = '';
        option.textContent = 'Failed to load entries';
        select.appendChild(option);
    }
}

function updateModeUi() {
    const mode = document.getElementById('pp-mode')?.value || 'create';
    const append = mode === 'append';
    document.getElementById('pp-create-fields')?.classList.toggle('pp-hidden', append);
    document.getElementById('pp-append-fields')?.classList.toggle('pp-hidden', !append);
    document.getElementById('pp-randomize')?.classList.toggle('pp-hidden', append);
    const openBtn = document.getElementById('pp-open');
    if (openBtn) {
        openBtn.textContent = append ? 'APPEND TO DARK WORLD' : 'OPEN DARK FOUNTAIN';
    }
    const title = document.getElementById('pp-title');
    if (title) {
        title.textContent = append ? 'EXPAND A DARK WORLD' : 'OPEN A DARK FOUNTAIN';
    }
    if (append) {
        populateExistingEntries();
    }
}

function pickRandom(list) {
    return list[Math.floor(Math.random() * list.length)];
}

function onRandomize() {
    const seed = pickRandom(RANDOM_SEEDS);
    document.getElementById('pp-mode').value = 'create';
    updateModeUi();
    document.getElementById('pp-name').value = '';
    document.getElementById('pp-location').value = seed.location;
    document.getElementById('pp-details').value = seed.details;
    document.getElementById('pp-guidelines').value = `${seed.guidelines}\nInvent freely. Surprise me with regions and motif.`;
    document.getElementById('pp-append-notes').value = '';
    setError('');
    // Let the AI fully invent from the random seed by opening immediately.
    document.getElementById('pp-dialog').requestSubmit();
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
    loadSettingsIntoForm();
    updateModeUi();
    settingsPanelOpen = false;
    document.getElementById('pp-settings-panel')?.classList.add('pp-hidden');
    document.getElementById('pp-main-panel')?.classList.remove('pp-hidden');
    document.getElementById('pp-main-actions')?.classList.remove('pp-hidden');
    const toggle = document.getElementById('pp-settings-toggle');
    if (toggle) {
        toggle.textContent = 'SETTINGS';
    }
    document.getElementById('pp-backdrop').classList.remove('pp-hidden');
    updateKnifeVisibility();
    syncFloatingUiToViewport();
    const mode = document.getElementById('pp-mode')?.value || 'create';
    if (mode === 'append') {
        document.getElementById('pp-existing-entry')?.focus();
    } else {
        document.getElementById('pp-location').focus();
    }
}

function closeDialog() {
    if (settingsPanelOpen) {
        saveSettingsFromForm();
        settingsPanelOpen = false;
        document.getElementById('pp-settings-panel')?.classList.add('pp-hidden');
        document.getElementById('pp-main-panel')?.classList.remove('pp-hidden');
        document.getElementById('pp-main-actions')?.classList.remove('pp-hidden');
        const toggle = document.getElementById('pp-settings-toggle');
        if (toggle) {
            toggle.textContent = 'SETTINGS';
        }
    }
    document.getElementById('pp-backdrop').classList.add('pp-hidden');
    syncFloatingUiToViewport();
    updateKnifeVisibility();
}

function readForm() {
    const mode = document.getElementById('pp-mode')?.value || 'create';
    return {
        mode,
        name: document.getElementById('pp-name').value.trim(),
        location: document.getElementById('pp-location').value.trim(),
        details: document.getElementById('pp-details').value.trim(),
        guidelines: document.getElementById('pp-guidelines').value.trim(),
        lorebook: document.getElementById('pp-lorebook').value.trim(),
        existingEntryUid: document.getElementById('pp-existing-entry')?.value.trim() || '',
        appendType: document.getElementById('pp-append-type')?.value || 'region',
        appendNotes: document.getElementById('pp-append-notes')?.value.trim() || '',
    };
}

function applyTemplate(template, values) {
    return String(template || '').replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key) => {
        return Object.prototype.hasOwnProperty.call(values, key) ? String(values[key] ?? '') : '';
    });
}

function buildCreatePrompts(form) {
    const settings = getSettings();
    const nameInstruction = form.name
        ? `Use this Dark World name exactly: ${form.name}`
        : 'Invent a fitting Dark World name from the location\'s objects, purpose, and atmosphere.';
    const guidelinesBlock = form.guidelines
        ? `Additional guidelines from the user:\n${form.guidelines}`
        : '';

    const systemPrompt = String(settings.systemPrompt || DEFAULT_SYSTEM_PROMPT).trim() || DEFAULT_SYSTEM_PROMPT;
    const userPrompt = applyTemplate(
        settings.userPromptTemplate || DEFAULT_USER_PROMPT_TEMPLATE,
        {
            name: form.name,
            location: form.location,
            details: form.details,
            guidelines: form.guidelines,
            name_instruction: nameInstruction,
            guidelines_block: guidelinesBlock,
        },
    ).replace(/\n{3,}/g, '\n\n').trim();

    return { systemPrompt, userPrompt };
}

function buildAppendPrompts(form, existingEntry) {
    const appendMeta = APPEND_TYPES[form.appendType] || APPEND_TYPES.region;
    const existingName = entryLabel(existingEntry);
    const systemPrompt = [
        'You expand an existing Deltarune-inspired Dark World World Info entry.',
        'Preserve the original voice: third person, encyclopedic, no dialogue, no markdown, no bullet lists.',
        'Return the COMPLETE updated entry text, not a diff and not only the new paragraph.',
        'Keep established facts unless the addition requires a light connective sentence.',
        appendMeta.instruction,
        'Respond with EXACTLY this format and nothing else:',
        'NAME: <Dark World name>',
        'KEYS: <comma-separated trigger keywords>',
        'ENTRY:',
        '<full updated lorebook prose>',
    ].join('\n');

    const userPrompt = [
        `Existing Dark World entry title/comment: ${existingName}`,
        `Append type: ${appendMeta.label}`,
        form.appendNotes ? `User notes for the addition:\n${form.appendNotes}` : 'User notes: invent a fitting addition.',
        form.guidelines ? `Additional guidelines:\n${form.guidelines}` : '',
        'Existing ENTRY content:',
        existingEntry.content || '(empty)',
        '',
        'Rewrite the full ENTRY with the addition woven in. Keep NAME aligned with the existing Dark World.',
    ].filter(Boolean).join('\n\n');

    return { systemPrompt, userPrompt };
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

async function generateViaOpenRouter(systemPrompt, userPrompt) {
    const settings = getSettings();
    const key = settings.openRouterApiKey?.trim();
    const model = settings.openRouterModel?.trim() || DEFAULT_OPENROUTER_MODEL;
    if (!key) {
        throw new Error('OpenRouter is enabled, but no API key is set.');
    }

    const response = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${key}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': window.location.origin || 'https://sillytavern.app',
            'X-Title': EXTENSION_NAME,
        },
        body: JSON.stringify({
            model,
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt },
            ],
            temperature: 0.85,
        }),
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
        const detail = payload?.error?.message || payload?.message || `HTTP ${response.status}`;
        throw new Error(`OpenRouter request failed: ${detail}`);
    }

    const content = payload?.choices?.[0]?.message?.content;
    if (Array.isArray(content)) {
        return content.map((part) => part?.text || part?.content || '').join('\n').trim();
    }
    return String(content || '').trim();
}

async function generateViaMainApi(systemPrompt, userPrompt) {
    const context = getContext();
    if (typeof context.generateRaw !== 'function') {
        throw new Error('This SillyTavern version does not expose generateRaw.');
    }
    return context.generateRaw({
        systemPrompt,
        prompt: userPrompt,
    });
}

async function generateDarkWorld(form, existingEntry = null) {
    saveSettingsFromForm();
    const settings = getSettings();
    const prompts = form.mode === 'append'
        ? buildAppendPrompts(form, existingEntry)
        : buildCreatePrompts(form);
    const raw = settings.useOpenRouter
        ? await generateViaOpenRouter(prompts.systemPrompt, prompts.userPrompt)
        : await generateViaMainApi(prompts.systemPrompt, prompts.userPrompt);

    const fallbackName = form.mode === 'append'
        ? entryLabel(existingEntry)
        : (form.name || form.location);
    const parsed = parseGeneration(raw, fallbackName, form.location || fallbackName);
    if (!parsed.content) {
        throw new Error('The selected API returned an empty Dark World.');
    }
    return parsed;
}

async function saveDarkWorldEntry(lorebook, entry, { appendUid = null } = {}) {
    const context = getContext();
    if (typeof context.loadWorldInfo !== 'function' || typeof context.saveWorldInfo !== 'function') {
        throw new Error('This SillyTavern version does not expose the lorebook API.');
    }

    const data = await context.loadWorldInfo(lorebook);
    if (!data) {
        throw new Error(`Could not load lorebook "${lorebook}".`);
    }

    if (appendUid !== null && appendUid !== undefined) {
        const key = (appendUid in (data.entries || {}))
            ? appendUid
            : (String(appendUid) in (data.entries || {}) ? String(appendUid) : null);
        if (key === null) {
            throw new Error('Could not find that lorebook entry to append to.');
        }
        const target = data.entries[key];
        target.content = entry.content;
        target.comment = entry.name || target.comment || '';
        target.key = uniqueKeys([
            ...(Array.isArray(target.key) ? target.key : []),
            ...entry.keys,
        ]);
        target.addMemo = true;
    } else {
        createWorldInfoEntry(data, entry);
    }

    await context.saveWorldInfo(lorebook, data, true);

    if (typeof context.reloadWorldInfoEditor === 'function') {
        context.reloadWorldInfoEditor(lorebook, true);
    }
    if (typeof context.updateWorldInfoList === 'function') {
        await context.updateWorldInfoList();
    }
}

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

async function playFountainOverlay({ skip = false } = {}) {
    const overlay = document.getElementById('pp-fountain-overlay');
    const video = document.getElementById('pp-fountain-video');
    const audio = document.getElementById('pp-fountain-audio');
    const hint = document.getElementById('pp-skip-hint');

    if (skip) {
        return {
            video,
            audio,
            skipped: true,
            usedFallbackAudio: false,
            firstPlay: Promise.resolve(),
            resolveSkip: null,
        };
    }

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
    if (settingsPanelOpen) {
        saveSettingsFromForm();
        setSettingsPanelOpen(false);
    }

    const form = readForm();

    if (!form.lorebook) {
        setError('Choose a lorebook.');
        return;
    }

    let existingEntry = null;
    let appendUid = null;
    if (form.mode === 'append') {
        if (!form.existingEntryUid) {
            setError('Choose an existing Dark World entry to append to.');
            return;
        }
        appendUid = Number(form.existingEntryUid);
        existingEntry = lorebookEntriesCache.find((entry) => Number(entry.uid) === appendUid) || null;
        if (!existingEntry) {
            // Cache may be stale; load once more.
            await populateExistingEntries();
            existingEntry = lorebookEntriesCache.find((entry) => Number(entry.uid) === appendUid) || null;
        }
        if (!existingEntry) {
            setError('Could not find that lorebook entry.');
            return;
        }
    } else if (!form.location) {
        setError('A location is required to open a Dark Fountain.');
        return;
    } else if (!form.details) {
        setError('Describe the Light World location.');
        return;
    }

    const settings = getSettings();
    if (settings.useOpenRouter && !settings.openRouterApiKey?.trim()) {
        setError('OpenRouter is enabled. Add an API key in SETTINGS.');
        setSettingsPanelOpen(true);
        return;
    }

    setError('');
    document.getElementById('pp-backdrop').classList.add('pp-hidden');
    syncFloatingUiToViewport();

    const openButton = document.getElementById('pp-open');
    const randomButton = document.getElementById('pp-randomize');
    openButton.disabled = true;
    if (randomButton) {
        randomButton.disabled = true;
    }

    let playback;
    try {
        playback = await playFountainOverlay({ skip: Boolean(settings.skipAnimation) });
        const generationPromise = generateDarkWorld(form, existingEntry);
        await playback.firstPlay.catch(() => {});
        const entry = await generationPromise;
        await saveDarkWorldEntry(form.lorebook, entry, { appendUid });

        if (form.mode === 'append') {
            const appendLabel = (APPEND_TYPES[form.appendType] || APPEND_TYPES.region).label;
            showThemedToast(`${appendLabel} inscribed into ${entry.name}.`, {
                title: '* The Dark World grows deeper.',
            });
        } else {
            showThemedToast(`${entry.name} rises from the darkness.`, {
                title: '* A Dark Fountain opens.',
            });
        }
    } catch (err) {
        console.error(`[${EXTENSION_NAME}] failed to open Dark Fountain`, err);
        toast('error', err?.message || 'Failed to open a Dark Fountain.');
    } finally {
        stopFountainOverlay(playback);
        openButton.disabled = false;
        if (randomButton) {
            randomButton.disabled = false;
        }
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
