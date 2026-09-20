import { WALLPAPERS, SOUND_PRESETS } from './constants.js';
import { getSettings, saveSettings, toast } from './settings.js';
import {
    getInbox,
    getOutbox,
    getEmailById,
    markRead,
    getUnreadCount,
    getActiveCharacterName,
    clearAllMail,
} from './store.js';
import { playNotification, playRingtone, playPreset } from './audio.js';
import { sendUserEmail, updateMailPrompt } from './email.js';

/** @type {HTMLElement|null} */
let root = null;
/** @type {string} */
let screen = 'home';
/** @type {string|null} */
let activeMailId = null;
/** @type {string} */
let composeSubject = '';
/** @type {string} */
let composeBody = '';
/** @type {string|null} */
let composeReplyTo = null;
let clockTimer = null;

export function isPhoneOpen() {
    return !!root?.classList.contains('pp-open');
}

export function initPhoneChrome() {
    if (document.getElementById('pp-phone-root')) {
        root = document.getElementById('pp-phone-root');
        return;
    }

    const wrap = document.createElement('div');
    wrap.id = 'pp-phone-root';
    wrap.innerHTML = `
        <button type="button" id="pp-fab" class="pp-fab" title="Open phone" aria-label="Open phone">
            <span class="pp-fab-icon" aria-hidden="true">☎</span>
            <span id="pp-fab-badge" class="pp-fab-badge" hidden>0</span>
        </button>
        <div id="pp-overlay" class="pp-overlay" hidden>
            <div class="pp-phone" role="dialog" aria-label="Phone">
                <div class="pp-chassis">
                    <div class="pp-earpiece"></div>
                    <div class="pp-screen">
                        <div class="pp-status">
                            <span id="pp-signal">▐▌▌</span>
                            <span id="pp-clock">--:--</span>
                            <span id="pp-batt">▮▮▮</span>
                        </div>
                        <div id="pp-view" class="pp-view"></div>
                        <div class="pp-softkeys">
                            <button type="button" id="pp-key-left" class="pp-softkey">Menu</button>
                            <button type="button" id="pp-key-center" class="pp-softkey pp-softkey-center">●</button>
                            <button type="button" id="pp-key-right" class="pp-softkey">Back</button>
                        </div>
                    </div>
                    <div class="pp-navpad">
                        <button type="button" data-nav="up" aria-label="Up">▲</button>
                        <div class="pp-nav-mid">
                            <button type="button" data-nav="left" aria-label="Left">◀</button>
                            <button type="button" data-nav="ok" class="pp-nav-ok" aria-label="OK">OK</button>
                            <button type="button" data-nav="right" aria-label="Right">▶</button>
                        </div>
                        <button type="button" data-nav="down" aria-label="Down">▼</button>
                    </div>
                </div>
                <button type="button" id="pp-close" class="pp-close" title="Close phone">✕</button>
            </div>
        </div>
    `;
    document.body.appendChild(wrap);
    root = wrap;

    $('#pp-fab').on('click', () => togglePhone());
    $('#pp-close').on('click', () => closePhone());
    $('#pp-overlay').on('click', (e) => {
        if (e.target.id === 'pp-overlay') {
            closePhone();
        }
    });
    $('#pp-key-right').on('click', () => navigateBack());
    $('#pp-key-left').on('click', () => softLeft());
    $('#pp-key-center').on('click', () => softCenter());
    root.querySelectorAll('[data-nav]').forEach((btn) => {
        btn.addEventListener('click', () => {
            if (btn.getAttribute('data-nav') === 'ok') {
                softCenter();
            }
        });
    });

    updateFabVisibility();
    updateBadge();
}

