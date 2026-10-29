import { pageNumbers } from './comment-pagination.js?v=53ae2c2265';

const discussions = new WeakMap();
const devices = new WeakMap();
const REPLIES_PER_PAGE = 5;

function agentName(value) {
    return value.replace(/\s+\d[\d._]*(?:\s.*)?$/, '').trim();
}

function decorateDevice(extra) {
    const text = extra.querySelector('.tk-extra-text');
    if (!text) return;
    const previous = devices.get(extra);
    const value = text.textContent.replace(/\u00a0/g, ' ').trim();
    if (previous?.output === value) return;
    const brand = /windows/i.test(value) ? 'windows' : /edge/i.test(value) ? 'edge'
        : /chrome|chromium/i.test(value) ? 'chrome' : /firefox/i.test(value) ? 'firefox'
        : /safari/i.test(value) ? 'safari' : /android/i.test(value) ? 'android'
        : /ubuntu/i.test(value) ? 'ubuntu' : /linux/i.test(value) ? 'linux'
        : /mac|ios|iphone|ipad/i.test(value) ? 'apple' : '';
    const output = brand ? agentName(value) : value;
    extra.dataset.agent = brand;
    // A reduced UA only proves the major version, not a zero-valued build.
    extra.title = value.replace(/\b(Chrome|Chromium|Edge|Opera)\s+(\d+)(?:\.0){1,3}$/i, '$1 $2');
    if (text.textContent !== output) text.textContent = output;
    devices.set(extra, { output });
}

function replyPager(replies) {
    let page = 1;
    let signature = '';
    let previousIds = [];
    const nav = document.createElement('nav');
    nav.className = 'comment-reply-pagination comment-reader-owned';
    nav.setAttribute('aria-label', '评论回复分页');
    // Keep the controls outside Vue's keyed reply list.
    replies.after(nav);
    const rows = () => Array.from(replies.children).filter(el => el.classList.contains('tk-comment'));

    function show(target, focus = false) {
        const anchorTop = focus ? nav.getBoundingClientRect().top : null;
        const items = rows();
        const total = Math.max(1, Math.ceil(items.length / REPLIES_PER_PAGE));
        page = Math.min(Math.max(1, target), total);
        const activeComposer = items.findIndex(row => row.querySelector('.tk-submit'));
        if (activeComposer >= 0) page = Math.floor(activeComposer / REPLIES_PER_PAGE) + 1;
        items.forEach((row, index) => {
            const hidden = index < (page - 1) * REPLIES_PER_PAGE || index >= page * REPLIES_PER_PAGE;
            row.toggleAttribute('data-reply-page-hidden', hidden);
        });
        nav.hidden = total <= 1;
        const next = JSON.stringify([page, total, items.length]);
        if (next !== signature) {
            signature = next;
            nav.replaceChildren();
            if (total > 1) {
                const add = (label, target, disabled = false) => {
                    const button = document.createElement('button');
                    button.type = 'button';
                    button.textContent = label;
                    button.disabled = disabled;
                    button.setAttribute('aria-label', /^\d+$/.test(label) ? `回复第 ${label} 页` : `${label}回复`);
                    if (String(page) === label) button.setAttribute('aria-current', 'page');
                    button.addEventListener('click', () => show(target, true));
                    nav.append(button);
                };
                const caption = document.createElement('span');
                caption.className = 'comment-reply-page-caption';
                caption.textContent = `${items.length} 条回复`;
                nav.append(caption);
                add('上一页', page - 1, page === 1);
                for (const number of pageNumbers(page, total)) {
                    if (typeof number === 'number') add(String(number), number);
                    else {
                        const gap = document.createElement('span');
                        gap.textContent = number;
                        nav.append(gap);
                    }
                }
                add('下一页', page + 1, page === total);
            }
        }
        if (focus) {
            // Reply pages have different heights. Keep the pager under the pointer
            // instead of scrolling to the top or letting it move with the content.
            const shift = nav.getBoundingClientRect().top - anchorTop;
            if (shift) window.scrollBy({ top: shift, behavior: 'instant' });
            nav.querySelector('[aria-current="page"]')?.focus({ preventScroll: true });
        }
    }
    return {
        reveal(row) {
            const index = rows().indexOf(row);
            if (index >= 0) show(Math.floor(index / REPLIES_PER_PAGE) + 1);
        },
        sync() {
            if (!nav.isConnected) replies.after(nav);
            const ids = rows().map(row => row.id);
            const composer = rows().some(row => row.querySelector('.tk-submit'));
            if (ids.join('|') === previousIds.join('|') && !composer) return;
            previousIds = ids;
            // Keep native chronological reply order; never sort/reinsert Vue nodes.
            show(page);
        }
    };
}

