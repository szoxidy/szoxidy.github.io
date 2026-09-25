import { PAGE_SIZE, pageNumbers, ensurePage } from './comment-pagination.js';

const controllers = new Map();
const defaultAvatar = '/img/comment-avatar.svg';

function improveAvatars(root) {
    root.querySelectorAll('.tk-avatar img').forEach(img => {
        try {
            const url = new URL(img.src);
            if (/^(weavatar\.com|cravatar\.cn|(?:[^.]+\.)?gravatar\.com)$/.test(url.hostname)
                && url.searchParams.get('d')?.startsWith('initials')) {
                // Change only the fallback style; an existing personal avatar wins.
                url.searchParams.set('d', 'mp');
                url.searchParams.delete('name');
                img.src = url.href;
            }
        } catch { /* Relative or malformed avatars are handled by the error event. */ }
        if (!img.dataset.blogAvatar) {
            img.dataset.blogAvatar = 'true';
            img.addEventListener('error', () => {
                if (!img.src.endsWith(defaultAvatar)) img.src = defaultAvatar;
            });
        }
    });
}

function attach(container) {
    let page = 1;
    let busy = false;
    let message = '';
    let firstId;
    let signature;
    let retryPage = 1;
    let cancelLoad;
    const nav = document.createElement('nav');
    nav.className = 'blog-comment-pagination';
    nav.setAttribute('aria-label', '评论分页');
    const status = document.createElement('div');
    status.className = 'blog-comment-page-status';
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    container.append(nav, status);

    const rows = () => Array.from(container.children).filter(el => el.classList.contains('tk-comment'));
    const moreButton = () => container.querySelector(':scope > .tk-expand-wrap > .tk-expand');
    const read = () => {
        const items = rows();
        const count = Number(container.querySelector('.tk-comments-count > span')?.textContent.trim());
        return { ids: items.map(el => el.id), total: Math.max(count || 0, items.length), more: !!moreButton() };
    };

    function loadMore() {
        return new Promise((resolve, reject) => {
            const button = moreButton();
            if (!button) return resolve();
            const ids = read().ids.join('|');
            let timer;
            const finish = error => {
                observer.disconnect();
                clearTimeout(timer);
                cancelLoad = null;
                error ? reject(error) : resolve();
            };
            const observer = new MutationObserver(() => {
                if (!container.isConnected) finish(new Error('页面已切换。'));
                else if (read().ids.join('|') !== ids) finish();
                else if (container.querySelector('.tk-comments-error')) finish(new Error('评论加载失败，请重试。'));
                else if (!moreButton()) finish();
            });
            observer.observe(container, { childList: true, subtree: true, characterData: true });
            timer = setTimeout(() => finish(new Error('评论加载超时，请重试。')), 15000);
            cancelLoad = () => finish(new Error('页面已切换。'));
            button.click();
        });
    }

    function button(text, target, disabled = false) {
        const el = document.createElement('button');
        el.type = 'button';
        el.textContent = text;
        el.disabled = disabled || busy;
        if (Number(text) === page) el.setAttribute('aria-current', 'page');
        el.addEventListener('click', () => select(target, true));
        return el;
    }

    function render() {
        if (container.lastElementChild !== status || status.previousElementSibling !== nav) container.append(nav, status);
        const state = read();
        const total = Math.max(1, Math.ceil((state.more ? state.total : state.ids.length) / PAGE_SIZE));
        page = Math.min(page, total);
        rows().forEach((row, i) => row.toggleAttribute('data-page-hidden', i < (page - 1) * PAGE_SIZE || i >= page * PAGE_SIZE));
        container.classList.add('blog-comment-paged');
        const nextSignature = JSON.stringify([page, total, busy, message, retryPage]);
        if (signature === nextSignature) return;
        signature = nextSignature;
        nav.replaceChildren();
        status.replaceChildren();
        nav.hidden = total <= 1;
        if (total > 1) {
            nav.append(button('上一页', page - 1, page === 1));
            for (const n of pageNumbers(page, total)) {
                if (typeof n === 'number') nav.append(button(String(n), n));
                else { const gap = document.createElement('span'); gap.textContent = n; nav.append(gap); }
            }
            nav.append(button('下一页', page + 1, page === total));
        }
        status.hidden = !busy && !message;
        if (busy) status.textContent = '正在加载评论…';
        else if (message) {
            status.append(document.createTextNode(message), button('重试', retryPage));
        }
    }

    async function select(target, scroll = false) {
        if (busy || target < 1) return;
        busy = true;
        message = '';
        retryPage = target;
        render();
        try {
            const resolved = await ensurePage(target, read, loadMore);
            if (!container.isConnected) return;
            page = resolved;
            if (scroll) container.scrollIntoView({ block: 'start', behavior: 'auto' });
        } catch (error) {
            if (container.isConnected) message = error.message;
        } finally {
            busy = false;
            if (container.isConnected) {
                render();
                if (scroll) nav.querySelector('[aria-current="page"]')?.focus({ preventScroll: true });
            }
        }
    }

    return {
        sync() {
            const state = read();
            if (firstId !== state.ids[0]) {
                firstId = state.ids[0];
                page = 1;
                message = '';
            }
            render();
            if (!busy && !message && state.ids.length && state.more && state.ids.length < Math.min(page * PAGE_SIZE, state.total)) select(page);
        },
        destroy() { cancelLoad?.(); }
    };
}

let queued = false;
function sync() {
    queued = false;
    for (const [container, controller] of controllers) {
        if (!container.isConnected) { controller.destroy(); controllers.delete(container); }
    }
    document.querySelectorAll('#twikoo').forEach(root => {
        improveAvatars(root);
        root.querySelectorAll('.tk-submit textarea').forEach(input => {
            if (!input.placeholder) input.placeholder = '写下你的想法，支持 Markdown…';
        });
        root.querySelectorAll('.tk-comments-container').forEach(container => {
            if (!controllers.has(container)) controllers.set(container, attach(container));
            controllers.get(container).sync();
        });
    });
}
function schedule(records) {
    if (Array.isArray(records) && !records.some(record => {
        const target = record.target.nodeType === 1 ? record.target : record.target.parentElement;
        if (target?.closest('.blog-comment-pagination, .blog-comment-page-status')) return false;
        if (target?.closest('#twikoo')) return true;
        return [...record.addedNodes, ...record.removedNodes].some(node => node.nodeType === 1
            && (node.id === 'twikoo' || node.querySelector('#twikoo')));
    })) return;
    if (!queued) { queued = true; requestAnimationFrame(sync); }
}
const observer = new MutationObserver(schedule);
observer.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['src'] });
document.addEventListener('pjax:complete', schedule);
sync();
