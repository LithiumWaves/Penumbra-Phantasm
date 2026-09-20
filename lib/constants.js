/** @typedef {'home'|'mail'|'inbox'|'outbox'|'read'|'compose'|'settings'|'wallpaper'|'sounds'} PhoneScreen */

export const MODULE_NAME = 'Penumbra-Phantasm';
export const META_KEY = 'penumbra_phantasm';
export const PROMPT_KEY = 'penumbra_phantasm_mail';

export const EXTENSION_FOLDER = `scripts/extensions/third-party/${MODULE_NAME}`;

/** Built-in wallpapers (CSS backgrounds — no external assets required). */
export const WALLPAPERS = Object.freeze([
    {
        id: 'divergence',
        name: 'Divergence',
        css: 'linear-gradient(165deg, #0a1628 0%, #123048 42%, #0d3d4a 70%, #061018 100%)',
    },
    {
        id: 'labmem',
        name: 'Lab Mem',
        css: 'radial-gradient(ellipse at 30% 20%, #1a4a5c 0%, transparent 55%), radial-gradient(ellipse at 80% 90%, #3a1a28 0%, transparent 50%), linear-gradient(180deg, #0c1018, #141820)',
    },
    {
        id: 'crt',
        name: 'CRT Glow',
        css: 'repeating-linear-gradient(0deg, rgba(0,255,180,0.03) 0px, rgba(0,255,180,0.03) 1px, transparent 1px, transparent 3px), linear-gradient(180deg, #052018, #0a1820 60%, #041018)',
    },
    {
        id: 'night',
        name: 'Akihabara Night',
        css: 'linear-gradient(135deg, #1a0a14 0%, #2a1030 35%, #0e2038 70%, #081018 100%)',
    },
    {
        id: 'solid-teal',
        name: 'Solid Teal',
        css: '#0e3a42',
    },
]);

/** Built-in synth presets for ringtone / notification. */
export const SOUND_PRESETS = Object.freeze([
    { id: 'chirp', name: 'Chirp', kind: 'notify' },
    { id: 'ping', name: 'Ping', kind: 'notify' },
    { id: 'blip', name: 'Blip', kind: 'notify' },
    { id: 'ring-classic', name: 'Classic Ring', kind: 'ringtone' },
    { id: 'ring-soft', name: 'Soft Pulse', kind: 'ringtone' },
    { id: 'silent', name: 'Silent', kind: 'both' },
]);

export const DEFAULT_SETTINGS = Object.freeze({
    enabled: true,
    showFloatingButton: true,
    showWandMenuItem: true,
    enableSlashCommand: true,
    soundEnabled: true,
    injectPrompt: true,
    autoOpenOnMail: false,
    notifyInChat: true,
    wallpaperId: 'divergence',
    customWallpaperUrl: '',
    notificationSoundId: 'chirp',
    ringtoneId: 'ring-classic',
    customNotificationUrl: '',
    customRingtoneUrl: '',
    phonePosition: 'right',
});
