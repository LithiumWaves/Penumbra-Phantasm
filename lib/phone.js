import { WALLPAPERS, SOUND_PRESETS, FLIP_MS } from './constants.js';
import { getSettings, saveSettings, toast } from './settings.js';
import {
    getInbox,
    getOutbox,
    getEmailById,
    markRead,
    getUnreadCount,
    getActiveCharacterName,
    clearAllMail,
    listMailContacts,
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
let fitBound = false;
let overlayWired = false;
/** Prevent overlapping open/close animations */
let flipBusy = false;

const KEYPAD = [
    [
        { d: '1', kana: 'あ' },
        { d: '2', kana: 'か' },
        { d: '3', kana: 'さ' },
    ],
    [
        { d: '4', kana: 'た' },
        { d: '5', kana: 'な' },
        { d: '6', kana: 'は' },
    ],
    [
        { d: '7', kana: 'ま' },
        { d: '8', kana: 'や' },
        { d: '9', kana: 'ら' },
    ],
    [
        { d: '*', kana: '゛' },
        { d: '0', kana: 'わ' },
        { d: '#', kana: 'ー' },
    ],
];

function keypadHtml() {
    return KEYPAD.map((row) => `
        <div class="pp-key-row">
            ${row.map((k) => `
                <button type="button" class="pp-key" data-digit="${k.d}" aria-label="${k.d}">
                    <span class="pp-key-num">${k.d}</span>
                    <span class="pp-key-kana">${k.kana}</span>
                </button>
            `).join('')}
        </div>
    `).join('');
}

function buildPhoneInnerHtml() {
    return `
        <div class="pp-scale-wrap" id="pp-scale-wrap">
            <div class="pp-phone" aria-label="Phone Trigger">
                <button type="button" id="pp-close" class="pp-close" title="Close">✕</button>
                <div class="pp-chassis" aria-label="Phone Trigger">
                    <div class="pp-flip is-closed" id="pp-flip">
                        <div class="pp-lid">
                            <div class="pp-lid-face">
                                <div class="pp-lattice" aria-hidden="true">
                                    <span></span><span></span><span></span><span></span><span></span>
                                </div>
                                <div class="pp-ear-row" aria-hidden="true">
                                    <span class="pp-sensor"></span>
                                    <span class="pp-speaker"></span>
                                    <span class="pp-sensor"></span>
                                </div>
                                <div class="pp-screen">
                                    <div class="pp-status">
                                        <span id="pp-signal" class="pp-signal" aria-hidden="true">▂▄▆█</span>
                                        <span id="pp-clock">--:--</span>
                                        <span id="pp-batt" class="pp-batt" aria-hidden="true">▮▮▮</span>
                                    </div>
                                    <div id="pp-view" class="pp-view"></div>
                                    <div class="pp-vent-bar" aria-hidden="true">
                                        <span></span><span></span><span></span><span></span>
                                    </div>
                                </div>
                            </div>
                            <div class="pp-lid-back" aria-hidden="true"></div>
                        </div>
                        <div class="pp-hinge">
                            <div class="pp-shortcut-bar" role="toolbar" aria-label="Shortcuts">
                                <button type="button" class="pp-shortcut" data-goto="mail" title="Mail" aria-label="Mail">✉</button>
                                <button type="button" class="pp-shortcut" data-goto="inbox" title="Inbox" aria-label="Inbox">ℹ</button>
                                <button type="button" class="pp-shortcut" data-goto="compose" title="New mail" aria-label="New mail">☺</button>
                                <button type="button" class="pp-shortcut" data-goto="settings" title="Settings" aria-label="Settings">▤</button>
                                <button type="button" class="pp-shortcut" data-goto="wallpaper" title="Wallpaper" aria-label="Wallpaper">▣</button>
                            </div>
                        </div>
                        <div class="pp-base">
                            <div class="pp-keydeck">
                                <div class="pp-softkeys">
                                    <button type="button" id="pp-key-left" class="pp-softkey">　　</button>
                                    <button type="button" id="pp-key-center" class="pp-softkey pp-softkey-center">●</button>
                                    <button type="button" id="pp-key-right" class="pp-softkey">　　</button>
                                </div>
                                <div class="pp-nav-cluster">
                                    <button type="button" data-nav="up" class="pp-nav-btn" aria-label="Up">▲</button>
                                    <div class="pp-nav-mid">
                                        <button type="button" data-nav="left" class="pp-nav-btn" aria-label="Left">◀</button>
                                        <button type="button" data-nav="ok" class="pp-nav-ok" aria-label="OK">○</button>
                                        <button type="button" data-nav="right" class="pp-nav-btn" aria-label="Right">▶</button>
                                    </div>
                                    <button type="button" data-nav="down" class="pp-nav-btn" aria-label="Down">▼</button>
                                </div>
                                <div class="pp-call-row">
                                    <button type="button" class="pp-call-btn pp-call-answer" aria-label="Call">☎</button>
                                    <button type="button" class="pp-call-btn pp-call-end" aria-label="End">☎</button>
                                </div>
                                <div class="pp-keypad" aria-label="Keypad">
                                    ${keypadHtml()}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;
}

function getOverlay() {
    return document.getElementById('pp-overlay');
}

export function isPhoneOpen() {
    const overlay = getOverlay();
    if (!overlay) {
        return false;
    }
    if (typeof overlay.open === 'boolean') {
        return overlay.open;
    }
    return !!root?.classList.contains('pp-open');
}

/**
 * Same approach as Killer-Within investigator hub on S25 Ultra:
 * size the shell to the live visual viewport and pin inset 0 / transform none.
 * Do NOT add visualViewport.offsetTop — Chrome/Samsung already treat fixed as VV-relative.
 */
function getViewportBox() {
    const vv = window.visualViewport;
    const vvWidth = Number(vv?.width);
    const vvHeight = Number(vv?.height);
    const layoutWidth = Math.min(
        Number(window.innerWidth) || Infinity,
        Number(document.documentElement?.clientWidth) || Infinity,
    );
    const layoutHeight = Math.min(
        Number(window.innerHeight) || Infinity,
        Number(document.documentElement?.clientHeight) || Infinity,
    );
    const width = Math.max(
        1,
        Math.round(
            Number.isFinite(vvWidth) && vvWidth > 0
                ? Math.min(vvWidth, layoutWidth || vvWidth)
                : (layoutWidth || window.innerWidth || 1),
        ),
    );
    const height = Math.max(
        1,
        Math.round(
            Number.isFinite(vvHeight) && vvHeight > 0
                ? Math.min(vvHeight, layoutHeight || vvHeight)
                : (layoutHeight || window.innerHeight || 1),
        ),
    );
    return { width, height };
}

function applyOverlayViewportBox(overlay) {
    if (!overlay) {
        return;
    }
    const box = getViewportBox();
    const set = (name, value) => {
        overlay.style.setProperty(name, value, 'important');
    };
    set('position', 'fixed');
    set('inset', '0');
    set('left', '0');
    set('top', '0');
    set('right', '0');
    set('bottom', '0');
    set('width', '100%');
    set('height', `${box.height}px`);
    set('max-width', '100%');
    set('max-height', `${box.height}px`);
    set('min-width', '0');
    set('min-height', '0');
    set('margin', '0');
    set('padding', '0');
    set('border', '0');
    set('transform', 'none');
    set('overflow', 'visible');
    set('box-sizing', 'border-box');
    // Do NOT set display here — dialog open/close owns visibility.
    // Inline display:!important was keeping the phone on screen after close().
    set('visibility', 'visible');
    set('opacity', '1');
    set('pointer-events', 'auto');
    set('z-index', '2147483646');
}

/** Scale chassis inside the top-layer dialog so the full handset fits. */
export function fitPhoneToViewport() {
    const scaleWrap = document.getElementById('pp-scale-wrap');
    const chassis = document.querySelector('.pp-chassis');
    const overlay = getOverlay();
    if (!scaleWrap || !chassis || !isPhoneOpen()) {
        return;
    }

    scaleWrap.style.transform = 'none';
    scaleWrap.style.setProperty('--pp-scale', '1');
    void chassis.offsetHeight;

    const box = getViewportBox();
    const pad = 16;
    const availW = Math.max(120, box.width - pad * 2);
    const availH = Math.max(160, box.height - pad * 2);

    const w = chassis.offsetWidth || 1;
    const h = (chassis.offsetHeight || 1) + 20;
    const scale = Math.min(1, availW / w, availH / h);
    scaleWrap.style.setProperty('--pp-scale', String(scale));
    scaleWrap.style.transform = `scale(${scale})`;

    if (overlay) {
        applyOverlayViewportBox(overlay);
    }
}

function presentOverlay(overlay) {
    if (!overlay) {
        return;
    }
    applyOverlayViewportBox(overlay);
    try {
        if (typeof overlay.showModal === 'function') {
            if (!overlay.open) {
                overlay.showModal();
            }
            return;
        }
    } catch (err) {
        console.warn('[Phone Trigger] dialog.showModal failed; using open attribute', err);
    }
    try {
        overlay.setAttribute('open', '');
        overlay.open = true;
    } catch (_err) {
        overlay.hidden = false;
    }
}

function clearOverlayInlineStyles(overlay) {
    if (!overlay?.style) {
        return;
    }
    // Remove every property we may have forced — especially display.
    const names = [
        'position', 'inset', 'left', 'top', 'right', 'bottom',
        'width', 'height', 'max-width', 'max-height', 'min-width', 'min-height',
        'margin', 'padding', 'border', 'transform', 'overflow', 'box-sizing',
        'display', 'visibility', 'opacity', 'pointer-events', 'z-index',
    ];
    for (const name of names) {
        overlay.style.removeProperty(name);
    }
}

function dismissOverlay(overlay) {
    if (!overlay) {
        return;
    }
    try {
        if (typeof overlay.close === 'function' && overlay.open) {
            overlay.close();
        }
    } catch (_err) {
        // ignore
    }
    try {
        overlay.removeAttribute('open');
        overlay.open = false;
    } catch (_err) {
        // ignore
    }
    overlay.hidden = true;
    clearOverlayInlineStyles(overlay);
}

function getFlip() {
    return document.getElementById('pp-flip');
}

function setFlipState(state) {
    const flip = getFlip();
    if (!flip) {
        return;
    }
    flip.classList.remove('is-closed', 'is-opening', 'is-open', 'is-closing');
    if (state) {
        flip.classList.add(state);
    }
}

function waitFlipMs(ms = FLIP_MS) {
    return new Promise((resolve) => {
        const lid = document.querySelector('.pp-lid');
        let done = false;
        const finish = () => {
            if (done) {
                return;
            }
            done = true;
            lid?.removeEventListener('transitionend', onEnd);
            resolve();
        };
        const onEnd = (e) => {
            if (e.target === lid && e.propertyName === 'transform') {
                finish();
            }
        };
        lid?.addEventListener('transitionend', onEnd);
        setTimeout(finish, ms + 80);
    });
}

function bindFitListeners() {
    if (fitBound) {
        return;
    }
    fitBound = true;
    const refit = () => {
        if (isPhoneOpen()) {
            requestAnimationFrame(() => {
                applyOverlayViewportBox(getOverlay());
                fitPhoneToViewport();
            });
        }
    };
    window.addEventListener('resize', refit);
    window.addEventListener('orientationchange', refit);
    window.visualViewport?.addEventListener('resize', refit);
    // Do NOT listen to visualViewport scroll / offsetTop — that double-offsets on Samsung Chrome.
}

function wireOverlayHandlers(overlay) {
    if (!overlay || overlayWired) {
        return;
    }
    overlayWired = true;
    overlay.addEventListener('cancel', (e) => {
        e.preventDefault();
        closePhone();
    });
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
            closePhone();
        }
    });
}

function bindChromeControls(scope) {
    $(scope).find('#pp-close').off('click.pp').on('click.pp', (e) => {
        e.preventDefault();
        e.stopPropagation();
        closePhone();
    });
    $(scope).find('#pp-key-right').off('click.pp').on('click.pp', () => navigateBack());
    $(scope).find('#pp-key-left').off('click.pp').on('click.pp', () => softLeft());
    $(scope).find('#pp-key-center').off('click.pp').on('click.pp', () => softCenter());
    scope.querySelectorAll('[data-nav]').forEach((btn) => {
        btn.addEventListener('click', () => {
            if (btn.getAttribute('data-nav') === 'ok') {
                softCenter();
            }
        });
    });
    scope.querySelectorAll('.pp-shortcut[data-goto]').forEach((btn) => {
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

export function initPhoneChrome() {
    let wrap = document.getElementById('pp-phone-root');
    let overlay = getOverlay();

    const needsRebuild = overlay && (
        String(overlay.tagName || '').toUpperCase() !== 'DIALOG'
        || !overlay.querySelector('.pp-flip')
        || !overlay.querySelector('#pp-scale-wrap')
    );
    if (needsRebuild) {
        dismissOverlay(overlay);
        overlay.remove();
        overlay = null;
        overlayWired = false;
    }

    if (!wrap) {
        wrap = document.createElement('div');
        wrap.id = 'pp-phone-root';
        wrap.innerHTML = `
            <button type="button" id="pp-fab" class="pp-fab" title="Phone Trigger" aria-label="Phone Trigger">
                <span class="pp-fab-icon" aria-hidden="true">☎</span>
                <span id="pp-fab-badge" class="pp-fab-badge" hidden>0</span>
            </button>
        `;
        document.body.appendChild(wrap);
        $('#pp-fab').on('click', () => togglePhone());
    }

    root = wrap;

    if (!overlay) {
        overlay = document.createElement('dialog');
        overlay.id = 'pp-overlay';
        overlay.className = 'pp-overlay';
        overlay.setAttribute('aria-label', 'Phone Trigger');
        overlay.innerHTML = buildPhoneInnerHtml();
        document.body.appendChild(overlay);
        bindChromeControls(overlay);
        wireOverlayHandlers(overlay);
    }

    bindFitListeners();
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
        toast('Phone Trigger is disabled', 'warning');
        return;
    }
    if (flipBusy && isPhoneOpen()) {
        return;
    }
    initPhoneChrome();
    screen = targetScreen;
    activeMailId = null;
    const overlay = getOverlay();
    root?.classList.add('pp-open');

    setFlipState('is-closed');
    presentOverlay(overlay);
    tickClock();
    if (clockTimer) {
        clearInterval(clockTimer);
    }
    clockTimer = setInterval(tickClock, 15000);
    render();

    flipBusy = true;
    requestAnimationFrame(() => {
        applyOverlayViewportBox(overlay);
        fitPhoneToViewport();
        setFlipState('is-closed');
        void getFlip()?.offsetWidth;
        requestAnimationFrame(() => {
            setFlipState('is-opening');
            waitFlipMs().then(() => {
                setFlipState('is-open');
                flipBusy = false;
                fitPhoneToViewport();
            });
        });
    });
}

export function closePhone() {
    if (flipBusy) {
        return;
    }
    const overlay = getOverlay();
    if (!overlay || (!overlay.open && !root?.classList.contains('pp-open'))) {
        dismissOverlay(overlay);
        root?.classList.remove('pp-open');
        return;
    }

    flipBusy = true;
    setFlipState('is-closing');

    waitFlipMs().then(() => {
        root?.classList.remove('pp-open');
        dismissOverlay(getOverlay());
        setFlipState('is-closed');
        const scaleWrap = document.getElementById('pp-scale-wrap');
        if (scaleWrap) {
            scaleWrap.style.transform = '';
            scaleWrap.style.setProperty('--pp-scale', '1');
        }
        if (clockTimer) {
            clearInterval(clockTimer);
            clockTimer = null;
        }
        flipBusy = false;
    });
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
        l.textContent = left || '';
    }
    if (r) {
        r.textContent = right || '';
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

    if (isPhoneOpen()) {
        requestAnimationFrame(fitPhoneToViewport);
    }
}

function renderHome(view) {
    setSoftLabels('Mail', 'Close');
    view.style.background = wallpaperCss();
    view.className = 'pp-view pp-view-home';
    view.innerHTML = '';
}

function renderMailMenu(view) {
    setSoftLabels('New', 'Back');
    view.style.background = '';
    view.className = 'pp-view';
    const unread = getUnreadCount();
    view.innerHTML = `
        <div class="pp-title">Mail</div>
        <button type="button" class="pp-row" data-goto="inbox">
            <span>Inbox</span>
            <span class="pp-row-meta">${unread ? `${unread} new` : getInbox().length}</span>
        </button>
        <button type="button" class="pp-row" data-goto="outbox">
            <span>Outbox</span>
            <span class="pp-row-meta">${getOutbox().length}</span>
        </button>
        <button type="button" class="pp-row" data-goto="compose">
            <span>New</span>
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
    const contacts = listMailContacts();
    const active = contacts.find((c) => c.isActive) || contacts[0];
    const options = contacts.length
        ? contacts.map((c) => {
            const selected = active && c.key === active.key ? ' selected' : '';
            const mark = c.isActive ? ' ★' : '';
            return `<option value="${escapeHtml(c.key)}"${selected}>${escapeHtml(c.name)}${mark}</option>`;
        }).join('')
        : `<option value="">${escapeHtml(getActiveCharacterName())}</option>`;

    view.innerHTML = `
        <div class="pp-title">New mail</div>
        <div class="pp-scroll pp-compose">
            <label class="pp-field">
                <span class="pp-label">To</span>
                <select id="pp-compose-to">${options}</select>
            </label>
            <label class="pp-field">
                <span class="pp-label">Subject</span>
                <input type="text" id="pp-compose-subject" value="${escapeHtml(composeSubject)}" />
            </label>
            <label class="pp-field">
                <span class="pp-label">Body</span>
                <textarea id="pp-compose-body" rows="6">${escapeHtml(composeBody)}</textarea>
            </label>
            <button type="button" class="pp-btn" id="pp-send-btn">Send</button>
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
        const toSelect = /** @type {HTMLSelectElement} */ (view.querySelector('#pp-compose-to'));
        const toKey = toSelect?.value || '';
        const toName = toSelect?.selectedOptions?.[0]?.textContent?.replace(/\s*★\s*$/, '').trim() || '';
        if (!composeBody.trim()) {
            toast('Empty message', 'warning');
            return;
        }
        const btn = view.querySelector('#pp-send-btn');
        if (btn) {
            btn.disabled = true;
            btn.textContent = '…';
        }
        try {
            await sendUserEmail({
                to: toName,
                toKey,
                subject: composeSubject || '(no subject)',
                body: composeBody,
                inReplyTo: composeReplyTo || undefined,
                requestReply: true,
            });
            composeSubject = '';
            composeBody = '';
            composeReplyTo = null;
            screen = 'outbox';
            toast(`Sent → ${toName}`, 'success');
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
