const HOST_ID = 'pp-notify-host';
const MAX_TOASTS = 4;

function readNotifyFlag() {
    try {
        const ctx = typeof SillyTavern !== 'undefined' ? SillyTavern.getContext?.() : null;
        const store = ctx?.extensionSettings ?? window.extension_settings ?? {};
        const s = store['phone-trigger'] || store.PenumbraPhantasm || {};
        return s.notifyInChat !== false;
    } catch {
        return true;
    }
}

/**
 * Ensure the fixed notification host exists (toasts + mail alerts).
 * @returns {HTMLElement}
 */
export function ensureNotifyHost() {
    let host = document.getElementById(HOST_ID);
    if (host) {
        return host;
    }
    host = document.createElement('div');
    host.id = HOST_ID;
    host.className = 'pp-notify-host';
    host.setAttribute('aria-live', 'polite');
    document.body.appendChild(host);
    return host;
}

/**
 * Steins;Gate-styled toast — replaces default toastr for this extension.
 * @param {string} message
 * @param {'info'|'success'|'warning'|'error'|'mail'} [type]
 * @param {string} [title]
 * @param {{ duration?: number, onClick?: () => void, from?: string, subject?: string }} [opts]
 */
export function toast(message, type = 'info', title = 'PHONE TRIGGER', opts = {}) {
    // Mail alerts respect the notification toggle; other UI feedback always shows.
    if (type === 'mail' && !readNotifyFlag()) {
        return;
    }

    const host = ensureNotifyHost();
    while (host.querySelectorAll('.pp-toast').length >= MAX_TOASTS) {
        host.querySelector('.pp-toast')?.remove();
    }

    const el = document.createElement('div');
    const kind = ['info', 'success', 'warning', 'error', 'mail'].includes(type) ? type : 'info';
    el.className = `pp-toast pp-toast-${kind}`;
    el.setAttribute('role', 'status');

    const head = title || (kind === 'mail' ? 'MAIL RECEIVED' : 'PHONE TRIGGER');
    const from = opts.from ? escapeHtml(opts.from) : '';
    const subject = opts.subject ? escapeHtml(opts.subject) : '';
    const body = escapeHtml(String(message || ''));

    el.innerHTML = `
        <div class="pp-toast-rail" aria-hidden="true"></div>
        <div class="pp-toast-main">
            <div class="pp-toast-head">
                <span class="pp-toast-sig">▂▄▆█</span>
                <span class="pp-toast-title">${escapeHtml(head)}</span>
                <button type="button" class="pp-toast-x" aria-label="Dismiss">×</button>
            </div>
            ${kind === 'mail' ? `
                <div class="pp-toast-mail">
                    ${from ? `<div class="pp-toast-from">FROM ${from}</div>` : ''}
                    ${subject ? `<div class="pp-toast-subj">${subject}</div>` : ''}
                    ${body && body !== subject ? `<div class="pp-toast-msg">${body}</div>` : ''}
                </div>
            ` : `<div class="pp-toast-msg">${body}</div>`}
        </div>
    `;

    const dismiss = () => {
        el.classList.add('pp-toast-out');
        window.setTimeout(() => el.remove(), 280);
    };

    el.querySelector('.pp-toast-x')?.addEventListener('click', (ev) => {
        ev.stopPropagation();
        dismiss();
    });

    if (typeof opts.onClick === 'function') {
        el.classList.add('pp-toast-clickable');
        el.addEventListener('click', () => {
            opts.onClick();
            dismiss();
        });
    }

    host.appendChild(el);
    requestAnimationFrame(() => el.classList.add('pp-toast-in'));

    const duration = Number.isFinite(opts.duration)
        ? opts.duration
        : (kind === 'mail' ? 6500 : kind === 'error' ? 5000 : 3200);
    if (duration > 0) {
        window.setTimeout(dismiss, duration);
    }
}

/**
 * Incoming mail alert — themed toast + optional click-through.
 * @param {{ from: string, subject: string, onOpen?: () => void }} mail
 */
export function notifyIncomingMail(mail) {
    if (!readNotifyFlag()) {
        return;
    }
    toast(mail.subject || 'New message', 'mail', 'MAIL RECEIVED', {
        from: mail.from,
        subject: mail.subject,
        onClick: typeof mail.onOpen === 'function' ? mail.onOpen : undefined,
        duration: 7000,
    });
}

function escapeHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}
