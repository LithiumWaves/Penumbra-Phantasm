import { MODULE_NAME, EXTENSION_FOLDER, DEFAULT_SETTINGS, DEFAULT_MAIL_REPLY_PROMPT, DEFAULT_MAIL_FORCE_PROMPT, DEFAULT_MAIL_MEMORY_PROMPT, DEFAULT_MAIL_MEMORY_ENTRY, DEFAULT_MAIL_SEND_INSTRUCTIONS } from './lib/constants.js';
import { getSettings, saveSettings, getContext, toast } from './lib/settings.js';
import {
    initPhoneChrome,
    openPhone,
    closePhone,
    togglePhone,
    updateFabVisibility,
    refreshIfOpen,
    openInbox,
    isPhoneOpen,
} from './lib/phone.js';
import {
    registerEmailTool,
    updateMailPrompt,
    ingestEmailsFromMessage,
    receiveEmail,
    sendUserEmail,
    setMailReceivedHandler,
    setMailOpenHandler,
    resolveSpeakingContact,
} from './lib/email.js';
import { getActiveCharacterName } from './lib/store.js';
import { ensureNotifyHost } from './lib/notify.js';

const LOG = `[${MODULE_NAME}]`;

function bindSettingsUi() {
    const s = getSettings();
    $('#pp_enabled').prop('checked', s.enabled);
    $('#pp_show_chip').prop('checked', s.showMailChip !== false);
    $('#pp_show_fab').prop('checked', s.showFloatingButton);
    $('#pp_wand').prop('checked', s.showWandMenuItem);
    $('#pp_slash').prop('checked', s.enableSlashCommand);
    $('#pp_sound').prop('checked', s.soundEnabled);
    $('#pp_inject').prop('checked', s.injectPrompt);
    $('#pp_mail_memory_scope').val(s.mailMemoryScope === 'all' ? 'all' : 'speaker');
    $('#pp_mail_memory_max').val(s.mailMemoryMax ?? 6);
    $('#pp_mail_memory_preview').val(s.mailMemoryPreviewLength ?? 140);
    $('#pp_mail_memory_pos').val(s.mailMemoryPromptPosition ?? 1);
    $('#pp_mail_memory_depth').val(s.mailMemoryPromptDepth ?? 0);
    $('#pp_mail_memory_prompt').val(s.mailMemoryPrompt || DEFAULT_MAIL_MEMORY_PROMPT);
    $('#pp_mail_memory_entry').val(s.mailMemoryEntryTemplate || DEFAULT_MAIL_MEMORY_ENTRY);
    $('#pp_mail_memory_send').val(s.mailMemorySendInstructions ?? DEFAULT_MAIL_SEND_INSTRUCTIONS);
    $('#pp_inject_chat_mail').prop('checked', s.injectChatIntoMail !== false);
    $('#pp_chat_summary_n').val(s.chatSummaryMessages ?? 12);
    $('#pp_auto_open').prop('checked', s.autoOpenOnMail);
    $('#pp_notify_toast').prop('checked', s.notifyInChat);
    $('#pp_position').val(s.phonePosition || 'right');
    $('#pp_mail_backend').val(s.mailBackend || 'main');
    $('#pp_or_key').val(s.openRouterApiKey || '');
    $('#pp_or_model').val(s.openRouterModel || 'openai/gpt-4o-mini');
    $('#pp_mail_delay_min').val(s.mailReplyDelayMin ?? 3);
    $('#pp_mail_delay_max').val(s.mailReplyDelayMax ?? 8);
    $('#pp_mail_reply_prompt').val(s.mailReplyPrompt || DEFAULT_MAIL_REPLY_PROMPT);
    $('#pp_mail_force_prompt').val(s.mailForcePrompt || DEFAULT_MAIL_FORCE_PROMPT);
    syncOpenRouterFields();
    syncInjectFields();
}

function syncOpenRouterFields() {
    const useOr = String($('#pp_mail_backend').val() || 'main') === 'openrouter';
    $('.pp-openrouter-only').toggle(useOr);
}

