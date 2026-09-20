import { DEFAULT_SETTINGS, MODULE_NAME } from './constants.js';

export function getContext() {
    return SillyTavern.getContext();
}

export function getSettingsStore() {
    const ctx = getContext();
    return ctx?.extensionSettings ?? window.extension_settings ?? {};
}

export function getSettings() {
    const store = getSettingsStore();
    if (!store[MODULE_NAME]) {
        store[MODULE_NAME] = structuredClone(DEFAULT_SETTINGS);
    }
    for (const key of Object.keys(DEFAULT_SETTINGS)) {
        if (!Object.hasOwn(store[MODULE_NAME], key)) {
            store[MODULE_NAME][key] = DEFAULT_SETTINGS[key];
        }
    }
    return store[MODULE_NAME];
}

export function saveSettings() {
    const ctx = getContext();
    const fn = ctx?.saveSettingsDebounced ?? window.saveSettingsDebounced;
    if (typeof fn === 'function') {
        fn();
    }
}

export function toast(message, type = 'info', title = 'Phone') {
    if (typeof toastr === 'undefined') {
        console.log(`[${MODULE_NAME}] ${title}: ${message}`);
        return;
    }
    const fn = toastr[type] || toastr.info;
    fn(message, title);
}
