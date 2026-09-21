import { DEFAULT_SETTINGS, MODULE_NAME, LEGACY_MODULE_NAME } from './constants.js';

export function getContext() {
    return SillyTavern.getContext();
}

export function getSettingsStore() {
    const ctx = getContext();
    return ctx?.extensionSettings ?? window.extension_settings ?? {};
}

export function getSettings() {
    const store = getSettingsStore();

    if (!store[MODULE_NAME] && store[LEGACY_MODULE_NAME]) {
        store[MODULE_NAME] = structuredClone(store[LEGACY_MODULE_NAME]);
    }

    if (!store[MODULE_NAME]) {
        store[MODULE_NAME] = structuredClone(DEFAULT_SETTINGS);
    }

    // Migrate old "own only" checkbox → scope before filling new defaults
    if (!Object.hasOwn(store[MODULE_NAME], 'mailMemoryScope')
        && Object.hasOwn(store[MODULE_NAME], 'injectMailOwnOnly')) {
        store[MODULE_NAME].mailMemoryScope = store[MODULE_NAME].injectMailOwnOnly === false ? 'all' : 'speaker';
    }

    for (const key of Object.keys(DEFAULT_SETTINGS)) {
        if (!Object.hasOwn(store[MODULE_NAME], key)) {
            store[MODULE_NAME][key] = DEFAULT_SETTINGS[key];
        }
    }

    // Prefer orbital standby if still on removed teal preset
    if (store[MODULE_NAME].wallpaperId === 'solid-teal' || store[MODULE_NAME].wallpaperId === 'crt') {
        store[MODULE_NAME].wallpaperId = 'orbital';
    }

    // Keep legacy injectWorldline in sync with dmailWorldline
    if (!Object.hasOwn(store[MODULE_NAME], 'dmailWorldline')
        && Object.hasOwn(store[MODULE_NAME], 'injectWorldline')) {
        store[MODULE_NAME].dmailWorldline = store[MODULE_NAME].injectWorldline !== false;
    }
    store[MODULE_NAME].injectWorldline = store[MODULE_NAME].dmailWorldline !== false;

    return store[MODULE_NAME];
}

export function saveSettings() {
    const ctx = getContext();
    const fn = ctx?.saveSettingsDebounced ?? window.saveSettingsDebounced;
    if (typeof fn === 'function') {
        fn();
    }
}

export { toast, notifyIncomingMail, ensureNotifyHost } from './notify.js';
