import { MODULE_NAME, EXTENSION_FOLDER, LEGACY_EXTENSION_FOLDER, DEFAULT_SETTINGS, DEFAULT_MAIL_REPLY_PROMPT, DEFAULT_MAIL_FORCE_PROMPT, DEFAULT_MAIL_INITIATIVE_PROMPT, DEFAULT_MAIL_MEMORY_PROMPT, DEFAULT_MAIL_MEMORY_ENTRY, DEFAULT_MAIL_SEND_INSTRUCTIONS } from './lib/constants.js';
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
    resetMailChipPosition,
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
import { updateWorldlinePrompt } from './lib/dmail.js';
import {
    syncInitiativeScheduler,
    noteInitiativeActivity,
    setInitiativeGenerationBusy,
    tryInitiativeMail,
} from './lib/initiative.js';

const LOG = `[${MODULE_NAME}]`;

function bindSettingsUi() {
    const s = getSettings();
    $('#pp_enabled').prop('checked', s.enabled);
    $('#pp_show_chip').prop('checked', s.showMailChip !== false);
    $('#pp_wand').prop('checked', s.showWandMenuItem);
    $('#pp_slash').prop('checked', s.enableSlashCommand);
    $('#pp_sound').prop('checked', s.soundEnabled);
    $('#pp_inject').prop('checked', s.injectPrompt);
    $('#pp_inject_worldline').prop('checked', s.dmailWorldline !== false);
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
    $('#pp_mail_backend').val(s.mailBackend || 'main');
    $('#pp_or_key').val(s.openRouterApiKey || '');
    $('#pp_or_model').val(s.openRouterModel || 'openai/gpt-4o-mini');
    $('#pp_mail_delay_min').val(s.mailReplyDelayMin ?? 3);
    $('#pp_mail_delay_max').val(s.mailReplyDelayMax ?? 8);
    $('#pp_mail_reply_prompt').val(s.mailReplyPrompt || DEFAULT_MAIL_REPLY_PROMPT);
    $('#pp_mail_force_prompt').val(s.mailForcePrompt || DEFAULT_MAIL_FORCE_PROMPT);

    $('#pp_initiative_enabled').prop('checked', Boolean(s.mailInitiativeEnabled));
    $('#pp_initiative_interval_min').val(s.mailInitiativeIntervalMin ?? 180);
    $('#pp_initiative_interval_max').val(s.mailInitiativeIntervalMax ?? 480);
    $('#pp_initiative_chance').val(Math.round(clampChancePct(s.mailInitiativeChance)));
    $('#pp_initiative_grace').val(s.mailInitiativeStartupGraceSec ?? 90);
    $('#pp_initiative_cooldown').val(s.mailInitiativeCooldownSec ?? 300);
    $('#pp_initiative_max_hour').val(s.mailInitiativeMaxPerHour ?? 2);
    $('#pp_initiative_max_day').val(s.mailInitiativeMaxPerDay ?? 6);
    $('#pp_initiative_max_pending').val(s.mailInitiativeMaxPending ?? 1);
    $('#pp_initiative_idle').prop('checked', s.mailInitiativeOnlyWhenIdle !== false);
    $('#pp_initiative_idle_sec').val(s.mailInitiativeIdleSeconds ?? 60);
    $('#pp_initiative_pause_gen').prop('checked', s.mailInitiativePauseDuringGeneration !== false);
    $('#pp_initiative_pause_phone').prop('checked', s.mailInitiativePauseWhilePhoneOpen !== false);
    $('#pp_initiative_tab').prop('checked', s.mailInitiativeRequireTabVisible !== false);
    $('#pp_initiative_skip_unread').prop('checked', Boolean(s.mailInitiativeSkipIfUnread));
    $('#pp_initiative_skip_unread_sender').prop('checked', s.mailInitiativeSkipIfUnreadFromSender !== false);
    $('#pp_initiative_contacts').val(
        ['active', 'all', 'weighted'].includes(s.mailInitiativeContacts) ? s.mailInitiativeContacts : 'active',
    );
    $('#pp_initiative_quiet').prop('checked', Boolean(s.mailInitiativeQuietHoursEnabled));
    $('#pp_initiative_quiet_start').val(s.mailInitiativeQuietStart ?? 23);
    $('#pp_initiative_quiet_end').val(s.mailInitiativeQuietEnd ?? 8);
    $('#pp_initiative_guidance').val(s.mailInitiativeGuidance || '');
    $('#pp_initiative_use_force').prop('checked', Boolean(s.mailInitiativeUseForcePrompt));
    $('#pp_initiative_prompt').val(s.mailInitiativePrompt || DEFAULT_MAIL_INITIATIVE_PROMPT);

    syncOpenRouterFields();
    syncInjectFields();
    syncChipFields();
    syncInitiativeFields();
}

