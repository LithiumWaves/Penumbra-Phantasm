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
    getEmails,
    getMemorySelection,
    setMemorySelection,
    listAutoMemoryEmails,
    toggleCharacterMemoryEmail,
    getEmailsForCharacterMemory,
} from './store.js';
import { playNotification, playRingtone, playPreset } from './audio.js';
import { sendUserEmail, updateMailPrompt, scheduleForcedCharacterMail } from './email.js';
import { isPhoneWaveContact, PHONEWAVE_NAME, playDmailSequence, getDmailTiers, setDmailTier, acceptWorldlineFact } from './dmail.js';

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
/** Selected compose To: contact key */
let composeToKey = '';
/** Discreet force-mail panel on inbox */
let forcePanelOpen = false;
/** @type {string} */
let forceFromKey = '';
/** @type {string} */
let forceGuidance = '';
/** @type {string} */
let forceSubject = '';
/** Character key selected on Memory screen */
let memoryCharKey = '';
/** When true, Memory list shows every mail (not only involving the character) */
let memoryShowAll = false;
/** Pending D-Mail propose draft */
let proposeFact = '';
let proposeSubject = '';
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
        if (!chipDragActive) {
            const chip = document.getElementById('pp-mail-chip');
            if (chip && !chip.hidden) {
                applyChipPosition(chip);
            }
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
            const next = btn.getAttribute('data-goto') || 'home';
            if (screen === 'inbox' && next !== 'inbox') {
                forcePanelOpen = false;
            }
            screen = next;
            if (screen === 'compose') {
                composeSubject = '';
                composeBody = '';
                composeReplyTo = null;
                composeToKey = '';
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
        document.body.appendChild(wrap);
    }

    // Remove legacy FAB if present
    document.getElementById('pp-fab')?.remove();

    // Chip lives on document.body (not inside #pp-phone-root) so position:fixed
    // is always viewport-relative — avoids % top collapsing to 0 in empty parents.
    let chip = document.getElementById('pp-mail-chip');
    if (!chip) {
        chip = document.createElement('button');
        chip.type = 'button';
        chip.id = 'pp-mail-chip';
        chip.className = 'pp-mail-chip';
        chip.title = 'Open Phone Trigger — drag to move';
        chip.setAttribute('aria-label', 'Open mail');
        chip.innerHTML = `
            <span class="pp-mail-chip-sig" aria-hidden="true">▂▄▆█</span>
            <span class="pp-mail-chip-label">MAIL</span>
            <span id="pp-mail-chip-count" class="pp-mail-chip-count" hidden>0</span>
        `;
        document.body.appendChild(chip);
    } else if (chip.parentElement !== document.body) {
        document.body.appendChild(chip);
    }

    root = wrap;
    wireMailChip(chip);

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

/** @type {WeakSet<HTMLElement>} */
const wiredChips = typeof WeakSet !== 'undefined' ? new WeakSet() : null;
let chipWiredFlag = false;
/** Skip position re-apply while the user is dragging. */
let chipDragActive = false;

/**
 * @param {HTMLElement|null} chip
 */
function wireMailChip(chip) {
    if (!chip) {
        return;
    }
    if (wiredChips) {
        if (wiredChips.has(chip)) {
            if (!chipDragActive) {
                applyChipPosition(chip);
            }
            return;
        }
        wiredChips.add(chip);
    } else if (chipWiredFlag) {
        if (!chipDragActive) {
            applyChipPosition(chip);
        }
        return;
    } else {
        chipWiredFlag = true;
    }

    applyChipPosition(chip);

    let pointerId = null;
    let dragging = false;
    let moved = false;
    let startX = 0;
    let startY = 0;
    let originLeft = 0;
    let originTop = 0;
    let chipW = 80;
    let chipH = 28;

    const onMove = (ev) => {
        if (!dragging || ev.pointerId !== pointerId) {
            return;
        }
        const dx = ev.clientX - startX;
        const dy = ev.clientY - startY;
        if (!moved && (Math.abs(dx) > 4 || Math.abs(dy) > 4)) {
            moved = true;
            chipDragActive = true;
            chip.classList.add('pp-mail-chip-dragging', 'pp-mail-chip-placed');
        }
        if (!moved) {
            return;
        }
        ev.preventDefault();
        const vw = window.innerWidth || 1;
        const vh = window.innerHeight || 1;
        let left = originLeft + dx;
        let top = originTop + dy;
        left = Math.max(4, Math.min(vw - chipW - 4, left));
        top = Math.max(4, Math.min(vh - chipH - 4, top));
        chip.style.setProperty('left', `${Math.round(left)}px`, 'important');
        chip.style.setProperty('top', `${Math.round(top)}px`, 'important');
        chip.style.setProperty('right', 'auto', 'important');
        chip.style.setProperty('bottom', 'auto', 'important');
        chip.style.setProperty('transform', 'none', 'important');
    };

    const onUp = (ev) => {
        if (ev.pointerId !== pointerId) {
            return;
        }
        try {
            chip.releasePointerCapture(pointerId);
        } catch {
            /* ignore */
        }
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        window.removeEventListener('pointercancel', onUp);
        pointerId = null;
        dragging = false;
        chip.classList.remove('pp-mail-chip-dragging');

        if (moved) {
            const rect = chip.getBoundingClientRect();
            const vw = window.innerWidth || 1;
            const vh = window.innerHeight || 1;
            const s = getSettings();
            s.mailChipPlaced = true;
            s.mailChipX = Math.round((rect.left / vw) * 1000) / 10;
            s.mailChipY = Math.round((rect.top / vh) * 1000) / 10;
            saveSettings();
            chipDragActive = false;
            applyChipPosition(chip);
            return;
        }

        chipDragActive = false;
        // Tap — open phone / inbox
        const unread = getUnreadCount();
        if (unread > 0) {
            openInbox();
        } else {
            togglePhone();
        }
    };

    chip.addEventListener('pointerdown', (ev) => {
        if (ev.button != null && ev.button !== 0) {
            return;
        }
        pointerId = ev.pointerId;
        dragging = true;
        moved = false;
        startX = ev.clientX;
        startY = ev.clientY;
        const rect = chip.getBoundingClientRect();
        originLeft = rect.left;
        originTop = rect.top;
        chipW = rect.width || chip.offsetWidth || 80;
        chipH = rect.height || chip.offsetHeight || 28;
        try {
            chip.setPointerCapture(pointerId);
        } catch {
            /* ignore */
        }
        window.addEventListener('pointermove', onMove, { passive: false });
        window.addEventListener('pointerup', onUp);
        window.addEventListener('pointercancel', onUp);
    });
}

/**
 * @param {HTMLElement} chip
 */
function applyChipPosition(chip) {
    if (chipDragActive) {
        return;
    }
    const s = getSettings();
    const placed = s.mailChipPlaced === true
        || (s.mailChipX != null && s.mailChipY != null
            && Number.isFinite(Number(s.mailChipX))
            && Number.isFinite(Number(s.mailChipY)));

    if (!placed) {
        chip.classList.remove('pp-mail-chip-placed');
        chip.style.removeProperty('left');
        chip.style.removeProperty('top');
        chip.style.removeProperty('right');
        chip.style.removeProperty('bottom');
        chip.style.removeProperty('transform');
        return;
    }

    const vw = window.innerWidth || 1;
    const vh = window.innerHeight || 1;
    const w = chip.offsetWidth || 80;
    const h = chip.offsetHeight || 28;
    let left = (Number(s.mailChipX) / 100) * vw;
    let top = (Number(s.mailChipY) / 100) * vh;
    left = Math.max(4, Math.min(vw - w - 4, left));
    top = Math.max(4, Math.min(vh - h - 4, top));

    chip.classList.add('pp-mail-chip-placed');
    chip.style.setProperty('left', `${Math.round(left)}px`, 'important');
    chip.style.setProperty('top', `${Math.round(top)}px`, 'important');
    chip.style.setProperty('right', 'auto', 'important');
    chip.style.setProperty('bottom', 'auto', 'important');
    chip.style.setProperty('transform', 'none', 'important');
}

export function resetMailChipPosition() {
    const s = getSettings();
    s.mailChipPlaced = false;
    s.mailChipX = null;
    s.mailChipY = null;
    saveSettings();
    const chip = document.getElementById('pp-mail-chip');
    if (chip) {
        applyChipPosition(chip);
    }
}

export function updateFabVisibility() {
    const settings = getSettings();
    const chip = document.getElementById('pp-mail-chip');
    const showChip = settings.enabled && settings.showMailChip !== false;

    if (chip) {
        chip.hidden = !showChip;
        chip.style.display = showChip ? '' : 'none';
        if (showChip && !chipDragActive) {
            applyChipPosition(chip);
        }
    }
    document.getElementById('pp-fab')?.remove();
    updateBadge();
}

export function updateBadge() {
    const n = getUnreadCount();
    const label = n > 9 ? '9+' : String(n);

    const chip = document.getElementById('pp-mail-chip');
    const chipCount = document.getElementById('pp-mail-chip-count');
    if (chipCount) {
        if (n > 0) {
            chipCount.hidden = false;
            chipCount.textContent = label;
        } else {
            chipCount.hidden = true;
        }
    }
    chip?.classList.toggle('pp-mail-chip-alert', n > 0);
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
    if (screen === 'dmail-propose') {
        document.getElementById('pp-propose-skip')?.click();
        return;
    }
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
        memory: 'mail',
        dmail: 'settings',
        'dmail-propose': 'outbox',
    };
    const next = stack[screen];
    if (!next) {
        closePhone();
        return;
    }
    if (screen === 'inbox' && forcePanelOpen) {
        forcePanelOpen = false;
        render();
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
    if (screen === 'inbox') {
        forcePanelOpen = false;
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
        forcePanelOpen = false;
        screen = 'compose';
        composeSubject = '';
        composeBody = '';
        composeReplyTo = null;
        composeToKey = '';
        render();
    } else if (screen === 'read') {
        startReply();
    } else if (screen === 'compose') {
        document.getElementById('pp-send-btn')?.click();
    } else if (screen === 'dmail-propose') {
        document.getElementById('pp-propose-apply')?.click();
    } else if (screen === 'settings' || screen === 'wallpaper' || screen === 'sounds' || screen === 'dmail') {
        screen = 'home';
        render();
    } else if (screen === 'memory') {
        // soft-left: reset to auto for current character
        document.getElementById('pp-memory-auto')?.click();
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
    composeToKey = mail.characterKey
        || listMailContacts().find((c) => c.name === mail.from || c.name === mail.to)?.key
        || '';
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
        case 'dmail':
            renderDmailSettings(view);
            break;
        case 'dmail-propose':
            renderDmailPropose(view);
            break;
        case 'wallpaper':
            renderWallpaper(view);
            break;
        case 'sounds':
            renderSounds(view);
            break;
        case 'memory':
            renderMemory(view);
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
        <button type="button" class="pp-row" data-goto="memory">
            <span>Memory</span>
            <span class="pp-row-meta">◎</span>
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

    const forceBlock = which === 'inbox' && forcePanelOpen ? renderForceMailPanelHtml() : '';

    view.innerHTML = `
        <div class="pp-title pp-title-bar">
            <span class="pp-title-text">${title}</span>
            ${which === 'inbox' ? '<button type="button" class="pp-signal-hotspot" id="pp-force-toggle" title="" aria-label="Signal"></button>' : ''}
        </div>
        <div class="pp-scroll">${forceBlock}${rows}</div>
    `;

    if (which === 'inbox') {
        wireForceMailPanel(view);
    }

    view.querySelectorAll('[data-mail]').forEach((btn) => {
        btn.addEventListener('click', async () => {
            activeMailId = btn.getAttribute('data-mail');
            await markRead(activeMailId);
            forcePanelOpen = false;
            screen = 'read';
            render();
        });
    });
}

function renderForceMailPanelHtml() {
    const contacts = listMailContacts().filter((c) => !isPhoneWaveContact(c.key));
    const active = contacts.find((c) => c.key === forceFromKey)
        || contacts.find((c) => c.isActive)
        || contacts[0];
    if (active && !forceFromKey) {
        forceFromKey = active.key;
    }

    return `
        <div class="pp-force-panel" id="pp-force-panel">
            <div class="pp-field">
                <span class="pp-label">From</span>
                <div id="pp-force-from-host"></div>
            </div>
            <label class="pp-field">
                <span class="pp-label">Subject</span>
                <input type="text" id="pp-force-subject" value="${escapeHtml(forceSubject)}" placeholder="optional" />
            </label>
            <label class="pp-field">
                <span class="pp-label">Guide</span>
                <textarea id="pp-force-guide" rows="2" placeholder="What they should write about…">${escapeHtml(forceGuidance)}</textarea>
            </label>
            <button type="button" class="pp-btn" id="pp-force-send">Receive</button>
        </div>
    `;
}

/**
 * @param {HTMLElement} view
 */
function wireForceMailPanel(view) {
    const hotspot = view.querySelector('#pp-force-toggle');
    let holdTimer = null;

    const toggle = () => {
        forcePanelOpen = !forcePanelOpen;
        render();
    };

    // Short tap on the signal glyph — discreet, looks like status chrome
    hotspot?.addEventListener('click', (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        toggle();
    });

    // Long-press the title text as a second quiet entry
    const titleText = view.querySelector('.pp-title-text');
    const clearHold = () => {
        if (holdTimer) {
            clearTimeout(holdTimer);
            holdTimer = null;
        }
    };
    titleText?.addEventListener('pointerdown', () => {
        clearHold();
        holdTimer = setTimeout(() => {
            holdTimer = null;
            if (!forcePanelOpen) {
                forcePanelOpen = true;
                render();
            }
        }, 650);
    });
    titleText?.addEventListener('pointerup', clearHold);
    titleText?.addEventListener('pointerleave', clearHold);
    titleText?.addEventListener('pointercancel', clearHold);

    if (!forcePanelOpen) {
        return;
    }

    const subjectInput = /** @type {HTMLInputElement|null} */ (view.querySelector('#pp-force-subject'));
    const guideInput = /** @type {HTMLTextAreaElement|null} */ (view.querySelector('#pp-force-guide'));
    const sendBtn = /** @type {HTMLButtonElement|null} */ (view.querySelector('#pp-force-send'));
    const forceContacts = listMailContacts().filter((c) => !isPhoneWaveContact(c.key));

    mountContactPicker(view.querySelector('#pp-force-from-host'), {
        contacts: forceContacts,
        selectedKey: forceFromKey,
        emptyLabel: '—',
        onChange: (key) => {
            forceFromKey = key;
        },
    });

    subjectInput?.addEventListener('input', () => {
        forceSubject = subjectInput.value || '';
    });
    guideInput?.addEventListener('input', () => {
        forceGuidance = guideInput.value || '';
    });

    sendBtn?.addEventListener('click', () => {
        const contact = forceContacts.find((c) => c.key === forceFromKey)
            || forceContacts[0];
        if (!contact) {
            toast('No character in this chat', 'warning');
            return;
        }
        forceGuidance = guideInput?.value || forceGuidance;
        forceSubject = subjectInput?.value || forceSubject;
        forceFromKey = contact.key;

        sendBtn.disabled = true;
        sendBtn.textContent = '…';

        try {
            const { delayMs } = scheduleForcedCharacterMail(contact, {
                guidance: forceGuidance,
                subject: forceSubject,
                delay: true,
            });
            forcePanelOpen = false;
            const secs = Math.max(1, Math.round(delayMs / 1000));
            toast(`Incoming from ${contact.name} (~${secs}s)`, 'info');
            render();
        } catch (err) {
            sendBtn.disabled = false;
            sendBtn.textContent = 'Receive';
            toast(err?.message || 'Failed', 'error');
        }
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
    const active = contacts.find((c) => c.key === composeToKey)
        || contacts.find((c) => c.isActive && !isPhoneWaveContact(c.key))
        || contacts.find((c) => !isPhoneWaveContact(c.key))
        || contacts[0];
    if (active) {
        composeToKey = active.key;
    }

    view.innerHTML = `
        <div class="pp-title">New mail</div>
        <div class="pp-scroll pp-compose">
            <div class="pp-field">
                <span class="pp-label">To</span>
                <div id="pp-compose-to-host"></div>
            </div>
            <p class="pp-dmail-hint" id="pp-dmail-hint" hidden>
                Sending to <strong>${escapeHtml(PHONEWAVE_NAME)}</strong> transmits a D-Mail.
                No reply arrives — the worldline shifts instead.
            </p>
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

    const hint = view.querySelector('#pp-dmail-hint');
    const sendBtn = /** @type {HTMLButtonElement | null} */ (view.querySelector('#pp-send-btn'));

    const syncDmailUi = () => {
        const dmail = isPhoneWaveContact(composeToKey);
        if (hint) {
            hint.hidden = !dmail;
        }
        if (sendBtn) {
            sendBtn.textContent = dmail ? 'Send D-Mail' : 'Send';
        }
        setSoftLabels(dmail ? 'D-Mail' : 'Send', 'Back');
    };

    mountContactPicker(view.querySelector('#pp-compose-to-host'), {
        contacts,
        selectedKey: composeToKey,
        emptyLabel: getActiveCharacterName(),
        optionLabel: (c) => {
            if (isPhoneWaveContact(c.key)) {
                return c.name;
            }
            return c.isActive ? `${c.name} ★` : c.name;
        },
        onChange: (key) => {
            composeToKey = key;
            syncDmailUi();
        },
    });
    syncDmailUi();

    const sync = () => {
        composeSubject = /** @type {HTMLInputElement} */ (view.querySelector('#pp-compose-subject'))?.value || '';
        composeBody = /** @type {HTMLTextAreaElement} */ (view.querySelector('#pp-compose-body'))?.value || '';
    };
    view.querySelector('#pp-compose-subject')?.addEventListener('input', sync);
    view.querySelector('#pp-compose-body')?.addEventListener('input', sync);

    const send = async () => {
        sync();
        const contact = contacts.find((c) => c.key === composeToKey) || contacts[0];
        const toKey = contact?.key || '';
        const toName = contact?.name || '';
        const dmail = isPhoneWaveContact(toKey) || isPhoneWaveContact(toName);
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
            const subject = composeSubject || '(no subject)';
            const body = composeBody;
            if (dmail) {
                const tiers = getDmailTiers();
                const result = await sendUserEmail({
                    to: toName,
                    toKey,
                    subject,
                    body,
                    inReplyTo: composeReplyTo || undefined,
                    requestReply: false,
                });
                composeSubject = '';
                composeBody = '';
                composeReplyTo = null;
                proposeFact = String(result.worldlineFact || body).trim();
                proposeSubject = subject;
                closePhone();
                if (tiers.spectacle) {
                    await playDmailSequence();
                }
                if (tiers.propose) {
                    openPhone('dmail-propose');
                    return;
                }
                toast('Worldline shifted', 'success', 'D-MAIL');
                return;
            }

            const animPromise = playSendAnimation(view, { to: toName, subject });
            await sendUserEmail({
                to: toName,
                toKey,
                subject,
                body,
                inReplyTo: composeReplyTo || undefined,
                requestReply: true,
            });
            await animPromise;
            composeSubject = '';
            composeBody = '';
            composeReplyTo = null;
            screen = 'outbox';
            toast(`Sent → ${toName}`, 'success', 'MAIL SENT');
            render();
        } catch (err) {
            console.error(err);
            view.querySelector('.pp-send-overlay')?.remove();
            toast(dmail ? 'D-Mail failed' : 'Send failed', 'error');
            if (btn) {
                btn.disabled = false;
                btn.textContent = dmail ? 'Send D-Mail' : 'Send';
            }
        }
    };

    view.querySelector('#pp-send-btn')?.addEventListener('click', send);
}

/**
 * Email-client style send animation on the compose screen.
 * @param {HTMLElement} view
 * @param {{ to: string, subject: string }} meta
 */
function playSendAnimation(view, meta) {
    return new Promise((resolve) => {
        view.querySelector('.pp-send-overlay')?.remove();
        const overlay = document.createElement('div');
        overlay.className = 'pp-send-overlay';
        overlay.innerHTML = `
            <div class="pp-send-card">
                <div class="pp-send-envelope" aria-hidden="true">
                    <div class="pp-send-flap"></div>
                    <div class="pp-send-sheet"></div>
                </div>
                <div class="pp-send-meta">
                    <div class="pp-send-to">TO ${escapeHtml(meta.to || '')}</div>
                    <div class="pp-send-subj">${escapeHtml(meta.subject || '')}</div>
                </div>
                <div class="pp-send-status" id="pp-send-status">Connecting…</div>
                <div class="pp-send-track"><div class="pp-send-bar" id="pp-send-bar"></div></div>
            </div>
        `;
        view.appendChild(overlay);
        requestAnimationFrame(() => overlay.classList.add('pp-send-on'));

        const status = overlay.querySelector('#pp-send-status');
        const bar = overlay.querySelector('#pp-send-bar');
        const steps = [
            { t: 0, text: 'Connecting…', w: '18%' },
            { t: 320, text: 'Composing MIME…', w: '42%' },
            { t: 700, text: 'Uploading…', w: '78%' },
            { t: 1100, text: 'Sent', w: '100%' },
        ];
        for (const step of steps) {
            window.setTimeout(() => {
                if (status) {
                    status.textContent = step.text;
                }
                if (bar) {
                    bar.style.width = step.w;
                }
                if (step.text === 'Sent') {
                    overlay.classList.add('pp-send-done');
                }
            }, step.t);
        }
        window.setTimeout(() => {
            overlay.classList.add('pp-send-out');
            window.setTimeout(() => {
                overlay.remove();
                resolve();
            }, 260);
        }, 1500);
    });
}

function renderSettings(view) {
    setSoftLabels('Home', 'Back');
    view.style.background = '';
    view.className = 'pp-view';
    const tiers = getDmailTiers();
    const dmailMeta = [
        tiers.spectacle ? 'Fx' : null,
        tiers.worldline ? 'WL' : null,
        tiers.propose ? 'Ask' : null,
        tiers.apply ? 'Apply' : null,
    ].filter(Boolean).join('·') || 'Off';

    view.innerHTML = `
        <div class="pp-title">Settings</div>
        <div class="pp-scroll">
            <button type="button" class="pp-row" data-goto="dmail">
                <span>D-Mail</span>
                <span class="pp-row-meta">${escapeHtml(dmailMeta)} →</span>
            </button>
            <button type="button" class="pp-row" data-goto="wallpaper"><span>Wallpaper</span><span class="pp-row-meta">→</span></button>
            <button type="button" class="pp-row" data-goto="sounds"><span>Sounds</span><span class="pp-row-meta">→</span></button>
            <button type="button" class="pp-row" data-goto="memory"><span>Mail memory</span><span class="pp-row-meta">◎</span></button>
            <button type="button" class="pp-row" id="pp-test-notify"><span>Test notification</span><span class="pp-row-meta">♪</span></button>
            <button type="button" class="pp-row" id="pp-test-ring"><span>Test ringtone</span><span class="pp-row-meta">♪</span></button>
            <button type="button" class="pp-row pp-danger" id="pp-clear-mail"><span>Clear all mail</span><span class="pp-row-meta">!</span></button>
        </div>
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

function renderDmailSettings(view) {
    setSoftLabels('Home', 'Back');
    view.style.background = '';
    view.className = 'pp-view';
    const tiers = getDmailTiers();
    const rows = [
        {
            key: 'dmailSpectacle',
            on: tiers.spectacle,
            title: 'Spectacle',
            blurb: 'Play divergence meter + end distortion when a D-Mail sends.',
        },
        {
            key: 'dmailWorldline',
            on: tiers.worldline,
            title: 'Worldline overlay',
            blurb: 'Inject quiet worldline facts into chat context.',
        },
        {
            key: 'dmailPropose',
            on: tiers.propose,
            title: 'Propose',
            blurb: 'Review / edit the fact on-phone before it takes effect.',
        },
        {
            key: 'dmailApply',
            on: tiers.apply,
            title: 'Apply',
            blurb: 'Also write the fact into chat history as a system note.',
        },
    ];

    view.innerHTML = `
        <div class="pp-title">D-Mail</div>
        <div class="pp-scroll">
            <p class="pp-settings-note">
                Mail to <strong>${escapeHtml(PHONEWAVE_NAME)}</strong> uses these tiers.
            </p>
            ${rows.map((r) => `
                <button type="button" class="pp-row pp-toggle-row ${r.on ? 'pp-toggle-on' : ''}" data-tier="${r.key}">
                    <span class="pp-toggle-copy">
                        <span class="pp-toggle-title">${escapeHtml(r.title)}</span>
                        <span class="pp-toggle-blurb">${escapeHtml(r.blurb)}</span>
                    </span>
                    <span class="pp-row-meta pp-toggle-state">${r.on ? 'ON' : 'OFF'}</span>
                </button>
            `).join('')}
        </div>
    `;

    view.querySelectorAll('[data-tier]').forEach((btn) => {
        btn.addEventListener('click', () => {
            const key = /** @type {'dmailSpectacle'|'dmailWorldline'|'dmailPropose'|'dmailApply'} */ (
                btn.getAttribute('data-tier')
            );
            const s = getSettings();
            setDmailTier(key, !Boolean(s[key]));
            render();
        });
    });
}

function renderDmailPropose(view) {
    setSoftLabels('Apply', 'Skip');
    view.style.background = '';
    view.className = 'pp-view';
    view.innerHTML = `
        <div class="pp-title">Worldline</div>
        <div class="pp-scroll pp-compose">
            <p class="pp-settings-note">Proposed shift${proposeSubject ? ` · ${escapeHtml(proposeSubject)}` : ''}</p>
            <label class="pp-field">
                <span class="pp-label">Fact</span>
                <textarea id="pp-propose-fact" rows="7">${escapeHtml(proposeFact)}</textarea>
            </label>
            <button type="button" class="pp-btn" id="pp-propose-apply">Apply</button>
            <button type="button" class="pp-btn pp-btn-ghost" id="pp-propose-skip">Skip</button>
        </div>
    `;

    const factInput = /** @type {HTMLTextAreaElement | null} */ (view.querySelector('#pp-propose-fact'));
    factInput?.addEventListener('input', () => {
        proposeFact = factInput.value || '';
    });

    const finish = async (accept) => {
        if (accept) {
            proposeFact = factInput?.value?.trim() || proposeFact;
            const result = await acceptWorldlineFact(proposeFact);
            const bits = [];
            if (result.worldline) {
                bits.push('overlay');
            }
            if (result.applied) {
                bits.push('chat');
            }
            toast(bits.length ? `Applied · ${bits.join('+')}` : 'Saved', 'success', 'D-MAIL');
        } else {
            toast('Proposal skipped', 'info', 'D-MAIL');
        }
        proposeFact = '';
        proposeSubject = '';
        screen = 'outbox';
        render();
    };

    view.querySelector('#pp-propose-apply')?.addEventListener('click', () => void finish(true));
    view.querySelector('#pp-propose-skip')?.addEventListener('click', () => void finish(false));
}

/**
 * Themed contact picker (replaces native &lt;select&gt;).
 * @param {Element | null} host
 * @param {{
 *   contacts: Array<{ key: string, name: string, isActive?: boolean }>,
 *   selectedKey?: string,
 *   emptyLabel?: string,
 *   optionLabel?: (c: { key: string, name: string, isActive?: boolean }) => string,
 *   onChange?: (key: string, contact: { key: string, name: string } | null) => void,
 * }} opts
 */
function mountContactPicker(host, opts) {
    if (!host) {
        return;
    }
    const contacts = opts.contacts || [];
    let selectedKey = opts.selectedKey || contacts[0]?.key || '';
    const labelOf = opts.optionLabel || ((c) => c.name);

    const selected = contacts.find((c) => c.key === selectedKey) || contacts[0] || null;
    if (selected) {
        selectedKey = selected.key;
    }

    host.innerHTML = `
        <div class="pp-picker" data-open="0">
            <button type="button" class="pp-picker-btn" aria-haspopup="listbox" aria-expanded="false">
                <span class="pp-picker-value">${escapeHtml(selected ? labelOf(selected) : (opts.emptyLabel || '—'))}</span>
                <span class="pp-picker-caret" aria-hidden="true">▾</span>
            </button>
            <div class="pp-picker-menu" role="listbox" hidden>
                ${contacts.length
        ? contacts.map((c) => `
                        <button type="button" class="pp-picker-option ${c.key === selectedKey ? 'pp-picker-active' : ''}"
                            role="option" data-key="${escapeHtml(c.key)}" ${c.key === selectedKey ? 'aria-selected="true"' : ''}>
                            ${escapeHtml(labelOf(c))}
                        </button>
                    `).join('')
        : `<div class="pp-picker-empty">${escapeHtml(opts.emptyLabel || '—')}</div>`}
            </div>
        </div>
    `;

    const rootEl = host.querySelector('.pp-picker');
    const btn = host.querySelector('.pp-picker-btn');
    const menu = host.querySelector('.pp-picker-menu');
    const valueEl = host.querySelector('.pp-picker-value');

    const setOpen = (open) => {
        if (!rootEl || !menu || !btn) {
            return;
        }
        rootEl.setAttribute('data-open', open ? '1' : '0');
        menu.hidden = !open;
        btn.setAttribute('aria-expanded', open ? 'true' : 'false');
        if (open) {
            // Close other pickers in the same view
            host.closest('.pp-view')?.querySelectorAll('.pp-picker[data-open="1"]').forEach((other) => {
                if (other !== rootEl) {
                    other.setAttribute('data-open', '0');
                    const m = other.querySelector('.pp-picker-menu');
                    const b = other.querySelector('.pp-picker-btn');
                    if (m) {
                        m.hidden = true;
                    }
                    b?.setAttribute('aria-expanded', 'false');
                }
            });
        }
    };

    btn?.addEventListener('click', (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        setOpen(rootEl?.getAttribute('data-open') !== '1');
    });

    host.querySelectorAll('.pp-picker-option').forEach((opt) => {
        opt.addEventListener('click', (ev) => {
            ev.preventDefault();
            ev.stopPropagation();
            const key = opt.getAttribute('data-key') || '';
            const contact = contacts.find((c) => c.key === key) || null;
            selectedKey = key;
            if (valueEl) {
                valueEl.textContent = contact ? labelOf(contact) : (opts.emptyLabel || '—');
            }
            host.querySelectorAll('.pp-picker-option').forEach((o) => {
                const on = o.getAttribute('data-key') === key;
                o.classList.toggle('pp-picker-active', on);
                o.setAttribute('aria-selected', on ? 'true' : 'false');
            });
            setOpen(false);
            opts.onChange?.(key, contact);
        });
    });
}

function memoryScopeSetting() {
    return getSettings().mailMemoryScope === 'all' ? 'all' : 'speaker';
}

function renderMemory(view) {
    setSoftLabels('Auto', 'Back');
    view.style.background = '';
    view.className = 'pp-view';

    const contacts = listMailContacts().filter((c) => !isPhoneWaveContact(c.key));
    const scope = memoryScopeSetting();
    let contact = contacts.find((c) => c.key === memoryCharKey)
        || contacts.find((c) => c.isActive)
        || contacts[0]
        || null;
    if (contact) {
        memoryCharKey = contact.key;
    }

    const selection = contact ? getMemorySelection(contact.key) : { mode: 'auto', ids: [] };
    const activeIds = new Set(
        contact
            ? getEmailsForCharacterMemory(contact, { scope, max: 80 }).map((e) => e.id)
            : [],
    );
    const autoIds = new Set(
        contact ? listAutoMemoryEmails(contact, scope).map((e) => e.id) : [],
    );

    const listSource = (() => {
        const all = getEmails();
        if (!contact) {
            return all;
        }
        if (memoryShowAll) {
            return all;
        }
        return all.filter((e) => autoIds.has(e.id) || activeIds.has(e.id) || emailInvolvesLoose(e, contact));
    })();

    const options = contacts.length
        ? contacts.map((c) => {
            const selected = contact && c.key === contact.key ? ' selected' : '';
            const sel = getMemorySelection(c.key);
            const mark = sel.mode === 'manual' ? ' ●' : '';
            return `<option value="${escapeHtml(c.key)}"${selected}>${escapeHtml(c.name)}${mark}</option>`;
        }).join('')
        : '<option value="">—</option>';

    const modeLabel = selection.mode === 'manual'
        ? `Manual · ${activeIds.size}`
        : `Auto · ${activeIds.size}`;

    const rows = listSource.length
        ? listSource.map((e) => {
            const checked = activeIds.has(e.id);
            const involves = contact ? emailInvolvesLoose(e, contact) : false;
            const dir = e.direction === 'in' ? '←' : '→';
            const who = e.direction === 'in' ? e.from : e.to;
            return `
                <label class="pp-memory-row ${checked ? 'pp-memory-on' : ''} ${involves ? '' : 'pp-memory-extra'}">
                    <input type="checkbox" class="pp-memory-check" data-mail-id="${escapeHtml(e.id)}" ${checked ? 'checked' : ''} />
                    <span class="pp-memory-body">
                        <span class="pp-memory-line">
                            <span class="pp-memory-dir">${dir}</span>
                            <span class="pp-mail-from">${escapeHtml(who)}</span>
                            <span class="pp-mail-time">${escapeHtml(formatTime(e.timestamp))}</span>
                        </span>
                        <span class="pp-mail-subj">${escapeHtml(e.subject)}</span>
                        <span class="pp-mail-preview">${escapeHtml(e.body.replace(/\s+/g, ' ').slice(0, 48))}</span>
                    </span>
                </label>
            `;
        }).join('')
        : '<div class="pp-empty">No messages</div>';

    view.innerHTML = `
        <div class="pp-title">Memory</div>
        <div class="pp-memory-toolbar">
            <div class="pp-field pp-memory-char">
                <span class="pp-label">Character</span>
                <div id="pp-memory-char-host"></div>
            </div>
            <div class="pp-memory-meta">
                <span id="pp-memory-mode">${escapeHtml(modeLabel)}</span>
                <button type="button" class="pp-chip-btn" id="pp-memory-toggle-all">${memoryShowAll ? 'Involving' : 'All mail'}</button>
            </div>
            <div class="pp-memory-actions">
                <button type="button" class="pp-chip-btn" id="pp-memory-auto">Auto</button>
                <button type="button" class="pp-chip-btn" id="pp-memory-involving">To/From</button>
                <button type="button" class="pp-chip-btn" id="pp-memory-none">None</button>
            </div>
        </div>
        <div class="pp-scroll pp-memory-list">${rows}</div>
    `;

    mountContactPicker(view.querySelector('#pp-memory-char-host'), {
        contacts,
        selectedKey: memoryCharKey,
        emptyLabel: '—',
        optionLabel: (c) => {
            const sel = getMemorySelection(c.key);
            return sel.mode === 'manual' ? `${c.name} ●` : c.name;
        },
        onChange: (key) => {
            memoryCharKey = key;
            render();
        },
    });

    view.querySelector('#pp-memory-toggle-all')?.addEventListener('click', () => {
        memoryShowAll = !memoryShowAll;
        render();
    });

    view.querySelector('#pp-memory-auto')?.addEventListener('click', async () => {
        if (!contact) {
            return;
        }
        await setMemorySelection(contact.key, { mode: 'auto', ids: [] });
        updateMailPrompt(contact);
        toast(`Auto memory · ${contact.name}`, 'info');
        render();
    });

    view.querySelector('#pp-memory-involving')?.addEventListener('click', async () => {
        if (!contact) {
            return;
        }
        const ids = listAutoMemoryEmails(contact, scope).map((e) => e.id);
        await setMemorySelection(contact.key, { mode: 'manual', ids });
        updateMailPrompt(contact);
        toast(`To/From · ${ids.length}`, 'info');
        render();
    });

    view.querySelector('#pp-memory-none')?.addEventListener('click', async () => {
        if (!contact) {
            return;
        }
        await setMemorySelection(contact.key, { mode: 'manual', ids: [] });
        updateMailPrompt(contact);
        toast('Cleared picks', 'info');
        render();
    });

    view.querySelectorAll('.pp-memory-check').forEach((input) => {
        input.addEventListener('change', async () => {
            if (!contact) {
                return;
            }
            const id = input.getAttribute('data-mail-id') || '';
            const on = /** @type {HTMLInputElement} */ (input).checked;
            await toggleCharacterMemoryEmail(contact, id, on, scope);
            updateMailPrompt(contact);
            // Update mode label without full re-render to keep scroll position
            const sel = getMemorySelection(contact.key);
            const count = getEmailsForCharacterMemory(contact, { scope, max: 80 }).length;
            const modeEl = view.querySelector('#pp-memory-mode');
            if (modeEl) {
                modeEl.textContent = sel.mode === 'manual' ? `Manual · ${count}` : `Auto · ${count}`;
            }
            const row = input.closest('.pp-memory-row');
            row?.classList.toggle('pp-memory-on', on);
        });
    });
}

/** Loose involve check for Memory list filtering (same as store helper). */
function emailInvolvesLoose(email, contact) {
    if (!email || !contact) {
        return false;
    }
    const key = String(contact.key || '').trim();
    const name = String(contact.name || '').trim().toLowerCase();
    if (key && email.characterKey === key) {
        return true;
    }
    if (name) {
        if (String(email.from || '').trim().toLowerCase() === name) {
            return true;
        }
        if (String(email.to || '').trim().toLowerCase() === name) {
            return true;
        }
    }
    return false;
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
            const next = btn.getAttribute('data-goto') || 'home';
            if (screen === 'inbox' && next !== 'inbox') {
                forcePanelOpen = false;
            }
            screen = next;
            if (screen === 'compose') {
                composeSubject = '';
                composeBody = '';
                composeReplyTo = null;
                composeToKey = '';
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
