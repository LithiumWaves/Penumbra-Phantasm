/**
 * Classic flip-phone multi-tap (T9-style) keypad helpers.
 */

export const T9_MAP = Object.freeze({
    '1': '.,?!1@\'"-()',
    '2': 'abc2',
    '3': 'def3',
    '4': 'ghi4',
    '5': 'jkl5',
    '6': 'mno6',
    '7': 'pqrs7',
    '8': 'tuv8',
    '9': 'wxyz9',
    '0': ' 0',
    '*': '*',
    '#': '#',
});

/** Labels under digits on the chassis keys. */
export const KEY_LABELS = Object.freeze({
    '1': '.,?!',
    '2': 'ABC',
    '3': 'DEF',
    '4': 'GHI',
    '5': 'JKL',
    '6': 'MNO',
    '7': 'PQRS',
    '8': 'TUV',
    '9': 'WXYZ',
    '0': '_',
    '*': 'Aa',
    '#': '#',
});

const MULTI_TAP_MS = 800;
const LONG_PRESS_MS = 420;

/**
 * @typedef {Object} KeypadController
 * @property {(digit: string) => void} tap
 * @property {(digit: string) => void} longPress
 * @property {() => void} backspace
 * @property {() => void} toggleCase
 * @property {() => boolean} isUpper
 * @property {() => void} reset
 */

/**
 * @param {{ getTarget: () => HTMLInputElement | HTMLTextAreaElement | null }} opts
 * @returns {KeypadController}
 */
export function createKeypadController(opts) {
    let upper = false;
    /** @type {{ digit: string, index: number, at: number, start: number } | null} */
    let cycle = null;
    let commitTimer = 0;

    const getTarget = () => {
        const el = opts.getTarget?.();
        if (!el || el.disabled || el.readOnly) {
            return null;
        }
        return el;
    };

    const fireInput = (el) => {
        el.dispatchEvent(new Event('input', { bubbles: true }));
    };

    const commitCycle = () => {
        cycle = null;
        if (commitTimer) {
            clearTimeout(commitTimer);
            commitTimer = 0;
        }
    };

    const scheduleCommit = () => {
        if (commitTimer) {
            clearTimeout(commitTimer);
        }
        commitTimer = globalThis.setTimeout(() => {
            commitCycle();
        }, MULTI_TAP_MS);
    };

    /**
     * @param {HTMLInputElement | HTMLTextAreaElement} el
     * @param {string} ch
     * @param {{ replace?: boolean, start?: number }} [mode]
     */
    const writeChar = (el, ch, mode = {}) => {
        const value = el.value || '';
        const selStart = el.selectionStart ?? value.length;
        const selEnd = el.selectionEnd ?? value.length;
        let start = mode.replace && mode.start != null ? mode.start : selStart;
        let end = mode.replace ? selStart : selEnd;
        if (mode.replace && cycle) {
            start = cycle.start;
            end = cycle.start + 1;
        }
        const next = value.slice(0, start) + ch + value.slice(end);
        el.value = next;
        const caret = start + ch.length;
        try {
            el.setSelectionRange(caret, caret);
        } catch {
            /* some inputs */
        }
        fireInput(el);
    };

    const letterFor = (digit, index) => {
        const set = T9_MAP[digit] || digit;
        let ch = set[index % set.length] || digit;
        if (/[a-z]/.test(ch) && upper) {
            ch = ch.toUpperCase();
        }
        return ch;
    };

    return {
        tap(digit) {
            const el = getTarget();
            if (!el) {
                return;
            }
            el.focus();

            if (digit === '*') {
                commitCycle();
                upper = !upper;
                return;
            }
            if (digit === '#') {
                commitCycle();
                writeChar(el, '#');
                return;
            }

            const set = T9_MAP[digit];
            if (!set) {
                return;
            }

            const now = Date.now();
            if (cycle && cycle.digit === digit && now - cycle.at < MULTI_TAP_MS) {
                cycle.index = (cycle.index + 1) % set.length;
                cycle.at = now;
                const ch = letterFor(digit, cycle.index);
                writeChar(el, ch, { replace: true, start: cycle.start });
                scheduleCommit();
                return;
            }

            commitCycle();
            const start = el.selectionStart ?? (el.value || '').length;
            const ch = letterFor(digit, 0);
            writeChar(el, ch);
            cycle = { digit, index: 0, at: now, start };
            scheduleCommit();
        },

        longPress(digit) {
            const el = getTarget();
            if (!el) {
                return;
            }
            el.focus();
            commitCycle();
            // Literal digit / symbol (classic phone long-press)
            const ch = digit === '0' ? '0' : digit;
            writeChar(el, ch);
        },

        backspace() {
            const el = getTarget();
            if (!el) {
                return;
            }
            el.focus();
            commitCycle();
            const value = el.value || '';
            const selStart = el.selectionStart ?? value.length;
            const selEnd = el.selectionEnd ?? value.length;
            if (selStart !== selEnd) {
                el.value = value.slice(0, selStart) + value.slice(selEnd);
                try {
                    el.setSelectionRange(selStart, selStart);
                } catch {
                    /* ignore */
                }
            } else if (selStart > 0) {
                el.value = value.slice(0, selStart - 1) + value.slice(selStart);
                try {
                    el.setSelectionRange(selStart - 1, selStart - 1);
                } catch {
                    /* ignore */
                }
            }
            fireInput(el);
        },

        toggleCase() {
            upper = !upper;
            commitCycle();
        },

        isUpper() {
            return upper;
        },

        reset() {
            commitCycle();
        },
    };
}

export { MULTI_TAP_MS, LONG_PRESS_MS };
