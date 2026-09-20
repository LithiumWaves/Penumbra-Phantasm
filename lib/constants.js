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

/**
 * Editable template for independent mail reply generation.
 * Placeholders: {{char}} {{user}} {{subject}} {{body}} {{from}} {{to}}
 * {{description}} {{personality}} {{scenario}} {{char_card}} {{chat_summary}}
 */
export const DEFAULT_MAIL_REPLY_PROMPT = [
    'You compose a short e-mail reply for a Phone Trigger handset.',
    'Write ONLY the e-mail — no narration, no stage directions, no asterisks.',
    'Style: natural dialogue / personal messaging. Keep it concise (2–8 short sentences).',
    'You may optionally end with: REPLIES: option1 | option2 | option3',
    '',
    'You are {{char}}, writing from their phone.',
    '{{char_card}}',
    '',
    '{{chat_summary}}',
    '',
    'Compose a short e-mail reply.',
    '',
    'From: {{char}}',
    'To: {{user}}',
    'Regarding subject: {{subject}}',
    '',
    'Their message:',
    '{{body}}',
    '',
    'Format your response exactly as:',
    'SUBJECT: <subject line>',
    'BODY:',
    '<email body>',
].join('\n');

/**
 * Editable template for forced / unsolicited inbound mail (guided).
 * Placeholders: {{char}} {{user}} {{guidance}} {{subject}}
 * {{description}} {{personality}} {{scenario}} {{char_card}} {{chat_summary}}
 */
export const DEFAULT_MAIL_FORCE_PROMPT = [
    'You compose a short unsolicited e-mail for a Phone Trigger handset.',
    'Write ONLY the e-mail — no narration, no stage directions, no asterisks.',
    'Style: natural dialogue / personal messaging. Keep it concise (2–8 short sentences).',
    'You may optionally end with: REPLIES: option1 | option2 | option3',
    '',
    'You are {{char}}, writing from their phone to {{user}}.',
    '{{char_card}}',
    '',
    '{{chat_summary}}',
    '',
    'Author guidance (follow this intent; stay in character; do not quote the guidance):',
    '{{guidance}}',
    '',
    'Suggested subject focus (optional): {{subject}}',
    '',
    'Format your response exactly as:',
    'SUBJECT: <subject line>',
    'BODY:',
    '<email body>',
].join('\n');

/**
 * Editable template injected into the main chat when a character speaks.
 * Only mail to/from that character is listed (unless scope is "all").
 * Placeholders: {{char}} {{user}} {{inbox}} {{outbox}} {{mail_list}}
 * {{unread_count}} {{mail_count}} {{send_instructions}}
 */
export const DEFAULT_MAIL_MEMORY_PROMPT = [
    '[Phone Trigger — {{char}}\'s mail]',
    'These are private e-mails involving {{char}} and {{user}} only.',
    'Other characters do not know this mail unless they were on the thread.',
    'Treat them as {{char}}\'s phone memory — do not narrate checking the phone unless it fits.',
    '',
    '{{send_instructions}}',
    '',
    'Unread involving {{char}}: {{unread_count}}',
    '',
    'Inbox (to {{char}} / from others → {{user}} as relevant):',
    '{{inbox}}',
    '',
    'Outbox (from {{user}} → {{char}}):',
    '{{outbox}}',
].join('\n');

/** One line / block per mail in the memory injection. */
export const DEFAULT_MAIL_MEMORY_ENTRY = '- [{{status}}] {{from}} → {{to}} | {{subject}}: {{preview}}';

export const DEFAULT_MAIL_SEND_INSTRUCTIONS = [
    'To send mail you may either:',
    '1) Call the send_email function tool, OR',
    '2) Include: <email subject="Subject" replies="A|B|C">Body</email>',
].join('\n');

export const DEFAULT_SETTINGS = Object.freeze({
    enabled: true,
    showFloatingButton: true,
    showWandMenuItem: true,
    enableSlashCommand: true,
    soundEnabled: true,
    /**
     * When a character speaks, inject mail to/from them into the chat prompt.
     * Off by default.
     */
    injectPrompt: false,
    /**
     * @deprecated Kept for migration; speaker-scoped injection is always used when scope is "speaker".
     */
    injectMailOwnOnly: true,
    /**
     * Who's mail appears in the chat injection.
     * - speaker: only e-mails to/from the character currently speaking
     * - all: every mail in this chat (shared memory)
     * @type {'speaker'|'all'}
     */
    mailMemoryScope: 'speaker',
    /** Wrapper template for chat mail memory. */
    mailMemoryPrompt: DEFAULT_MAIL_MEMORY_PROMPT,
    /** Per-message line/block inside {{inbox}} / {{outbox}} / {{mail_list}}. */
    mailMemoryEntryTemplate: DEFAULT_MAIL_MEMORY_ENTRY,
    /** Optional send-tool blurb for {{send_instructions}}. */
    mailMemorySendInstructions: DEFAULT_MAIL_SEND_INSTRUCTIONS,
    /** Max inbox + outbox entries each when building memory. */
    mailMemoryMax: 6,
    /** Body preview length per entry. */
    mailMemoryPreviewLength: 140,
    /** SillyTavern extension prompt position (1 = in-chat). */
    mailMemoryPromptPosition: 1,
    /** SillyTavern extension prompt depth. */
    mailMemoryPromptDepth: 0,
    /**
     * Inject a short recent-chat summary into the independent mail reply prompt
     * so characters are aware of the current story.
     */
    injectChatIntoMail: true,
    /** How many recent chat messages to include in the mail-prompt summary. */
    chatSummaryMessages: 12,
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
    /** Full prompt template used for mail replies (independent of main chat). */
    mailReplyPrompt: DEFAULT_MAIL_REPLY_PROMPT,
    /** Prompt template for forced / guided inbound mail. */
    mailForcePrompt: DEFAULT_MAIL_FORCE_PROMPT,
    /** Minimum delay before a character replies (seconds). */
    mailReplyDelayMin: 3,
    /** Maximum delay before a character replies (seconds). */
    mailReplyDelayMax: 8,
});

export const FLIP_MS = 680;