export function updateFabVisibility() {
    const settings = getSettings();
    const fab = document.getElementById('pp-fab');
    if (!fab) {
        return;
    }
    const show = settings.enabled && settings.showFloatingButton;
    fab.hidden = !show;
    fab.style.display = show ? '' : 'none';
    document.getElementById('pp-phone-root')?.classList.toggle('pp-pos-left', settings.phonePosition === 'left');
    document.getElementById('pp-phone-root')?.classList.toggle('pp-pos-center', settings.phonePosition === 'center');
}

export function updateBadge() {
    const badge = document.getElementById('pp-fab-badge');
    if (!badge) {
        return;
    }
    const n = getUnreadCount();
    if (n > 0) {
        badge.hidden = false;
        badge.textContent = n > 9 ? '9+' : String(n);
    } else {
        badge.hidden = true;
    }
}

export function togglePhone() {
    if (isPhoneOpen()) {
        closePhone();
    } else {
        openPhone();
    }
}

export function openPhone(targetScreen = 'home') {
    const settings = getSettings();
    if (!settings.enabled) {
        toast('Phone extension is disabled in settings', 'warning');
        return;
    }
    initPhoneChrome();
    screen = targetScreen;
    activeMailId = null;
    const overlay = document.getElementById('pp-overlay');
    overlay.hidden = false;
    root?.classList.add('pp-open');
    tickClock();
    if (clockTimer) {
        clearInterval(clockTimer);
    }
    clockTimer = setInterval(tickClock, 15000);
    render();
}

export function closePhone() {
    root?.classList.remove('pp-open');
    const overlay = document.getElementById('pp-overlay');
    if (overlay) {
        overlay.hidden = true;
    }
    if (clockTimer) {
        clearInterval(clockTimer);
        clockTimer = null;
    }
}

