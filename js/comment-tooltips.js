const roots = new WeakSet();
let bubble;
let active;
let restoreTitle;
let owner;

function hide() {
    if (bubble) bubble.dataset.visible = 'false';
    restoreTitle?.();
    restoreTitle = null;
    active = owner = null;
}

function targetFor(root, node) {
    if (!(node instanceof Element)) return null;
    const target = node.closest('.blog-math-captcha, .comment-extra-field')
        || node.closest('[data-comment-tooltip], time[data-full-date], [title]');
    if (!target || !root.contains(target)) return null;
    if (target.matches('.comment-extra-field') && target.closest('.comment-extra-panel')?.dataset.tooltipReady !== 'true') return null;
    let text = target.dataset.fullDate || target.dataset.commentTooltip || target.getAttribute('title');
    if (target.matches('.blog-math-captcha')) text = target.querySelector('.blog-captcha-tooltip')?.textContent;
    if (target.matches('.comment-extra-field')) text = 'http(s)://';
    return text?.trim() ? { target, text: text.trim() } : null;
}

function show(root, node) {
    const info = targetFor(root, node);
    if (!info) return;
    if (active === info.target && bubble?.textContent === info.text) return;
    hide();
    if (!bubble) {
        bubble = document.createElement('div');
        bubble.className = 'comment-floating-tooltip';
        bubble.id = 'comment-floating-tooltip';
        bubble.setAttribute('role', 'tooltip');
        document.body.append(bubble);
        window.addEventListener('scroll', hide, true);
        window.addEventListener('resize', hide);
        document.addEventListener('pjax:send', hide);
        document.addEventListener('keydown', event => { if (event.key === 'Escape') hide(); });
    }
    active = info.target;
    owner = root;
    // Suppress the browser's delayed title while our animated bubble is open.
    const titled = [active, ...active.querySelectorAll('[title]')].filter(el => el.hasAttribute('title'));
    const titles = titled.map(el => [el, el.getAttribute('title')]);
    titles.forEach(([el]) => el.removeAttribute('title'));
    const previousDescription = active.getAttribute('aria-describedby');
    active.setAttribute('aria-describedby', [previousDescription, bubble.id].filter(Boolean).join(' '));
    const anchor = active;
    restoreTitle = () => {
        titles.forEach(([el, title]) => { if (!el.hasAttribute('title')) el.setAttribute('title', title); });
        if (previousDescription === null) anchor.removeAttribute('aria-describedby');
        else anchor.setAttribute('aria-describedby', previousDescription);
    };
    bubble.textContent = info.text;
    bubble.dataset.visible = 'false';
    const rect = active.getBoundingClientRect();
    const width = bubble.offsetWidth;
    const height = bubble.offsetHeight;
    const left = Math.min(Math.max(8, rect.left + (rect.width - width) / 2), Math.max(8, innerWidth - width - 8));
    const above = rect.top - height - 8;
    const top = above >= 8 ? above : Math.min(rect.bottom + 8, innerHeight - height - 8);
    bubble.style.left = `${left}px`;
    bubble.style.top = `${Math.max(8, top)}px`;
    // Commit the hidden state before entering, including when switching targets.
    void bubble.offsetWidth;
    bubble.dataset.visible = 'true';
}

export function improveCommentTooltips(root) {
    if (roots.has(root)) return;
    roots.add(root);
    root.addEventListener('mouseover', event => show(root, event.target));
    root.addEventListener('mouseout', event => {
        if (owner !== root || active?.contains(event.relatedTarget)) return;
        hide();
    });
    root.addEventListener('focusin', event => show(root, event.target));
    root.addEventListener('focusout', event => {
        if (owner !== root || active?.contains(event.relatedTarget)) return;
        hide();
    });
}
