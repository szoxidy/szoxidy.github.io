import { PAGE_SIZE, pageNumbers, ensurePage } from './comment-pagination.js?v=53ae2c2265';
import { animatePanel } from './ui-motion.js?v=804ff4f87f';
import { enhanceMathCaptcha, plainComment } from './math-captcha.js?v=312452946d';

const controllers = new Map();
const previewSignatures = new WeakMap();
const avatarStates = new WeakMap();
const avatarResults = new Map();
const replyHighlights = new WeakMap();
const replyComposers = new WeakMap();
const plainPreviews = new WeakMap();
const markdownDraftKey = 'blog-comment-draft-markdown';
let markdownDraftMode = true;

function initialAvatar(nick) {
    const name = nick.trim() || '访客';
    const letter = Array.from(name)[0].toUpperCase().replace(/[<>&"']/g, char => `&#${char.codePointAt(0)};`);
    let hash = 0;
    for (const char of name) {
        hash = (hash * 31 + char.codePointAt(0)) >>> 0;
    }
    const svg = [
        '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80" viewBox="0 0 80 80">',
        `<rect width="80" height="80" rx="40" fill="hsl(${hash % 360} 55% 42%)"/>`,
        '<text x="40" y="42" dy=".35em" text-anchor="middle" fill="white"',
        ` font-family="sans-serif" font-size="36">${letter}</text>`,
        '</svg>'
    ].join('');
    return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

// Gravatar's classic mirror API uses MD5 of the trimmed, lowercase UTF-8 email.
// This is an avatar identifier, not a password hash.
function emailAvatarHash(email) {
    const bytes = new TextEncoder().encode(email.trim().toLowerCase());
    const size = Math.ceil((bytes.length + 9) / 64) * 64;
    const buffer = new Uint8Array(size);
    buffer.set(bytes);
    buffer[bytes.length] = 0x80;
    const view = new DataView(buffer.buffer);
    view.setUint32(size - 8, bytes.length * 8, true);
    view.setUint32(size - 4, Math.floor(bytes.length / 0x20000000), true);
    const shifts = [7, 12, 17, 22, 5, 9, 14, 20, 4, 11, 16, 23, 6, 10, 15, 21];
    const state = [0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476];
    for (let offset = 0; offset < size; offset += 64) {
        let [a, b, c, d] = state;
        for (let i = 0; i < 64; i++) {
            const round = Math.floor(i / 16);
            let mix, word;
            if (round === 0) {
                mix = (b & c) | (~b & d);
                word = i;
            } else if (round === 1) {
                mix = (d & b) | (~d & c);
                word = (5 * i + 1) % 16;
            } else if (round === 2) {
                mix = b ^ c ^ d;
                word = (3 * i + 5) % 16;
            } else {
                mix = c ^ (b | ~d);
                word = (7 * i) % 16;
            }
            const constant = Math.floor(Math.abs(Math.sin(i + 1)) * 0x100000000);
            const sum = (a + mix + constant + view.getUint32(offset + word * 4, true)) | 0;
            const shift = shifts[round * 4 + i % 4];
            const next = (b + ((sum << shift) | (sum >>> (32 - shift)))) | 0;
            [a, b, c, d] = [d, next, b, c];
        }
        [a, b, c, d].forEach((value, index) => { state[index] = (state[index] + value) | 0; });
    }
    return state.map(word => [0, 8, 16, 24].map(shift =>
        ((word >>> shift) & 0xff).toString(16).padStart(2, '0')).join('')).join('');
}

function avatarCandidates(source, mail) {
    let url;
    try {
        if (source) url = new URL(source, location.href);
    } catch {
        // Missing sources use the local fallback.
    }
    const qqSource = url && /(^|\.)qlogo\.cn$/.test(url.hostname) ? url.searchParams.get('nk') : '';
    const confirmedQQ = /^[1-9]\d{4,10}$/.test(qqSource || '') ? qqSource : '';
    const email = mail.trim().toLowerCase() || (confirmedQQ ? `${confirmedQQ}@qq.com` : '');
    const qq = email.match(/^([1-9]\d{4,10})@qq\.com$/)?.[1];
    const gravatar = url && /^(weavatar\.com|cravatar\.cn|(?:[^.]+\.)?gravatar\.(com|loli\.net))$/.test(url.hostname);
    const candidates = [];
    if (email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        candidates.push(`https://weavatar.com/avatar/${emailAvatarHash(email)}?d=404&s=80`);
    } else if (!email && gravatar) {
        // Published comments may contain only a SHA-256 hash: never reinterpret it as MD5.
        url.searchParams.set('d', '404');
        url.searchParams.delete('name');
        candidates.push(url.href);
    } else if (!email && url && !qqSource && /^https?:$/.test(url.protocol)
        && url.pathname !== '/img/comment-avatar.svg?v=a5c1553b06') {
        candidates.push(url.href);
    }
    if (qq) candidates.push(`https://q1.qlogo.cn/g?b=qq&nk=${qq}&s=640`);
    return [...new Set(candidates)];
}

function loadAvatar(url) {
    return new Promise(resolve => {
        const probe = new Image();
        const finish = success => {
            clearTimeout(timer);
            probe.onload = probe.onerror = null;
            resolve(success);
        };
        const timer = setTimeout(() => finish(false), 4500);
        probe.referrerPolicy = 'no-referrer';
        probe.onload = () => finish(probe.naturalWidth > 0);
        probe.onerror = () => finish(false);
        probe.src = url;
    });
}

function resolveAvatar(img, nick, mail = '') {
    const current = img.getAttribute('src') || '';
    const previous = avatarStates.get(img);
    const source = previous && current === previous.output ? previous.source : current;
    const key = JSON.stringify([source, nick, mail.trim().toLowerCase()]);
    if (previous?.key === key) return;
    const state = { key, source, output: initialAvatar(nick) };
    avatarStates.set(img, state);
    img.src = state.output;
    const requestKey = JSON.stringify([source, mail.trim().toLowerCase()]);
    if (!avatarResults.has(requestKey)) {
        avatarResults.set(requestKey, (async () => {
            const candidates = await avatarCandidates(source, mail);
            for (const url of candidates) {
                if (await loadAvatar(url)) return url;
            }
            return '';
        })().catch(() => ''));
    }
    avatarResults.get(requestKey).then(result => {
        const url = result || initialAvatar(nick);
        if (avatarStates.get(img) !== state || !img.isConnected) return;
        state.output = url;
        img.src = url;
    });
}

function improveMarkdownHelp(submit, actions) {
    const link = actions.querySelector('a.__markdown');
    if (!link) return;
    const control = document.createElement('label');
    control.className = 'comment-markdown-toggle';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.name = 'markdown';
    try {
        const saved = localStorage.getItem(markdownDraftKey);
        if (saved === 'true' || saved === 'false') markdownDraftMode = saved === 'true';
    } catch { /* Keep the in-page mode if browser storage is unavailable. */ }
    checkbox.checked = markdownDraftMode;
    const caption = document.createElement('span');
    caption.textContent = 'Markdown';
    control.append(checkbox, caption);
    submit.dataset.markdown = String(checkbox.checked);
    const composer = submit.__vue__;
    if (composer?.updatePreview) {
        const update = composer.updatePreview.bind(composer);
        composer.updatePreview = () => {
            if (checkbox.checked) return update();
            if (composer.isPreviewing) composer.commentHtml = plainComment(composer.comment);
        };
    }
    checkbox.addEventListener('change', () => {
        markdownDraftMode = checkbox.checked;
        submit.dataset.markdown = String(checkbox.checked);
        try { localStorage.setItem(markdownDraftKey, String(checkbox.checked)); }
        catch { /* The control still works for the current page. */ }
        composer?.updatePreview();
        if (!composer) {
            const input = submit.querySelector('textarea');
            input?.dispatchEvent(new Event('input', { bubbles: true }));
            schedule();
        }
    });
    composer?.updatePreview?.();
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'comment-markdown-help';
    button.title = 'Markdown 语法说明';
    button.setAttribute('aria-label', '查看 Markdown 语法说明');
    button.setAttribute('aria-expanded', 'false');
    const help = document.createElement('div');
    help.className = 'comment-markdown-guide';
    help.hidden = true;
    help.textContent = '支持 Markdown：**加粗**、*斜体*、`行内代码`、[链接](https://example.com)。换行后可用 > 引用和三个反引号书写代码块。';
    button.addEventListener('click', () => {
        const expanded = button.getAttribute('aria-expanded') !== 'true';
        button.setAttribute('aria-expanded', String(expanded));
        help.hidden = !expanded;
    });
    link.replaceWith(button);
    actions.prepend(control);
    actions.after(help);
}

function websiteUrl(value) {
    const text = value.trim();
    const hasUnsupportedScheme = /^[a-z][\w+.-]*:/i.test(text) && !/^https?:\/\//i.test(text);
    if (!text || /\s/.test(text) || hasUnsupportedScheme) return null;
    try {
        const url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`);
        const isWebsite = /^https?:$/.test(url.protocol) && url.hostname.includes('.');
        const hasCredentials = Boolean(url.username || url.password);
        return isWebsite && !hasCredentials ? url.href : null;
    } catch {
        return null;
    }
}

function improvePreview(submit) {
    const preview = submit.querySelector('.tk-preview-container');
    if (!preview) return;
    const body = preview.querySelector(':scope > div:not(.comment-preview-identity)');
    const previous = body && plainPreviews.get(body);
    if (submit.dataset?.markdown === 'false' && !submit.__vue__) {
        const text = submit.querySelector('textarea')?.value || '';
        if (body && (previous?.text !== text || previous.html !== body.innerHTML)) {
            const markdownHtml = previous?.html === body.innerHTML ? previous.markdownHtml : body.innerHTML;
            // Only escaped text generated by plainComment enters this preview.
            body.innerHTML = plainComment(text);
            plainPreviews.set(body, { text, html: body.innerHTML, markdownHtml });
        }
    } else if (previous) {
        // Vue can skip a v-html patch when its reactive value did not change.
        if (body.innerHTML === previous.html) body.innerHTML = previous.markdownHtml;
        plainPreviews.delete(body);
    }
    const read = name => submit.querySelector(`input[name="${name}"]`)?.value.trim() || '';
    const nick = read('nick') || '未填写昵称';
    const mail = read('mail');
    const website = read('link');
    const sourceImage = submit.querySelector('.tk-avatar img');
    const avatar = sourceImage ? (avatarStates.get(sourceImage)?.source || sourceImage.getAttribute('src')) : '';
    const signature = JSON.stringify([nick, mail, website, avatar]);
    let identity = preview.querySelector(':scope > .comment-preview-identity');
    if (identity && previewSignatures.get(preview) === signature) return;
    if (!identity) {
        identity = document.createElement('div');
        identity.className = 'comment-preview-identity';
        preview.prepend(identity);
    }
    previewSignatures.set(preview, signature);
    const image = document.createElement('img');
    image.className = 'comment-preview-avatar';
    if (avatar) image.src = avatar;
    image.alt = `${nick}的头像`;
    resolveAvatar(image, nick, mail);
    const details = document.createElement('div');
    const href = websiteUrl(website);
    const name = document.createElement(href ? 'a' : 'span');
    name.className = 'comment-preview-nick';
    name.textContent = nick;
    if (href) {
        name.className += ' tk-nick-link';
        name.href = href;
        name.target = '_blank';
        name.rel = 'noopener noreferrer nofollow ugc';
    }
    const email = document.createElement('span');
    email.className = 'comment-preview-email';
    email.textContent = mail;
    details.append(name, email);
    identity.replaceChildren(image, details);
}

function improveReplyComposer(root, submit) {
    const composer = submit.__vue__;
    const targetId = composer?.pid || composer?.replyId || submit.closest?.('.tk-comment')?.id;
    const target = targetId && document.getElementById(targetId);
    let summary = submit.querySelector(':scope > .comment-reply-summary');
    if (!submit.isConnected || !targetId || !target?.matches('.tk-comment') || !root.contains(target)) {
        summary?.remove();
        replyComposers.delete(submit);
        return;
    }
    let state = replyComposers.get(submit);
    if (!summary) {
        summary = document.createElement('div');
        summary.className = 'comment-reply-summary';
        summary.setAttribute('role', 'note');
        summary.append(document.createElement('div'), document.createElement('p'));
        submit.prepend(summary);
    }
    const nick = target.querySelector(':scope > .tk-main > .tk-row .tk-nick')?.textContent.trim() || '访客';
    // Read only the target's rendered body, never its reply forms or preview identity.
    const content = target.querySelector(':scope > .tk-main > .tk-content > span:last-child')?.textContent || '';
    const compact = content.replace(/\s+/g, ' ').trim();
    const text = Array.from(compact);
    const excerpt = text.slice(0, 220).join('') + (text.length > 220 ? '…' : '');
    const title = `正在回复 @${nick}`;
    if (summary.children[0].textContent !== title) summary.children[0].textContent = title;
    if (summary.children[1].textContent !== excerpt) summary.children[1].textContent = excerpt;
    if (state?.targetId !== targetId) {
        state = { targetId, focused: false };
        replyComposers.set(submit, state);
    }
    const input = submit.querySelector('textarea');
    if (!state.focused && input && !input.disabled) {
        state.focused = true;
        input.focus({ preventScroll: true });
    }
}

function improveCompose(root) {
    root.querySelectorAll('.tk-submit').forEach(submit => {
        improveReplyComposer(root, submit);
        if (!submit.querySelector(':scope > .comment-compose-title')) {
            const heading = document.createElement('h2');
            heading.className = 'comment-compose-title';
            const icon = document.createElement('i');
            icon.className = 'fas fa-comment-dots';
            icon.setAttribute('aria-hidden', 'true');
            heading.append(icon, document.createTextNode('发送评论'));
            submit.prepend(heading);
        }
        const meta = submit.querySelector('.tk-meta-input');
        meta?.querySelectorAll('.tk-input input[name]').forEach(input => {
            const label = { nick: '昵称', mail: '邮箱', link: '网址（选填）' }[input.name];
            if (label) {
                input.placeholder = label;
                input.setAttribute('aria-label', label);
            }
        });
        let extra = submit.querySelector('.comment-extra-panel');
        const website = meta?.querySelector('input[name="link"]')?.closest('.tk-input');
        if (website && !extra) {
            extra = document.createElement('div');
            extra.className = 'comment-extra-panel';
            extra.hidden = true;
            extra.inert = true;
            meta.after(extra);
            website.classList.add('comment-extra-field');
            const inner = document.createElement('div');
            inner.className = 'comment-extra-inner';
            inner.append(website);
            extra.append(inner);
        }
        const actions = submit.querySelector('.actions');
        if (!meta || !actions || submit.querySelector('.comment-meta-toggle')) return;
        improveMarkdownHelp(submit, actions);
        const toggle = document.createElement('button');
        toggle.type = 'button';
        toggle.className = 'comment-meta-toggle';
        toggle.setAttribute('aria-expanded', 'false');
        toggle.setAttribute('aria-label', '展开选填网址');
        toggle.title = '展开选填网址';
        toggle.innerHTML = '<i class="fas fa-chevron-down" aria-hidden="true"></i>';
        let transitionId = 0;
        toggle.addEventListener('click', () => {
            const expanded = toggle.getAttribute('aria-expanded') !== 'true';
            toggle.setAttribute('aria-expanded', String(expanded));
            toggle.querySelector('i').className = expanded ? 'fas fa-chevron-up' : 'fas fa-chevron-down';
            toggle.setAttribute('aria-label', expanded ? '收起选填网址' : '展开选填网址');
            toggle.title = toggle.getAttribute('aria-label');
            if (extra) {
                const current = ++transitionId;
                extra.dataset.tooltipReady = 'false';
                animatePanel(extra, expanded).then(() => {
                    if (current === transitionId && expanded) extra.dataset.tooltipReady = 'true';
                });
            }
        });
        const toggleRow = document.createElement('div');
        toggleRow.className = 'comment-extra-toggle-row';
        toggleRow.append(toggle);
        actions.before(toggleRow);
    });
}

function improveReplyTargets(root) {
    let state = replyHighlights.get(root);
    if (!state) {
        state = { hovered: null, focused: null, active: new Set() };
        replyHighlights.set(root, state);
        const replyLink = node => {
            const link = node?.closest?.('.tk-ruser');
            return link && root.contains(link) ? link : null;
        };
        const track = (event, key, entering) => {
            const link = replyLink(event.target);
            if (!link || link.contains(event.relatedTarget)) return;
            state[key] = entering ? link : null;
            improveReplyTargets(root);
        };
        root.addEventListener('pointerover', event => track(event, 'hovered', true));
        root.addEventListener('pointerout', event => track(event, 'hovered', false));
        root.addEventListener('focusin', event => track(event, 'focused', true));
        root.addEventListener('focusout', event => track(event, 'focused', false));
    }
    const active = new Set();
    for (const key of ['hovered', 'focused']) {
        const link = state[key];
        if (!link || !root.contains(link)) {
            state[key] = null;
            continue;
        }
        // Twikoo keeps the reply relationship on its comment component.
        const comment = link.closest('.tk-comment');
        const pid = comment?.__vue__?.comment?.pid || globalThis.blogCommentParents?.get(comment?.id);
        const target = pid && document.getElementById(pid);
        if (target?.matches('.tk-comment') && root.contains(target)) active.add(target);
    }
    for (const target of state.active) {
        if (!active.has(target)) target.classList.remove('comment-reply-highlight');
    }
    for (const target of active) {
        target.classList.add('comment-reply-highlight');
    }
    state.active = active;
}

function improveAvatars(root) {
    root.querySelectorAll('.tk-avatar img').forEach(img => {
        const submit = img.closest('.tk-submit');
        const comment = img.closest('.tk-comment');
        const nick = submit?.querySelector('input[name="nick"]')?.value
            || comment?.querySelector('.tk-nick')?.textContent || '访客';
        const mail = submit?.querySelector('input[name="mail"]')?.value || '';
        resolveAvatar(img, nick, mail);
    });
}

function attach(container) {
    const submit = container.parentElement.querySelector(':scope > .tk-submit');
    if (submit) container.parentElement.insertBefore(container, submit);
    const title = container.querySelector('.tk-comments-title');
    if (title && !title.querySelector('.comment-list-title')) {
        const heading = document.createElement('h2');
        heading.className = 'comment-list-title';
        heading.innerHTML = '<i class="fas fa-comments" aria-hidden="true"></i>评论';
        title.prepend(heading);
    }
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
        return {
            ids: items.map(el => el.id),
            total: Math.max(count || 0, items.length),
            more: !!moreButton()
        };
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
        if (container.lastElementChild !== status || status.previousElementSibling !== nav) {
            container.append(nav, status);
        }
        const state = read();
        const total = Math.max(1, Math.ceil((state.more ? state.total : state.ids.length) / PAGE_SIZE));
        page = Math.min(page, total);
        rows().forEach((row, index) => {
            const outsidePage = index < (page - 1) * PAGE_SIZE || index >= page * PAGE_SIZE;
            row.toggleAttribute('data-page-hidden', outsidePage);
        });
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
                else {
                    const gap = document.createElement('span');
                    gap.textContent = n;
                    nav.append(gap);
                }
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
            const needsMore = state.ids.length < Math.min(page * PAGE_SIZE, state.total);
            if (!busy && !message && state.ids.length && state.more && needsMore) {
                select(page);
            }
        },
        destroy() {
            cancelLoad?.();
        }
    };
}

let queued = false;
function sync() {
    queued = false;
    for (const [container, controller] of controllers) {
        if (!container.isConnected) {
            controller.destroy();
            controllers.delete(container);
        }
    }
    document.querySelectorAll('#twikoo').forEach(root => {
        root.querySelectorAll('.tk-footer').forEach(footer => footer.remove());
        improveCompose(root);
        enhanceMathCaptcha(root);
        improveAvatars(root);
        improveReplyTargets(root);
        root.querySelectorAll('.tk-submit textarea').forEach(input => {
            if (!input.placeholder) input.placeholder = '写下你的想法，支持 Markdown…';
        });
        root.querySelectorAll('.tk-submit').forEach(improvePreview);
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
    if (!queued) {
        queued = true;
        requestAnimationFrame(sync);
    }
}
const observer = new MutationObserver(schedule);
observer.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    attributeFilter: ['src']
});
document.addEventListener('input', event => {
    if (event.target.closest('#twikoo .tk-submit')) schedule();
});
document.addEventListener('pjax:complete', schedule);
document.addEventListener('blog:captcha-config', schedule);
sync();