function syncInjectFields() {
    const injectMail = Boolean($('#pp_inject').prop('checked'));
    const injectChat = Boolean($('#pp_inject_chat_mail').prop('checked'));
    $('.pp-inject-mail-only').toggle(injectMail);
    $('.pp-chat-summary-only').toggle(injectChat);
}

function onToggle(key, selector, after) {
    $(selector).on('input', () => {
        const s = getSettings();
        s[key] = Boolean($(selector).prop('checked'));
        saveSettings();
        if (typeof after === 'function') {
            after(s);
        }
    });
}

async function loadSettingsPanel() {
    try {
        const html = await $.get(`${EXTENSION_FOLDER}/settings.html`);
        $('#extensions_settings2').append(html);
    } catch (err) {
        console.warn(LOG, 'Failed to load settings.html, trying alternate path', err);
        try {
            const ctx = getContext();
            if (typeof ctx.renderExtensionTemplateAsync === 'function') {
                const html = await ctx.renderExtensionTemplateAsync('third-party/Penumbra-Phantasm', 'settings');
                $('#extensions_settings2').append(html);
            }
        } catch (err2) {
            console.error(LOG, 'Could not mount settings UI', err2);
            return;
        }
    }

    bindSettingsUi();

    onToggle('enabled', '#pp_enabled', (s) => {
        updateFabVisibility();
        updateMailPrompt();
        updateWandItem();
        if (!s.enabled && isPhoneOpen()) {
            closePhone();
        }
    });
    onToggle('showFloatingButton', '#pp_show_fab', () => updateFabVisibility());
    onToggle('showMailChip', '#pp_show_chip', () => updateFabVisibility());
    onToggle('showWandMenuItem', '#pp_wand', () => updateWandItem());
    onToggle('enableSlashCommand', '#pp_slash');
    onToggle('soundEnabled', '#pp_sound');
    onToggle('injectPrompt', '#pp_inject', () => {
        syncInjectFields();
        updateMailPrompt();
    });
    $('#pp_mail_memory_scope').on('change', () => {
        const s = getSettings();
        s.mailMemoryScope = String($('#pp_mail_memory_scope').val() || 'speaker') === 'all' ? 'all' : 'speaker';
        s.injectMailOwnOnly = s.mailMemoryScope !== 'all';
        saveSettings();
        updateMailPrompt();
    });
    const clampInt = (selector, key, min, max, fallback) => {
        $(selector).on('change', () => {
            const s = getSettings();
            let n = Number($(selector).val());
            if (!Number.isFinite(n)) {
                n = fallback;
            }
            n = Math.max(min, Math.min(max, Math.floor(n)));
            s[key] = n;
            $(selector).val(n);
            saveSettings();
            updateMailPrompt();
        });
    };
    clampInt('#pp_mail_memory_max', 'mailMemoryMax', 1, 40, 6);
    clampInt('#pp_mail_memory_preview', 'mailMemoryPreviewLength', 20, 500, 140);
    clampInt('#pp_mail_memory_pos', 'mailMemoryPromptPosition', 0, 10, 1);
    clampInt('#pp_mail_memory_depth', 'mailMemoryPromptDepth', 0, 99, 0);

    $('#pp_mail_memory_prompt').on('input', () => {
        const s = getSettings();
        const value = String($('#pp_mail_memory_prompt').val() || '').trim();
        s.mailMemoryPrompt = value || DEFAULT_MAIL_MEMORY_PROMPT;
        saveSettings();
        updateMailPrompt();
    });
    $('#pp_mail_memory_entry').on('input', () => {
        const s = getSettings();
        const value = String($('#pp_mail_memory_entry').val() || '').trim();
        s.mailMemoryEntryTemplate = value || DEFAULT_MAIL_MEMORY_ENTRY;
        saveSettings();
        updateMailPrompt();
    });
    $('#pp_mail_memory_send').on('input', () => {
        const s = getSettings();
        s.mailMemorySendInstructions = String($('#pp_mail_memory_send').val() || '');
        saveSettings();
        updateMailPrompt();
    });
    $('#pp_mail_memory_reset').on('click', () => {
        const s = getSettings();
        s.mailMemoryPrompt = DEFAULT_MAIL_MEMORY_PROMPT;
        s.mailMemoryEntryTemplate = DEFAULT_MAIL_MEMORY_ENTRY;
        s.mailMemorySendInstructions = DEFAULT_MAIL_SEND_INSTRUCTIONS;
        $('#pp_mail_memory_prompt').val(DEFAULT_MAIL_MEMORY_PROMPT);
        $('#pp_mail_memory_entry').val(DEFAULT_MAIL_MEMORY_ENTRY);
        $('#pp_mail_memory_send').val(DEFAULT_MAIL_SEND_INSTRUCTIONS);
        saveSettings();
        updateMailPrompt();
        toast('Mail memory templates reset', 'info');
    });
    onToggle('injectChatIntoMail', '#pp_inject_chat_mail', () => syncInjectFields());
    $('#pp_chat_summary_n').on('change', () => {
        const s = getSettings();
        let n = Number($('#pp_chat_summary_n').val());
        if (!Number.isFinite(n) || n < 1) {
            n = 1;
        }
        if (n > 40) {
            n = 40;
        }
        s.chatSummaryMessages = Math.floor(n);
        $('#pp_chat_summary_n').val(s.chatSummaryMessages);
        saveSettings();
    });
    onToggle('autoOpenOnMail', '#pp_auto_open');
    onToggle('notifyInChat', '#pp_notify_toast');

    $('#pp_position').on('change', () => {
        const s = getSettings();
        s.phonePosition = String($('#pp_position').val() || 'right');
        saveSettings();
        updateFabVisibility();
    });

    $('#pp_mail_backend').on('change', () => {
        const s = getSettings();
        s.mailBackend = String($('#pp_mail_backend').val() || 'main');
        saveSettings();
        syncOpenRouterFields();
    });
    $('#pp_or_key').on('input', () => {
        const s = getSettings();
        s.openRouterApiKey = String($('#pp_or_key').val() || '');
        saveSettings();
    });
    $('#pp_or_model').on('input', () => {
        const s = getSettings();
        s.openRouterModel = String($('#pp_or_model').val() || '').trim() || 'openai/gpt-4o-mini';
        saveSettings();
    });

    const clampDelay = () => {
        const s = getSettings();
        let min = Number($('#pp_mail_delay_min').val());
        let max = Number($('#pp_mail_delay_max').val());
        if (!Number.isFinite(min) || min < 0) {
            min = 0;
        }
        if (!Number.isFinite(max) || max < min) {
            max = min;
        }
        s.mailReplyDelayMin = min;
        s.mailReplyDelayMax = max;
        $('#pp_mail_delay_min').val(min);
        $('#pp_mail_delay_max').val(max);
        saveSettings();
    };
    $('#pp_mail_delay_min').on('change', clampDelay);
    $('#pp_mail_delay_max').on('change', clampDelay);

    $('#pp_mail_reply_prompt').on('input', () => {
        const s = getSettings();
        const value = String($('#pp_mail_reply_prompt').val() || '').trim();
        s.mailReplyPrompt = value || DEFAULT_MAIL_REPLY_PROMPT;
        saveSettings();
    });
    $('#pp_mail_prompt_reset').on('click', () => {
        const s = getSettings();
        s.mailReplyPrompt = DEFAULT_MAIL_REPLY_PROMPT;
        $('#pp_mail_reply_prompt').val(DEFAULT_MAIL_REPLY_PROMPT);
        saveSettings();
        toast('Mail reply prompt reset', 'info');
    });

    $('#pp_mail_force_prompt').on('input', () => {
        const s = getSettings();
        const value = String($('#pp_mail_force_prompt').val() || '').trim();
        s.mailForcePrompt = value || DEFAULT_MAIL_FORCE_PROMPT;
        saveSettings();
    });
    $('#pp_mail_force_reset').on('click', () => {
        const s = getSettings();
        s.mailForcePrompt = DEFAULT_MAIL_FORCE_PROMPT;
        $('#pp_mail_force_prompt').val(DEFAULT_MAIL_FORCE_PROMPT);
        saveSettings();
        toast('Forced mail prompt reset', 'info');
    });

    $('#pp_open_phone_btn').on('click', () => openPhone());
    $('#pp_test_mail_btn').on('click', async () => {
        await receiveEmail({
            from: getActiveCharacterName() || 'Unknown',
            subject: 'Test',
            body: 'Mail delivery check.',
            replyOptions: ['OK', 'Who?', 'Later'],
        });
        openInbox();
    });
}

