/** @typedef {'home'|'mail'|'inbox'|'outbox'|'read'|'compose'|'settings'|'wallpaper'|'sounds'|'memory'|'dmail'|'dmail-propose'|'dmail-lore'|'dmail-card'|'call-dial'|'call'|'call-memory'} PhoneScreen */

export const MODULE_NAME = 'phone-trigger';
export const LEGACY_MODULE_NAME = 'Penumbra-Phantasm';
/** Installed folder under scripts/extensions/third-party/ (matches GitHub repo). */
export const EXTENSION_FOLDER = 'scripts/extensions/third-party/Phone-Trigger';
/** Previous install folder name — still tried for assets/settings fallback. */
export const LEGACY_EXTENSION_FOLDER = 'scripts/extensions/third-party/Penumbra-Phantasm';

export const META_KEY = 'phone_trigger';
export const LEGACY_META_KEY = 'penumbra_phantasm';
export const PROMPT_KEY = 'phone_trigger_mail';
export const CALL_PROMPT_KEY = 'phone_trigger_call';
/** Marker comments — stripped on smooth rewrite; no longer appended. */
export const WORLDLINE_CARD_START = '⟦Phone Trigger Worldline⟧';
export const WORLDLINE_CARD_END = '⟦/Phone Trigger Worldline⟧';
/** Default lorebook name when Apply creates a dedicated book. */
export const WORLDLINE_LOREBOOK_NAME = 'Phone Trigger Worldline';
export const WORLDLINE_LOREBOOK_COMMENT = 'Phone Trigger · always-on worldline';

/** Default call-memory inject template. */
export const DEFAULT_CALL_MEMORY_PROMPT = [
    '[Phone Trigger — call memory]',
    '{{call_list}}',
].join('\n');

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

/**
 * Editable template for character-initiative (unsolicited) inbound mail.
 * Placeholders match forced mail: {{char}} {{user}} {{guidance}} {{subject}}
 * {{description}} {{personality}} {{scenario}} {{char_card}} {{chat_summary}}
 */