export function improveDiscussion(root) {
    let state = discussions.get(root);
    if (!state) {
        state = { pagers: new WeakMap() };
        discussions.set(root, state);
        root.addEventListener('click', event => {
            const link = event.target.closest?.('.tk-ruser');
            if (!link) return;
            const id = globalThis.blogCommentParents?.get(link.closest('.tk-comment')?.id);
            const target = id && document.getElementById(id);
            if (!target || !root.contains(target)) return;
            const replies = target.parentElement;
            if (replies.classList.contains('tk-replies')) state.pagers.get(replies)?.reveal(target);
        }, true);
    }
    root.querySelectorAll('.tk-extras .tk-extra').forEach(decorateDevice);
    root.querySelectorAll('.tk-comment time').forEach(time => {
        if (!time.dataset.readerDate && time.dateTime) {
            const date = new Date(time.dateTime);
            if (!Number.isNaN(date.getTime())) {
                time.textContent = `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
                const pad = value => String(value).padStart(2, '0');
                time.dataset.fullDate = `${time.textContent} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
                time.removeAttribute('title');
                time.tabIndex = 0;
                time.dataset.readerDate = time.dateTime;
            }
        }
    });
    root.querySelectorAll('.tk-replies').forEach(replies => {
        // Empty leaf reply lists need no nav/controller.
        if (!replies.querySelector(':scope > .tk-comment') && !state.pagers.has(replies)) return;
        const items = Array.from(replies.children).filter(row => row.classList.contains('tk-comment'));
        const byId = new Map(items.map(row => [row.id, row]));
        const levels = new Map();
        const level = (row, seen = new Set()) => {
            if (levels.has(row.id)) return levels.get(row.id);
            if (seen.has(row.id)) return 0;
            seen.add(row.id);
            const pid = row.__vue__?.comment?.pid || globalThis.blogCommentParents?.get(row.id);
            const parent = byId.get(pid);
            const depth = parent ? Math.min(3, level(parent, seen) + 1) : 0;
            levels.set(row.id, depth);
            return depth;
        };
        items.forEach(row => {
            const depth = String(level(row));
            if (row.dataset.replyDepth !== depth) {
                row.dataset.replyDepth = depth;
                row.style.setProperty('--reply-depth', depth);
            }
        });
        if (!state.pagers.has(replies)) state.pagers.set(replies, replyPager(replies));
        state.pagers.get(replies).sync();
    });
}

// Native input/preview mutations should not rescan every discussion. Ignore
// changes made inside our own pager, and let a single frame merge native updates.
export function classifyCommentMutation(record) {
    const target = record.target.nodeType === 1 ? record.target : record.target.parentElement;
    if (target?.closest('.blog-comment-pagination, .blog-comment-page-status, .comment-reader-owned')) return null;
    if (target?.closest('#twikoo .tk-submit')) return 'compose';
    if (target?.closest('#twikoo')) return 'discussion';
    if ([...record.addedNodes, ...record.removedNodes].some(node => node.nodeType === 1
        && (node.id === 'twikoo' || node.querySelector('#twikoo')))) return 'all';
    return null;
}