function tickClock() {
    const el = document.getElementById('pp-clock');
    if (!el) {
        return;
    }
    const now = new Date();
    el.textContent = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function navigateBack() {
    const stack = {
        home: null,
        mail: 'home',
        inbox: 'mail',
        outbox: 'mail',
        read: activeMailId && getEmailById(activeMailId)?.direction === 'out' ? 'outbox' : 'inbox',
        compose: composeReplyTo ? 'read' : 'mail',
        settings: 'home',
        wallpaper: 'settings',
        sounds: 'settings',
    };
    const next = stack[screen];
    if (!next) {
        closePhone();
        return;
    }
    if (screen === 'compose' && composeReplyTo) {
        // stay on same mail when backing from reply compose
    }
    if (screen === 'read') {
        // keep activeMailId for compose reply back
    } else if (next !== 'read') {
        // clear when leaving read branch
    }
    screen = next;
    if (screen === 'home' || screen === 'mail' || screen === 'settings') {
        activeMailId = null;
        composeReplyTo = null;
    }
    render();
}

function softLeft() {
    if (screen === 'home') {
        screen = 'mail';
        render();
    } else if (screen === 'mail' || screen === 'inbox' || screen === 'outbox') {
        screen = 'compose';
        composeSubject = '';
        composeBody = '';
        composeReplyTo = null;
        render();
    } else if (screen === 'read') {
        startReply();
    } else if (screen === 'compose') {
        document.getElementById('pp-send-btn')?.click();
    } else if (screen === 'settings' || screen === 'wallpaper' || screen === 'sounds') {
        screen = 'home';
        render();
    }
}

function softCenter() {
    // Contextual confirm handled by in-view buttons primarily
}

function startReply(optionText = '') {
    const mail = activeMailId ? getEmailById(activeMailId) : null;
    if (!mail) {
        return;
    }
    composeReplyTo = mail.id;
    composeSubject = mail.subject.startsWith('Re:') ? mail.subject : `Re: ${mail.subject}`;
    composeBody = optionText || '';
    screen = 'compose';
    render();
}

function wallpaperCss() {
    const settings = getSettings();
    if (settings.customWallpaperUrl) {
        return `center / cover no-repeat url("${settings.customWallpaperUrl.replace(/"/g, '\\"')}")`;
    }
    const preset = WALLPAPERS.find((w) => w.id === settings.wallpaperId) || WALLPAPERS[0];
    return preset.css;
}

function escapeHtml(str) {
    return String(str ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function formatTime(ts) {
    try {
        return new Date(ts).toLocaleString([], {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        });
    } catch {
        return '';
    }
}

function setSoftLabels(left, right) {
    const l = document.getElementById('pp-key-left');
    const r = document.getElementById('pp-key-right');
    if (l) {
        l.textContent = left;
    }
    if (r) {
        r.textContent = right;
    }
}

export function render() {
    const view = document.getElementById('pp-view');
    if (!view) {
        return;
    }
    updateBadge();

    switch (screen) {
        case 'home':
            renderHome(view);
            break;
        case 'mail':
            renderMailMenu(view);
            break;
        case 'inbox':
            renderList(view, 'inbox');
            break;
        case 'outbox':
            renderList(view, 'outbox');
            break;
        case 'read':
            renderRead(view);
            break;
        case 'compose':
            renderCompose(view);
            break;
        case 'settings':
            renderSettings(view);
            break;
        case 'wallpaper':
            renderWallpaper(view);
            break;
        case 'sounds':
            renderSounds(view);
            break;
        default:
            renderHome(view);
    }
}

function renderHome(view) {
    setSoftLabels('Mail', 'Close');
    const unread = getUnreadCount();
    view.style.background = wallpaperCss();
    view.className = 'pp-view pp-view-home';
    view.innerHTML = `
        <div class="pp-home-brand">PHONE</div>
        <div class="pp-home-sub">Ready</div>
        <div class="pp-home-grid">
            <button type="button" class="pp-app" data-goto="mail">
                <span class="pp-app-icon">✉</span>
                <span>Mail${unread ? ` (${unread})` : ''}</span>
            </button>
            <button type="button" class="pp-app" data-goto="settings">
                <span class="pp-app-icon">⚙</span>
                <span>Settings</span>
            </button>
            <button type="button" class="pp-app" data-goto="compose">
                <span class="pp-app-icon">✎</span>
                <span>Compose</span>
            </button>
        </div>
    `;
    bindGoto(view);
}

function renderMailMenu(view) {
    setSoftLabels('New', 'Back');
    view.style.background = '';
    view.className = 'pp-view';
    const unread = getUnreadCount();
    view.innerHTML = `
        <div class="pp-title">E-mail</div>
        <button type="button" class="pp-row" data-goto="inbox">
            <span>Inbox</span>
            <span class="pp-row-meta">${unread ? `${unread} new` : getInbox().length}</span>
        </button>
        <button type="button" class="pp-row" data-goto="outbox">
            <span>Outbox</span>
            <span class="pp-row-meta">${getOutbox().length}</span>
        </button>
        <button type="button" class="pp-row" data-goto="compose">
            <span>Compose</span>
            <span class="pp-row-meta">→</span>
        </button>
    `;
    bindGoto(view);
}

function renderList(view, which) {
    setSoftLabels('New', 'Back');
    view.style.background = '';
    view.className = 'pp-view';
    const list = which === 'inbox' ? getInbox() : getOutbox();
    const title = which === 'inbox' ? 'Inbox' : 'Outbox';
    const rows = list.length
        ? list.map((e) => `
            <button type="button" class="pp-row pp-mail-row ${e.read ? '' : 'pp-unread'}" data-mail="${escapeHtml(e.id)}">
                <div class="pp-mail-top">
                    <span class="pp-mail-from">${escapeHtml(which === 'inbox' ? e.from : e.to)}</span>
                    <span class="pp-mail-time">${escapeHtml(formatTime(e.timestamp))}</span>
                </div>
                <div class="pp-mail-subj">${escapeHtml(e.subject)}</div>
                <div class="pp-mail-preview">${escapeHtml(e.body.replace(/\s+/g, ' ').slice(0, 64))}</div>
            </button>
        `).join('')
        : `<div class="pp-empty">No messages</div>`;

    view.innerHTML = `<div class="pp-title">${title}</div><div class="pp-scroll">${rows}</div>`;
    view.querySelectorAll('[data-mail]').forEach((btn) => {
        btn.addEventListener('click', async () => {
            activeMailId = btn.getAttribute('data-mail');
            await markRead(activeMailId);
            screen = 'read';
            render();
        });
    });
}

async function renderRead(view) {
    setSoftLabels('Reply', 'Back');
    view.style.background = '';
    view.className = 'pp-view';
    const mail = getEmailById(activeMailId);
    if (!mail) {
        view.innerHTML = `<div class="pp-empty">Message missing</div>`;
        return;
    }
    await markRead(mail.id);
    updateBadge();

    const options = (mail.replyOptions || []).map((opt) =>
        `<button type="button" class="pp-reply-chip" data-reply="${escapeHtml(opt)}">${escapeHtml(opt)}</button>`
    ).join('');

    view.innerHTML = `
        <div class="pp-title">Mail</div>
        <div class="pp-scroll pp-read">
            <div class="pp-read-meta">
                <div><span class="pp-label">From</span> ${escapeHtml(mail.from)}</div>
                <div><span class="pp-label">To</span> ${escapeHtml(mail.to)}</div>
                <div><span class="pp-label">Subject</span> ${escapeHtml(mail.subject)}</div>
                <div class="pp-read-time">${escapeHtml(formatTime(mail.timestamp))}</div>
            </div>
            <div class="pp-read-body">${escapeHtml(mail.body).replace(/\n/g, '<br>')}</div>
            ${options ? `<div class="pp-reply-options"><div class="pp-label">Reply with</div>${options}</div>` : ''}
            <button type="button" class="pp-btn" id="pp-reply-btn">Reply</button>
        </div>
    `;
    view.querySelector('#pp-reply-btn')?.addEventListener('click', () => startReply());
    view.querySelectorAll('[data-reply]').forEach((btn) => {
        btn.addEventListener('click', () => startReply(btn.getAttribute('data-reply') || ''));
    });
}

function renderCompose(view) {
    setSoftLabels('Send', 'Back');
    view.style.background = '';
    view.className = 'pp-view';
    const to = getActiveCharacterName();
    view.innerHTML = `
        <div class="pp-title">Compose</div>
        <div class="pp-scroll pp-compose">
            <label class="pp-field">
                <span class="pp-label">To</span>
                <input type="text" id="pp-compose-to" value="${escapeHtml(to)}" />
            </label>
            <label class="pp-field">
                <span class="pp-label">Subject</span>
                <input type="text" id="pp-compose-subject" value="${escapeHtml(composeSubject)}" placeholder="Subject" />
            </label>
            <label class="pp-field">
                <span class="pp-label">Message</span>
                <textarea id="pp-compose-body" rows="7" placeholder="Write like you're talking to them…">${escapeHtml(composeBody)}</textarea>
            </label>
            <button type="button" class="pp-btn" id="pp-send-btn">Send</button>
            <p class="pp-hint">Replies arrive as e-mail, not chat prose.</p>
        </div>
    `;

    const sync = () => {
        composeSubject = /** @type {HTMLInputElement} */ (view.querySelector('#pp-compose-subject'))?.value || '';
        composeBody = /** @type {HTMLTextAreaElement} */ (view.querySelector('#pp-compose-body'))?.value || '';
    };
    view.querySelector('#pp-compose-subject')?.addEventListener('input', sync);
    view.querySelector('#pp-compose-body')?.addEventListener('input', sync);

    const send = async () => {
        sync();
        const toVal = /** @type {HTMLInputElement} */ (view.querySelector('#pp-compose-to'))?.value?.trim();
        if (!composeBody.trim()) {
            toast('Write a message first', 'warning');
            return;
        }
        const btn = view.querySelector('#pp-send-btn');
        if (btn) {
            btn.disabled = true;
            btn.textContent = 'Sending…';
        }
        try {
            await sendUserEmail({
                to: toVal,
                subject: composeSubject || '(no subject)',
                body: composeBody,
                inReplyTo: composeReplyTo || undefined,
                requestReply: true,
            });
            composeSubject = '';
            composeBody = '';
            composeReplyTo = null;
            screen = 'outbox';
            toast('E-mail sent', 'success');
            render();
        } catch (err) {
            console.error(err);
            toast('Send failed', 'error');
            if (btn) {
                btn.disabled = false;
                btn.textContent = 'Send';
            }
        }
    };

    view.querySelector('#pp-send-btn')?.addEventListener('click', send);
}

function renderSettings(view) {
    setSoftLabels('Home', 'Back');
    view.style.background = '';
    view.className = 'pp-view';
    view.innerHTML = `
        <div class="pp-title">Settings</div>
        <button type="button" class="pp-row" data-goto="wallpaper"><span>Wallpaper</span><span class="pp-row-meta">→</span></button>
        <button type="button" class="pp-row" data-goto="sounds"><span>Sounds</span><span class="pp-row-meta">→</span></button>
        <button type="button" class="pp-row" id="pp-test-notify"><span>Test notification</span><span class="pp-row-meta">♪</span></button>
        <button type="button" class="pp-row" id="pp-test-ring"><span>Test ringtone</span><span class="pp-row-meta">♪</span></button>
        <button type="button" class="pp-row pp-danger" id="pp-clear-mail"><span>Clear all mail</span><span class="pp-row-meta">!</span></button>
    `;
    bindGoto(view);
    view.querySelector('#pp-test-notify')?.addEventListener('click', () => playNotification());
    view.querySelector('#pp-test-ring')?.addEventListener('click', () => playRingtone());
    view.querySelector('#pp-clear-mail')?.addEventListener('click', async () => {
        if (!confirm('Delete all e-mails in this chat?')) {
            return;
        }
        await clearAllMail();
        updateMailPrompt();
        updateBadge();
        toast('Mailbox cleared', 'info');
        render();
    });
}

function renderWallpaper(view) {
    setSoftLabels('Apply', 'Back');
    view.style.background = '';
    view.className = 'pp-view';
    const settings = getSettings();
    const presets = WALLPAPERS.map((w) => `
        <button type="button" class="pp-row ${settings.wallpaperId === w.id && !settings.customWallpaperUrl ? 'pp-selected' : ''}" data-wall="${w.id}">
            <span>${escapeHtml(w.name)}</span>
            <span class="pp-swatch" style="background:${escapeHtml(w.css)}"></span>
        </button>
    `).join('');

    view.innerHTML = `
        <div class="pp-title">Wallpaper</div>
        <div class="pp-scroll">
            ${presets}
            <label class="pp-field">
                <span class="pp-label">Custom image URL</span>
                <input type="url" id="pp-wall-url" value="${escapeHtml(settings.customWallpaperUrl)}" placeholder="https://…" />
            </label>
            <button type="button" class="pp-btn" id="pp-wall-apply">Use custom URL</button>
            <button type="button" class="pp-btn pp-btn-ghost" id="pp-wall-clear">Clear custom</button>
        </div>
    `;

    view.querySelectorAll('[data-wall]').forEach((btn) => {
        btn.addEventListener('click', () => {
            const settingsNow = getSettings();
            settingsNow.wallpaperId = btn.getAttribute('data-wall');
            settingsNow.customWallpaperUrl = '';
            saveSettings();
            toast('Wallpaper changed', 'success');
            render();
        });
    });
    view.querySelector('#pp-wall-apply')?.addEventListener('click', () => {
        const url = /** @type {HTMLInputElement} */ (view.querySelector('#pp-wall-url'))?.value?.trim() || '';
        const settingsNow = getSettings();
        settingsNow.customWallpaperUrl = url;
        saveSettings();
        toast(url ? 'Custom wallpaper set' : 'Cleared', 'success');
        render();
    });
    view.querySelector('#pp-wall-clear')?.addEventListener('click', () => {
        const settingsNow = getSettings();
        settingsNow.customWallpaperUrl = '';
        saveSettings();
        render();
    });
}

function renderSounds(view) {
    setSoftLabels('Home', 'Back');
    view.style.background = '';
    view.className = 'pp-view';
    const settings = getSettings();
    const notifyPresets = SOUND_PRESETS.filter((p) => p.kind === 'notify' || p.kind === 'both');
    const ringPresets = SOUND_PRESETS.filter((p) => p.kind === 'ringtone' || p.kind === 'both');

    const notifyRows = notifyPresets.map((p) => `
        <button type="button" class="pp-row ${settings.notificationSoundId === p.id ? 'pp-selected' : ''}" data-notify="${p.id}">
            <span>${escapeHtml(p.name)}</span>
            <span class="pp-row-meta">♪</span>
        </button>
    `).join('');
    const ringRows = ringPresets.map((p) => `
        <button type="button" class="pp-row ${settings.ringtoneId === p.id ? 'pp-selected' : ''}" data-ring="${p.id}">
            <span>${escapeHtml(p.name)}</span>
            <span class="pp-row-meta">♪</span>
        </button>
    `).join('');

    view.innerHTML = `
        <div class="pp-title">Sounds</div>
        <div class="pp-scroll">
            <div class="pp-section">Notification</div>
            ${notifyRows}
            <label class="pp-field">
                <span class="pp-label">Custom notification URL</span>
                <input type="url" id="pp-notify-url" value="${escapeHtml(settings.customNotificationUrl)}" placeholder="https://…/notify.mp3" />
            </label>
            <div class="pp-section">Ringtone</div>
            ${ringRows}
            <label class="pp-field">
                <span class="pp-label">Custom ringtone URL</span>
                <input type="url" id="pp-ring-url" value="${escapeHtml(settings.customRingtoneUrl)}" placeholder="https://…/ring.mp3" />
            </label>
            <button type="button" class="pp-btn" id="pp-sound-urls">Save custom URLs</button>
        </div>
    `;

    view.querySelectorAll('[data-notify]').forEach((btn) => {
        btn.addEventListener('click', async () => {
            const id = btn.getAttribute('data-notify');
            const s = getSettings();
            s.notificationSoundId = id;
            s.customNotificationUrl = '';
            saveSettings();
            await playPreset(id);
            render();
        });
    });
    view.querySelectorAll('[data-ring]').forEach((btn) => {
        btn.addEventListener('click', async () => {
            const id = btn.getAttribute('data-ring');
            const s = getSettings();
            s.ringtoneId = id;
            s.customRingtoneUrl = '';
            saveSettings();
            await playPreset(id);
            render();
        });
    });
    view.querySelector('#pp-sound-urls')?.addEventListener('click', () => {
        const s = getSettings();
        s.customNotificationUrl = /** @type {HTMLInputElement} */ (view.querySelector('#pp-notify-url'))?.value?.trim() || '';
        s.customRingtoneUrl = /** @type {HTMLInputElement} */ (view.querySelector('#pp-ring-url'))?.value?.trim() || '';
        saveSettings();
        toast('Custom sound URLs saved', 'success');
    });
}

function bindGoto(view) {
    view.querySelectorAll('[data-goto]').forEach((btn) => {
        btn.addEventListener('click', () => {
            screen = btn.getAttribute('data-goto') || 'home';
            if (screen === 'compose') {
                composeSubject = '';
                composeBody = '';
                composeReplyTo = null;
            }
            render();
        });
    });
}

export function refreshIfOpen() {
    updateBadge();
    if (isPhoneOpen()) {
        render();
    }
}

export function openInbox() {
    openPhone('inbox');
}