function updateWandItem() {
    const s = getSettings();
    const existing = document.getElementById('pp-wand-item');
    const show = s.enabled && s.showWandMenuItem;
    if (!show) {
        existing?.remove();
        return;
    }
    if (existing) {
        return;
    }

    const wandRoot = document.getElementById('extensionsMenu');
    if (wandRoot) {
        const btn = document.createElement('div');
        btn.id = 'pp-wand-item';
        btn.className = 'list-group-item flex-container flexGap5';
        btn.title = 'Phone Trigger';
        btn.innerHTML = `<div class="fa-solid fa-mobile-screen-button extensionsMenuExtensionButton"></div><span>Phone Trigger</span>`;
        btn.addEventListener('click', () => openPhone());
        wandRoot.appendChild(btn);
        return;
    }

    console.debug(LOG, 'Extensions wand menu not found; floating button still available');
}

function registerSlashCommands() {
    const ctx = getContext();
    const Parser = ctx.SlashCommandParser;
    const SlashCommand = ctx.SlashCommand;
    const SlashCommandArgument = ctx.SlashCommandArgument;
    const SlashCommandNamedArgument = ctx.SlashCommandNamedArgument;
    const ARGUMENT_TYPE = ctx.ARGUMENT_TYPE;

    if (!Parser?.addCommandObject || !SlashCommand?.fromProps) {
        // Legacy fallback
        if (typeof ctx.registerSlashCommand === 'function') {
            ctx.registerSlashCommand('phone', () => {
                if (!getSettings().enableSlashCommand) {
                    return '';
                }
                togglePhone();
                return '';
            }, [], 'Toggle the phone UI', true, true);
            ctx.registerSlashCommand('mail', () => {
                if (!getSettings().enableSlashCommand) {
                    return '';
                }
                openInbox();
                return '';
            }, [], 'Open mail inbox', true, true);
        }
        return;
    }

    Parser.addCommandObject(SlashCommand.fromProps({
        name: 'phone',
        callback: () => {
            if (!getSettings().enableSlashCommand) {
                return 'Phone slash commands disabled';
            }
            togglePhone();
            return isPhoneOpen() ? 'Phone opened' : 'Phone closed';
        },
        aliases: ['phonetrigger'],
        helpString: 'Toggle Phone Trigger.',
    }));

    Parser.addCommandObject(SlashCommand.fromProps({
        name: 'mail',
        callback: () => {
            if (!getSettings().enableSlashCommand) {
                return 'Phone slash commands disabled';
            }
            openInbox();
            return 'Inbox opened';
        },
        aliases: ['email', 'inbox'],
        helpString: 'Open the phone e-mail inbox.',
    }));

    Parser.addCommandObject(SlashCommand.fromProps({
        name: 'mailsend',
        callback: async (namedArgs, unnamedArgs) => {
            if (!getSettings().enableSlashCommand) {
                return 'Phone slash commands disabled';
            }
            const subject = namedArgs.subject?.toString?.() || namedArgs.subject || 'Message';
            const body = unnamedArgs?.toString?.()?.trim() || '';
            if (!body) {
                return 'Usage: /mailsend subject="Hello" Your message here';
            }
            await sendUserEmail({
                subject: String(subject),
                body,
                requestReply: namedArgs.reply?.toString?.() !== 'off',
            });
            refreshIfOpen();
            return 'E-mail sent';
        },
        aliases: ['sendmail'],
        namedArgumentList: [
            SlashCommandNamedArgument.fromProps({
                name: 'subject',
                description: 'E-mail subject',
                typeList: [ARGUMENT_TYPE.STRING],
                defaultValue: 'Message',
            }),
            SlashCommandNamedArgument.fromProps({
                name: 'reply',
                description: 'Request an AI e-mail reply (on/off)',
                typeList: [ARGUMENT_TYPE.STRING],
                defaultValue: 'on',
                enumList: ['on', 'off'],
            }),
        ],
        unnamedArgumentList: [
            SlashCommandArgument.fromProps({
                description: 'E-mail body',
                typeList: [ARGUMENT_TYPE.STRING],
                isRequired: true,
            }),
        ],
        helpString: 'Send an e-mail from your phone (To defaults to active contact). AI reply is scheduled independently after a short delay.',
    }));
}