export const DEFAULT_MAIL_INITIATIVE_PROMPT = [
    'You compose a short unsolicited e-mail for a Phone Trigger handset.',
    'This is character initiative — {{char}} decided on their own to write {{user}},',
    'the way people spontaneously mail each other in Steins;Gate.',
    'Write ONLY the e-mail — no narration, no stage directions, no asterisks.',
    'Style: natural dialogue / personal messaging. Keep it concise (2–8 short sentences).',
    'You may optionally end with: REPLIES: option1 | option2 | option3',
    '',
    'You are {{char}}, writing from their phone to {{user}}.',
    '{{char_card}}',
    '',
    '{{chat_summary}}',
    '',
    'Optional mood / topic hint (follow if present; stay in character; do not quote it):',
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
 * Editable template for live phone-call turns (handset UI, not main chat).
 * Placeholders: {{char}} {{user}} {{transcript}} {{last_user}} {{guidance}}
 * {{description}} {{personality}} {{scenario}} {{char_card}} {{chat_summary}}
 */
export const DEFAULT_CALL_PROMPT = [
    'You are on a live phone call inside a Phone Trigger handset UI.',
    'You are {{char}}, speaking to {{user}} over the phone.',
    'Reply with ONLY what {{char}} says aloud — no narration, no stage directions, no asterisks, no quotation marks around the whole line.',
    'Keep it conversational and concise (1–4 short sentences). Sound like a phone call, not an essay.',
    '',
    '{{char_card}}',
    '',
    '{{chat_summary}}',
    '',
    'Optional mood / topic hint (follow if present; do not quote it):',
    '{{guidance}}',
    '',
    'Call so far:',
    '{{transcript}}',
    '',
    '{{user}} just said:',
    '{{last_user}}',
    '',
    'Respond as {{char}} on the call now:',
].join('\n');

export const DEFAULT_SETTINGS = Object.freeze({
    enabled: true,
    /** Compact MAIL chip — primary launcher (draggable). Hide via settings if undesired. */
    showMailChip: true,
    /** True after the user has dragged the chip at least once. */
    mailChipPlaced: false,
    /** Chip left edge as % of viewport width (0–100). */
    mailChipX: null,
    /** Chip top edge as % of viewport height (0–100). */
    mailChipY: null,
    showWandMenuItem: true,
    enableSlashCommand: true,
    soundEnabled: true,
    /**
     * When a character speaks, inject mail to/from them into the chat prompt.
     * Off by default.
     */
    injectPrompt: false,
    /**
     * After a D-Mail to PhoneWave (name subject to change), inject worldline facts into chat.
     * @deprecated Prefer dmailWorldline; kept in sync for older settings panels.
     */
    injectWorldline: true,
    /** Play divergence meter / distortion spectacle when sending a D-Mail. */
    dmailSpectacle: true,
    /** Inject quiet worldline facts into the chat prompt after a D-Mail. */
    dmailWorldline: true,
    /** After spectacle, open an in-phone Propose screen to review/edit the fact first. */
    dmailPropose: false,
    /** Write accepted facts via optional lorebook + optional smooth card rewrite (confirm screens). */
    dmailApply: false,
    /** When Apply is on, offer a lorebook confirm (skip-able). */
    dmailApplyLorebook: true,
    /** When Apply is on, offer a smooth character-card rewrite confirm (skip-able). */
    dmailApplyCard: true,
    /** Lorebook file name Apply writes into (picker / create-if-missing). */
    dmailLorebookName: WORLDLINE_LOREBOOK_NAME,
    /** Extension prompt depth for worldline overlay (nearer recent turns when higher). */
    worldlinePromptDepth: 2,
    /**
     * Show PhoneWave (name subject to change) in the To: picker.
     * Off = plain mail-only mode (no D-Mail contact).
     */
    showPhoneWave: true,
    /**
     * @deprecated Kept for migration; speaker-scoped injection is always used when scope is "speaker".
     */
    injectMailOwnOnly: true,
    /**
     * Who's mail appears in the chat injection when a character has no manual picks.
     * - speaker: e-mails to/from the speaking character (auto)
     * - all: every mail in this chat
     * Manual picks on the phone Memory screen always override for that character.
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

    // —— Character initiative (unsolicited mail) ——
    /** Master switch — off by default so it never surprises. */
    mailInitiativeEnabled: false,
    /** Seconds between initiative checks (min). */
    mailInitiativeIntervalMin: 180,
    /** Seconds between initiative checks (max). */
    mailInitiativeIntervalMax: 480,
    /** Probability (0–1) that a check actually sends mail. */
    mailInitiativeChance: 0.25,
    /** Extra seconds after enable / chat change before the first eligible check. */
    mailInitiativeStartupGraceSec: 90,
    /** Minimum seconds after a successful initiative send before another can fire. */
    mailInitiativeCooldownSec: 300,
    /** Require recent chat quiet time before sending. */
    mailInitiativeOnlyWhenIdle: true,
    /** Seconds since last chat activity to count as idle. */
    mailInitiativeIdleSeconds: 60,
    /** Skip while SillyTavern is generating. */
    mailInitiativePauseDuringGeneration: true,
    /** Skip while the Phone Trigger handset dialog is open. */
    mailInitiativePauseWhilePhoneOpen: true,
    /** Skip when the browser tab is hidden. */
    mailInitiativeRequireTabVisible: true,
    /** Max successful initiative mails in any rolling 60 minutes (0 = unlimited). */
    mailInitiativeMaxPerHour: 2,
    /** Max successful initiative mails in any rolling 24 hours (0 = unlimited). */
    mailInitiativeMaxPerDay: 6,
    /** Do not queue a new initiative job if this many force/initiative jobs are already pending. */
    mailInitiativeMaxPending: 1,
    /** Skip if the inbox has any unread mail. */
    mailInitiativeSkipIfUnread: false,
    /** Skip if the chosen sender already has unread mail to the user. */
    mailInitiativeSkipIfUnreadFromSender: true,
    /**
     * Who may initiate.
     * - active: only the active solo / speaking chat character
     * - all: any non-PhoneWave contact in this chat (group members)
     * - weighted: prefer active (~70%), else another chat contact
     * @type {'active'|'all'|'weighted'}
     */
    mailInitiativeContacts: 'active',
    /** Soft quiet hours (local clock) — no initiative while inside the window. */
    mailInitiativeQuietHoursEnabled: false,
    /** Quiet-hours start hour (0–23, inclusive). */
    mailInitiativeQuietStart: 23,
    /** Quiet-hours end hour (0–23, exclusive). Wraps past midnight. */
    mailInitiativeQuietEnd: 8,
    /** Optional mood/topic hint for auto sends (fed as {{guidance}}). */
    mailInitiativeGuidance: '',
    /**
     * Prompt for initiative mail. Empty → use DEFAULT_MAIL_INITIATIVE_PROMPT.
     * Set mailInitiativeUseForcePrompt to reuse the Forced mail template instead.
     */
    mailInitiativePrompt: DEFAULT_MAIL_INITIATIVE_PROMPT,
    /** When true, ignore mailInitiativePrompt and reuse mailForcePrompt. */
    mailInitiativeUseForcePrompt: false,

    // —— Phone calls (Presence-less: talk in the handset UI) ——
    /** Master switch for the call feature. */
    callEnabled: true,
    /** Max prior turns fed into the call reply prompt. */
    callContextTurns: 16,
    /** Brief “dialing…” delay before connected (ms). */
    callDialDelayMs: 900,
    /** Optional topic/mood hint for the callee ({{guidance}}). */
    callGuidance: '',
    /** Prompt template for in-call character turns. */
    callPrompt: DEFAULT_CALL_PROMPT,
    /**
     * How call lines are generated.
     * - unique: isolated call prompt (generateRaw / OpenRouter mail backend)
     * - main: SillyTavern chat completion presets via generateQuietPrompt
     * - both: quiet prompt = full unique call template (presets + call prompt together)
     * @type {'unique'|'main'|'both'}
     */
    callGenerationMode: 'unique',
    /** Play synth / video audio during D-Mail spectacle. */
    dmailSpectacleSound: true,

    // —— Call initiative (incoming rings) ——
    /** Characters may call the user unsolicited. Off by default. */
    callInitiativeEnabled: false,
    callInitiativeIntervalMin: 240,
    callInitiativeIntervalMax: 600,
    callInitiativeChance: 0.2,
    callInitiativeStartupGraceSec: 120,
    callInitiativeCooldownSec: 420,
    callInitiativeOnlyWhenIdle: true,
    callInitiativeIdleSeconds: 90,
    callInitiativePauseDuringGeneration: true,
    callInitiativePauseWhilePhoneOpen: false,
    callInitiativeRequireTabVisible: true,
    callInitiativeMaxPerHour: 1,
    callInitiativeMaxPerDay: 4,
    /** Skip if already on a call / ringing. */
    callInitiativeSkipIfBusy: true,
    /**
     * Who may call.
     * @type {'active'|'all'|'weighted'}
     */
    callInitiativeContacts: 'active',
    callInitiativeQuietHoursEnabled: false,
    callInitiativeQuietStart: 23,
    callInitiativeQuietEnd: 8,
    /** Seconds to ring before auto-decline (0 = ring until answered/declined). */
    callInitiativeRingTimeoutSec: 45,
    /** Open the handset when an incoming call starts. */
    callInitiativeAutoOpen: true,
    /** Optional mood hint for who is calling / why (future first line). */
    callInitiativeGuidance: '',

    // —— Call memory (persist / inject / summarize) ——
    /** Inject recent call summaries into the main chat prompt. */
    injectCallMemory: false,
    /** Max stored call records kept in chat metadata. */
    callMemoryMax: 8,
    /** Max call entries injected into the prompt. */
    callMemoryInjectMax: 4,
    /** After hang-up, LLM-summarize the call and keep summary (drops full turns for tokens). */
    callSummarizeOnEnd: false,
    /** Wrapper template for call memory inject. Placeholders: {{call_list}} {{char}} {{user}} */
    callMemoryPrompt: DEFAULT_CALL_MEMORY_PROMPT,
    /** SillyTavern extension prompt position for call memory. */
    callMemoryPromptPosition: 1,
    /** SillyTavern extension prompt depth for call memory. */
    callMemoryPromptDepth: 1,
});

export const FLIP_MS = 680;
