(() => {
    'use strict';
    if (window.blogArticleEntry) return;
    window.blogArticleEntry = true;

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let pendingCard = null;
    let active = null;

    const clear = () => {
        if (active) {
            active.cancelled = true;
            active.animation?.cancel();
            active.revealAnimation?.cancel();
            active.preview.remove();
            active.card?.classList.remove('article-entry-source');
            active.list?.classList.remove('article-entry-list-pending');
            active.list?.removeAttribute('aria-busy');
            active.post?.removeAttribute('aria-busy');
        }
        active = null;
        pendingCard = null;
        document.body.classList.remove('article-entry-pending');
        document.querySelector('#post')?.removeAttribute('aria-busy');
    };

    const reveal = state => {
        if (state.cancelled || active !== state || state.revealing || !state.loaded || !state.moved) return;
        state.revealing = true;
        // Pjax has already replaced the DOM and finished its own scroll handling.
        if (!location.hash) window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
        const content = document.querySelector('#post');
        state.post = content;
        content?.classList.add('article-entry-managed');
        document.body.classList.remove('article-entry-pending');
        content?.removeAttribute('aria-busy');
        const animation = state.revealAnimation = content?.animate([
            { opacity: 0, transform: 'translateY(14px)' },
            { opacity: 1, transform: 'translateY(0)' }
        ], { duration: 300, easing: 'cubic-bezier(.22,1,.36,1)' });
        state.preview.animate([{ opacity: 1 }, { opacity: 0 }], {
            duration: 180, fill: 'forwards'
        });
        (animation?.finished || Promise.resolve()).then(() => {
            if (active === state) clear();
        }, () => { if (active === state) clear(); });
    };

    const begin = card => {
        const rect = card.getBoundingClientRect();
        const preview = document.createElement('div');
        preview.className = 'article-entry-preview';
        preview.setAttribute('role', 'status');
        preview.setAttribute('aria-label', '正在加载文章');
        const heading = document.createElement('div');
        heading.className = 'article-entry-title';
        heading.textContent = card.querySelector('.article-title')?.textContent || '';
        preview.appendChild(heading);
        for (const [selector, className] of [
            ['.article-meta-wrap', 'article-entry-meta'],
            ['.content', 'article-entry-excerpt']
        ]) {
            const source = card.querySelector(selector);
            if (!source) continue;
            const part = document.createElement('div');
            part.className = className;
            part.textContent = selector === '.article-meta-wrap'
                ? Array.from(source.children, child => child.textContent.trim()).join(' ')
                : source.textContent;
            preview.appendChild(part);
        }
        const dots = document.createElement('div');
        dots.className = 'article-entry-dots';
        dots.setAttribute('aria-hidden', 'true');
        for (let index = 0; index < 8; index++) dots.appendChild(document.createElement('span'));
        preview.appendChild(dots);
        Object.assign(preview.style, {
            left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`,
            minHeight: `${Math.min(rect.height, 360)}px`
        });
        document.body.appendChild(preview);
        card.classList.add('article-entry-source');
        document.body.classList.add('article-entry-pending');
        const list = card.closest('#recent-posts');
        list?.classList.add('article-entry-list-pending');
        list?.setAttribute('aria-busy', 'true');
        const state = { preview, card, list, moved: false, loaded: false, cancelled: false };
        active = state;
        // Resolve the same responsive height used by the destination header.
        const measure = document.createElement('div');
        measure.style.height = 'var(--article-header-height)';
        preview.appendChild(measure);
        const headerHeight = measure.getBoundingClientRect().height;
        measure.remove();
        const layoutPadding = parseFloat(getComputedStyle(document.querySelector('#content-inner')).paddingTop) || 40;
        state.animation = preview.animate([
            { transform: 'translateY(0)' },
            { transform: `translateY(${headerHeight + layoutPadding - rect.top}px)` }
        ], { duration: 500, easing: 'cubic-bezier(.22,1,.36,1)', fill: 'forwards' });
        window.scrollTo({ top: 0, left: 0, behavior: 'smooth' });
        state.animation.finished.then(() => {
            state.moved = true;
            reveal(state);
        }, () => {});
    };

    document.addEventListener('click', event => {
        pendingCard = null;
        if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey ||
            reducedMotion.matches || !window.pjax) return;
        const link = event.target.closest('a[href]');
        if (!link || link.target === '_blank' || link.hasAttribute('download')) return;
        const target = new URL(link.href, location.href);
        if (target.origin !== location.origin || !target.pathname.startsWith('/posts/') || target.hash) return;
        pendingCard = link.closest('#recent-posts .recent-post-item');
    }, { capture: true });

    document.addEventListener('pjax:send', () => {
        const card = pendingCard;
        clear();
        // History scroll has saved the outgoing position before this listener.
        if (card && !reducedMotion.matches) begin(card);
    });
    document.addEventListener('pjax:success', () => {
        const state = active;
        if (!state) return;
        state.post = document.querySelector('#post');
        if (!state.post) { clear(); return; }
        state.post.setAttribute('aria-busy', 'true');
        state.loaded = true;
        requestAnimationFrame(() => reveal(state));
    });
    document.addEventListener('pjax:error', clear);
    window.addEventListener('popstate', clear, { capture: true });
    window.addEventListener('pagehide', clear);
    reducedMotion.addEventListener('change', clear);
})();