function clampChancePct(chance) {
    const n = Number(chance);
    if (!Number.isFinite(n)) {
        return 25;
    }
    return Math.max(0, Math.min(100, n <= 1 ? n * 100 : n));
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

function syncChipFields() {
    const showChip = Boolean($('#pp_show_chip').prop('checked'));
    $('.pp-chip-only').toggle(showChip);
}

function syncInitiativeFields() {
    const on = Boolean($('#pp_initiative_enabled').prop('checked'));
    $('.pp-initiative-only').toggle(on);
    const idle = Boolean($('#pp_initiative_idle').prop('checked'));
    $('.pp-initiative-idle-only').toggle(on && idle);
    const quiet = Boolean($('#pp_initiative_quiet').prop('checked'));
    $('.pp-initiative-quiet-only').toggle(on && quiet);
    const useForce = Boolean($('#pp_initiative_use_force').prop('checked'));
    $('.pp-initiative-prompt-only').toggle(on && !useForce);
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
        let html = '';
        try {
            html = await $.get(`${EXTENSION_FOLDER}/settings.html`);
        } catch {
            html = await $.get(`${LEGACY_EXTENSION_FOLDER}/settings.html`);
        }
        $('#extensions_settings2').append(html);
    } catch (err) {
        console.warn(LOG, 'Failed to load settings.html, trying alternate path', err);
        try {
            const ctx = getContext();
            if (typeof ctx.renderExtensionTemplateAsync === 'function') {
                let html = '';
                try {
                    html = await ctx.renderExtensionTemplateAsync('third-party/Phone-Trigger', 'settings');
                } catch {
                    html = await ctx.renderExtensionTemplateAsync('third-party/Penumbra-Phantasm', 'settings');
                }
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
        syncInitiativeScheduler();
    });
    onToggle('showMailChip', '#pp_show_chip', () => {
        syncChipFields();
        updateFabVisibility();
    });
    $('#pp_chip_reset').on('click', () => {
        resetMailChipPosition();
        toast('Chip position reset', 'info');
    });
    onToggle('showWandMenuItem', '#pp_wand', () => updateWandItem());
    onToggle('enableSlashCommand', '#pp_slash');
    onToggle('soundEnabled', '#pp_sound');
    onToggle('injectPrompt', '#pp_inject', () => {
        syncInjectFields();
        updateMailPrompt();
    });
    onToggle('dmailWorldline', '#pp_inject_worldline', (s) => {
        s.injectWorldline = s.dmailWorldline !== false;
        saveSettings();
        if (s.dmailWorldline === false) {
            try {
                const ctx = getContext();
                ctx.setExtensionPrompt?.('phone_trigger_worldline', '', 1, 0);
            } catch {
                /* ignore */
            }
        } else {
            updateWorldlinePrompt();
        }
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

    // —— Character initiative ——
    onToggle('mailInitiativeEnabled', '#pp_initiative_enabled', () => {
        syncInitiativeFields();
        syncInitiativeScheduler();
    });
    const clampInitiativeInt = (selector, key, min, max, fallback, after) => {
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
            if (typeof after === 'function') {
                after(s);
            }
        });
    };
    const restartInitiative = () => syncInitiativeScheduler();
    const clampInitiativePair = () => {
        const s = getSettings();
        let min = Number($('#pp_initiative_interval_min').val());
        let max = Number($('#pp_initiative_interval_max').val());
        if (!Number.isFinite(min) || min < 30) {
            min = 30;
        }
        if (!Number.isFinite(max) || max < min) {
            max = min;
        }
        s.mailInitiativeIntervalMin = Math.floor(min);
        s.mailInitiativeIntervalMax = Math.floor(max);
        $('#pp_initiative_interval_min').val(s.mailInitiativeIntervalMin);
        $('#pp_initiative_interval_max').val(s.mailInitiativeIntervalMax);
        saveSettings();
        restartInitiative();
    };
    $('#pp_initiative_interval_min').on('change', clampInitiativePair);
    $('#pp_initiative_interval_max').on('change', clampInitiativePair);
    $('#pp_initiative_chance').on('change', () => {
        const s = getSettings();
        let pct = Number($('#pp_initiative_chance').val());
        if (!Number.isFinite(pct)) {
            pct = 25;
        }
        pct = Math.max(0, Math.min(100, Math.round(pct)));
        s.mailInitiativeChance = pct / 100;
        $('#pp_initiative_chance').val(pct);
        saveSettings();
    });
    clampInitiativeInt('#pp_initiative_grace', 'mailInitiativeStartupGraceSec', 0, 3600, 90, restartInitiative);
    clampInitiativeInt('#pp_initiative_cooldown', 'mailInitiativeCooldownSec', 0, 7200, 300);
    clampInitiativeInt('#pp_initiative_max_hour', 'mailInitiativeMaxPerHour', 0, 60, 2);
    clampInitiativeInt('#pp_initiative_max_day', 'mailInitiativeMaxPerDay', 0, 200, 6);
    clampInitiativeInt('#pp_initiative_max_pending', 'mailInitiativeMaxPending', 0, 5, 1);
    onToggle('mailInitiativeOnlyWhenIdle', '#pp_initiative_idle', () => syncInitiativeFields());
    clampInitiativeInt('#pp_initiative_idle_sec', 'mailInitiativeIdleSeconds', 0, 3600, 60);
    onToggle('mailInitiativePauseDuringGeneration', '#pp_initiative_pause_gen');
    onToggle('mailInitiativePauseWhilePhoneOpen', '#pp_initiative_pause_phone');
    onToggle('mailInitiativeRequireTabVisible', '#pp_initiative_tab');
    onToggle('mailInitiativeSkipIfUnread', '#pp_initiative_skip_unread');
    onToggle('mailInitiativeSkipIfUnreadFromSender', '#pp_initiative_skip_unread_sender');
    $('#pp_initiative_contacts').on('change', () => {
        const s = getSettings();
        const v = String($('#pp_initiative_contacts').val() || 'active');
        s.mailInitiativeContacts = ['active', 'all', 'weighted'].includes(v) ? v : 'active';
        saveSettings();
    });
    onToggle('mailInitiativeQuietHoursEnabled', '#pp_initiative_quiet', () => syncInitiativeFields());
    clampInitiativeInt('#pp_initiative_quiet_start', 'mailInitiativeQuietStart', 0, 23, 23);
    clampInitiativeInt('#pp_initiative_quiet_end', 'mailInitiativeQuietEnd', 0, 23, 8);
    $('#pp_initiative_guidance').on('input', () => {
        const s = getSettings();
        s.mailInitiativeGuidance = String($('#pp_initiative_guidance').val() || '');
        saveSettings();
    });
    onToggle('mailInitiativeUseForcePrompt', '#pp_initiative_use_force', () => syncInitiativeFields());
    $('#pp_initiative_prompt').on('input', () => {
        const s = getSettings();
        const value = String($('#pp_initiative_prompt').val() || '').trim();
        s.mailInitiativePrompt = value || DEFAULT_MAIL_INITIATIVE_PROMPT;
        saveSettings();
    });
    $('#pp_initiative_prompt_reset').on('click', () => {
        const s = getSettings();
        s.mailInitiativePrompt = DEFAULT_MAIL_INITIATIVE_PROMPT;
        $('#pp_initiative_prompt').val(DEFAULT_MAIL_INITIATIVE_PROMPT);
        saveSettings();
        toast('Initiative prompt reset', 'info');
    });
    $('#pp_initiative_test').on('click', async () => {
        const btn = /** @type {HTMLButtonElement | null} */ ($('#pp_initiative_test').get(0));
        if (btn) {
            btn.disabled = true;
        }
        try {
            await tryInitiativeMail({
                bypassChance: true,
                bypassIdle: true,
                bypassQuiet: true,
            });
        } finally {
            if (btn) {
                btn.disabled = false;
            }
        }
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

    const wandRoot = document.getElementById('extensionsMenu')
        || document.querySelector('#extensions_settings .extensions_block')
        || document.querySelector('#rm_extensions_block .extensionsMenu');

    if (wandRoot) {
        const btn = document.createElement('div');
        btn.id = 'pp-wand-item';
        btn.className = 'list-group-item flex-container flexGap5 interactable';
        btn.title = 'Open Phone Trigger';
        btn.setAttribute('tabindex', '0');
        btn.innerHTML = `<div class="fa-solid fa-mobile-screen-button extensionsMenuExtensionButton"></div><span>Phone Trigger</span>`;
        const open = (ev) => {
            ev?.preventDefault?.();
            ev?.stopPropagation?.();
            openPhone();
        };
        btn.addEventListener('click', open);
        wandRoot.appendChild(btn);
        return;
    }

    console.debug(LOG, 'Extensions wand menu not found yet; will retry');
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
        if (getSettings().dmailWorldline !== false) {
            updateWorldlinePrompt();
        }
        noteInitiativeActivity();
        syncInitiativeScheduler();
    });

    eventSource.on(event_types.CHAT_CHANGED, () => {
        updateMailPrompt();
        if (getSettings().dmailWorldline !== false) {
            updateWorldlinePrompt();
        }
        refreshIfOpen();
        noteInitiativeActivity();
        syncInitiativeScheduler();
    });

    eventSource.on(event_types.MESSAGE_RECEIVED, async (messageId) => {
        noteInitiativeActivity();
        try {
            await ingestEmailsFromMessage(messageId);
            refreshIfOpen();
        } catch (err) {
            console.error(LOG, 'ingestEmailsFromMessage failed', err);
        }
    });

    if (event_types.MESSAGE_SENT) {
        eventSource.on(event_types.MESSAGE_SENT, () => noteInitiativeActivity());
    }
    if (event_types.USER_MESSAGE_RENDERED) {
        eventSource.on(event_types.USER_MESSAGE_RENDERED, () => noteInitiativeActivity());
    }

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
        eventSource.on(event_types.GENERATION_STARTED, (...args) => {
            setInitiativeGenerationBusy(true);
            refreshSpeakerMemory(...args);
        });
    }
    if (event_types.GENERATION_AFTER_COMMANDS) {
        eventSource.on(event_types.GENERATION_AFTER_COMMANDS, refreshSpeakerMemory);
    }
    if (event_types.GROUP_WRAPPER) {
        eventSource.on(event_types.GROUP_WRAPPER, refreshSpeakerMemory);
    }
    const clearGenBusy = () => setInitiativeGenerationBusy(false);
    if (event_types.GENERATION_ENDED) {
        eventSource.on(event_types.GENERATION_ENDED, clearGenBusy);
    }
    if (event_types.GENERATION_STOPPED) {
        eventSource.on(event_types.GENERATION_STOPPED, clearGenBusy);
    }
    // Some ST versions emit CHARACTER_MESSAGE_RENDERED after DOM paint
    if (event_types.CHARACTER_MESSAGE_RENDERED) {
        eventSource.on(event_types.CHARACTER_MESSAGE_RENDERED, () => {
            clearGenBusy();
            refreshIfOpen();
        });
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
    if (getSettings().dmailWorldline !== false) {
        updateWorldlinePrompt();
    }
    updateWandItem();

    // Retry wand item — menu may mount late
    setTimeout(updateWandItem, 1500);

    noteInitiativeActivity();
    syncInitiativeScheduler();

    console.log(LOG, 'loaded');
});

export function onActivate() {
    getSettings();
    initPhoneChrome();
    updateFabVisibility();
    updateMailPrompt();
    if (getSettings().dmailWorldline !== false) {
        updateWorldlinePrompt();
    }
    noteInitiativeActivity();
    syncInitiativeScheduler();
}
