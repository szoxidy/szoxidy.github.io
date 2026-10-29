(() => {
    'use strict';
    if (window.blogArticleEntry) return;
    window.blogArticleEntry = true;

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let pendingCard = null;
    let active = null;

    const releaseAside = state => {
        if (!state.aside) return;
        state.aside.animation.cancel();
        state.aside.node.style.cssText = state.aside.style;
        state.aside = null;
    };

    const syncAside = state => {
        if (!state.asideRect) return;
        const node = document.querySelector('#aside-content');
        if (!node || state.aside?.node === node) return;
        releaseAside(state);
        const rect = state.asideRect;
        const style = node.style.cssText;
        Object.assign(node.style, {
            position: 'fixed', left: `${rect.left}px`, top: `${rect.top}px`,
            width: `${rect.width}px`, maxHeight: 'none', transition: 'none',
            alignSelf: 'auto', zIndex: '1001'
        });
        const animation = node.animate([
            { transform: 'translateY(0)' },
            { transform: `translateY(${state.targetTop - rect.top}px)` }
        ], state.motion);
        // The replacement sidebar joins the same clock instead of restarting.
        animation.currentTime = state.animation.currentTime || 0;
        if (state.animation.startTime != null) animation.startTime = state.animation.startTime;
        animation.finished.catch(() => {});
        state.aside = { node, style, animation };
    };

    const clear = () => {
        if (active) {
            active.cancelled = true;
            active.animation?.cancel();
            active.revealAnimation?.cancel();
            releaseAside(active);
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
        if (state.cancelled || active !== state || state.revealing || !state.loaded) return;
        state.revealing = true;
        // Content is usable as soon as it arrives; the card movement may finish behind it.
        if (!state.moved) {
            state.animation.commitStyles?.();
            state.animation.cancel();
            state.moved = true;
        }
        releaseAside(state);
        const content = document.querySelector('#post');
        state.post = content;
        content?.classList.add('article-entry-managed');
        document.body.classList.remove('article-entry-pending');
        content?.removeAttribute('aria-busy');
        const animation = state.revealAnimation = content?.animate([
            { opacity: 0 },
            { opacity: 1 }
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
        const aside = window.innerWidth > 900 ? document.querySelector('#aside-content') : null;
        const asideRect = aside?.getBoundingClientRect();
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
        const state = { preview, card, list, moved: false, loaded: false, cancelled: false, width: window.innerWidth };
        active = state;
        // Resolve the same responsive height used by the destination header.
        const measure = document.createElement('div');
        measure.style.height = 'var(--article-header-height)';
        preview.appendChild(measure);
        const headerHeight = measure.getBoundingClientRect().height;
        measure.remove();
        const layoutPadding = parseFloat(getComputedStyle(document.querySelector('#content-inner')).paddingTop) || 40;
        state.targetTop = headerHeight + layoutPadding;
        state.asideRect = asideRect?.width > 0 ? asideRect : null;
        state.motion = { duration: 500, easing: 'cubic-bezier(.22,1,.36,1)', fill: 'forwards' };
        state.animation = preview.animate([
            { transform: 'translateY(0)' },
            { transform: `translateY(${state.targetTop - rect.top}px)` }
        ], state.motion);
        syncAside(state);
        // Pjax owns scroll restoration. Do not fight a reader who starts scrolling.
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
        syncAside(state);
        state.loaded = true;
        requestAnimationFrame(() => reveal(state));
    });
    document.addEventListener('pjax:error', clear);
    window.addEventListener('popstate', clear, { capture: true });
    window.addEventListener('pagehide', clear);
    window.addEventListener('resize', () => {
        if (!active) return;
        // Scrollbar and mobile toolbar changes fire resize during the transition.
        // Only a real viewport change invalidates the measured card position.
        const width = window.innerWidth;
        const crossesLayout = [768, 900].some(point => (width > point) !== (active.width > point));
        if (crossesLayout || Math.abs(width - active.width) > 80) clear();
        else releaseAside(active);
    });
    reducedMotion.addEventListener('change', clear);
})();