function registerEvents() {
    const ctx = getContext();
    const { eventSource, event_types } = ctx;
    if (!eventSource || !event_types) {
        console.warn(LOG, 'eventSource unavailable');
        return;
    }

    eventSource.on(event_types.APP_READY, () => {
        initPhoneChrome();
        updateFabVisibility();
        updateWandItem();
        updateMailPrompt();
    });

    eventSource.on(event_types.CHAT_CHANGED, () => {
        updateMailPrompt();
        refreshIfOpen();
    });

    eventSource.on(event_types.MESSAGE_RECEIVED, async (messageId) => {
        try {
            await ingestEmailsFromMessage(messageId);
            refreshIfOpen();
        } catch (err) {
            console.error(LOG, 'ingestEmailsFromMessage failed', err);
        }
    });

    // Refresh per-character mail injection before a generation when possible
    const refreshSpeakerMemory = (...args) => {
        try {
            const hint = args.find((a) => a && (typeof a === 'object' || typeof a === 'string')) || args[0];
            updateMailPrompt(resolveSpeakingContact(hint));
        } catch (err) {
            console.debug(LOG, 'mail memory refresh failed', err);
        }
    };
    if (event_types.GENERATION_STARTED) {
        eventSource.on(event_types.GENERATION_STARTED, refreshSpeakerMemory);
    }
    if (event_types.GENERATION_AFTER_COMMANDS) {
        eventSource.on(event_types.GENERATION_AFTER_COMMANDS, refreshSpeakerMemory);
    }
    if (event_types.GROUP_WRAPPER) {
        eventSource.on(event_types.GROUP_WRAPPER, refreshSpeakerMemory);
    }

    // Some ST versions emit CHARACTER_MESSAGE_RENDERED after DOM paint
    if (event_types.CHARACTER_MESSAGE_RENDERED) {
        eventSource.on(event_types.CHARACTER_MESSAGE_RENDERED, () => refreshIfOpen());
    }
}

setMailOpenHandler(() => openInbox());

setMailReceivedHandler((email) => {
    refreshIfOpen();
    updateFabVisibility();
    const s = getSettings();
    if (s.autoOpenOnMail) {
        openPhone('inbox');
    }
    console.debug(LOG, 'Mail received', email.id, email.subject);
});

jQuery(async () => {
    // Ensure defaults exist
    getSettings();
    Object.assign(getSettings(), {
        ...DEFAULT_SETTINGS,
        ...getSettings(),
    });

    ensureNotifyHost();
    await loadSettingsPanel();
    initPhoneChrome();
    updateFabVisibility();
    registerEmailTool();
    registerSlashCommands();
    registerEvents();
    updateMailPrompt();
    updateWandItem();

    // Retry wand item — menu may mount late
    setTimeout(updateWandItem, 1500);

    console.log(LOG, 'loaded');
});

export function onActivate() {
    getSettings();
    initPhoneChrome();
    updateFabVisibility();
    updateMailPrompt();
}
