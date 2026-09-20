/** @typedef {'home'|'mail'|'inbox'|'outbox'|'read'|'compose'|'settings'|'wallpaper'|'sounds'} PhoneScreen */

export const MODULE_NAME = 'phone-trigger';
export const LEGACY_MODULE_NAME = 'Penumbra-Phantasm';
/** Repo folder name until the GitHub repo is renamed. */
export const EXTENSION_FOLDER = 'scripts/extensions/third-party/Penumbra-Phantasm';

export const META_KEY = 'phone_trigger';
export const LEGACY_META_KEY = 'penumbra_phantasm';
export const PROMPT_KEY = 'phone_trigger_mail';

/** Orbital / radar schematic like the VN standby screen. */
const ORBITAL_CSS = [
    '#061530',
    'radial-gradient(circle at 50% 48%, transparent 12%, rgba(220,235,255,0.2) 12.5%, transparent 13%)',
    'radial-gradient(circle at 50% 48%, transparent 22%, rgba(220,235,255,0.18) 22.5%, transparent 23%)',
    'radial-gradient(circle at 50% 48%, transparent 34%, rgba(220,235,255,0.14) 34.5%, transparent 35%)',
    'radial-gradient(circle at 50% 48%, transparent 48%, rgba(220,235,255,0.1) 48.5%, transparent 49%)',
    'linear-gradient(90deg, transparent 49.5%, rgba(220,235,255,0.22) 49.5%, rgba(220,235,255,0.22) 50.5%, transparent 50.5%)',
    'linear-gradient(0deg, transparent 47.5%, rgba(220,235,255,0.18) 47.5%, rgba(220,235,255,0.18) 52.5%, transparent 52.5%)',
    'linear-gradient(35deg, transparent 49.6%, rgba(200,220,255,0.12) 49.6%, rgba(200,220,255,0.12) 50.4%, transparent 50.4%)',
    'linear-gradient(145deg, transparent 49.6%, rgba(200,220,255,0.1) 49.6%, rgba(200,220,255,0.1) 50.4%, transparent 50.4%)',
    'radial-gradient(circle at 72% 28%, rgba(255,255,255,0.55) 0 1.2px, transparent 1.5px)',
    'radial-gradient(circle at 28% 62%, rgba(255,255,255,0.45) 0 1px, transparent 1.3px)',
    'radial-gradient(circle at 64% 70%, rgba(255,255,255,0.4) 0 1px, transparent 1.3px)',
    'radial-gradient(circle at 38% 30%, rgba(255,255,255,0.35) 0 0.8px, transparent 1.1px)',
].join(', ');

/** Built-in wallpapers (CSS backgrounds). */
export const WALLPAPERS = Object.freeze([
    {
        id: 'orbital',
        name: 'Orbital',
        css: ORBITAL_CSS,
    },
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
        id: 'night',
        name: 'Night',
        css: 'linear-gradient(135deg, #1a0a14 0%, #2a1030 35%, #0e2038 70%, #081018 100%)',
    },
    {
        id: 'solid',
        name: 'Solid',
        css: '#0a1a38',
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
    wallpaperId: 'orbital',
    customWallpaperUrl: '',
    notificationSoundId: 'chirp',
    ringtoneId: 'ring-classic',
    customNotificationUrl: '',
    customRingtoneUrl: '',
    phonePosition: 'right',
    /** @type {'main'|'openrouter'} */
    mailBackend: 'main',
    openRouterApiKey: '',
    openRouterModel: 'openai/gpt-4o-mini',
});

export const FLIP_MS = 680;
