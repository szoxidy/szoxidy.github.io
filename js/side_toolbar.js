(() => {
    'use strict';

    const storageKey = 'szoxidy-toolbar-side';
    const toolbars = new WeakMap();
    let side = 'right';
    try {
        side = localStorage.getItem(storageKey) === 'left' ? 'left' : 'right';
    } catch (_) {
        // Storage may be disabled.
    }

    const update = toolbar => {
        toolbar.classList.toggle('toolbar-on-left', side === 'left');
        const switcher = toolbar.querySelector('#toolbar-switch-side');
        if (!switcher) return;
        const label = side === 'left' ? '移至右侧' : '移至左侧';
        switcher.title = label;
        switcher.setAttribute('aria-label', label);
        switcher.firstElementChild.className = `fa-solid fa-caret-${side === 'left' ? 'right' : 'left'}`;
    };

    const changeSide = toolbar => {
        side = side === 'left' ? 'right' : 'left';
        update(toolbar);
        try {
            localStorage.setItem(storageKey, side);
        } catch (_) {
            // Keep the choice for this page.
        }
    };

    let aside = null;
    let asideObserver = null;
    let asideFrame = 0;
    let asideCards = [];
    const asideMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const restoreAsideCards = () => {
        for (const { card, scale, opacity } of asideCards) {
            card.style.scale = scale;
            card.style.opacity = opacity;
        }
    };
    const updateAsideEdges = () => {
        asideFrame = 0;
        if (!aside?.isConnected) return;
        const viewport = window.visualViewport;
        const viewportTop = viewport?.offsetTop || 0;
        const bottom = viewportTop + (viewport?.height || window.innerHeight);
        const asideTop = aside.getBoundingClientRect().top;
        const scrollable = ['auto', 'scroll'].includes(getComputedStyle(aside).overflowY);
        if (scrollable) {
            const top = Math.max(viewportTop + 20, asideTop);
            const height = Math.floor(bottom - top - 20);
            if (height > 0) aside.style.setProperty('--aside-visible-height', `${height}px`);
        } else aside.style.removeProperty('--aside-visible-height');
        const remaining = scrollable ? Math.max(0, aside.scrollHeight - aside.clientHeight - aside.scrollTop) : 0;
        aside.style.setProperty('--aside-edge-fade', `${Math.min(48, remaining, aside.clientHeight / 2)}px`);
        aside.style.setProperty('--aside-edge-corner', `${Math.min(20, remaining / 3, aside.clientHeight / 4)}px`);
        aside.classList.toggle('aside-scroll-edges', remaining > 1);
        const animateCards = scrollable && window.matchMedia('(min-width: 901px)').matches && !asideMotion.matches;
        aside.classList.toggle('aside-card-entry', animateCards);
        if (!animateCards) {
            restoreAsideCards();
            return;
        }
        // Match the reference's entry 0..100px without requiring view timelines.
        // offset geometry stays unchanged by scale; reading transformed card
        // rectangles would feed each frame's scale back into the next one.
        const visibleBottom = Math.max(0, Math.min(aside.clientHeight, bottom - 20 - asideTop));
        const entries = asideCards.map(saved => {
            let top = 0;
            let node = saved.card;
            while (node && node !== aside) {
                top += node.offsetTop;
                node = node.offsetParent;
            }
            const progress = node === aside && saved.card.offsetHeight
                ? Math.max(0, Math.min(1, (aside.scrollTop + visibleBottom - top) / 100)) : null;
            return { ...saved, progress };
        });
        for (const { card, scale, opacity, progress } of entries) {
            card.style.scale = progress === null ? scale : String(.8 + .2 * progress);
            card.style.opacity = progress === null ? opacity : String(progress);
        }
    };
    const queueAsideEdges = () => {
        if (aside && !asideFrame) asideFrame = requestAnimationFrame(updateAsideEdges);
    };
    const initAsideEdges = () => {
        const next = document.querySelector('#page-header.full_page + .layout > #aside-content');
        if (next === aside) {
            queueAsideEdges();
            return;
        }
        if (asideFrame) cancelAnimationFrame(asideFrame);
        asideFrame = 0;
        aside?.removeEventListener('scroll', queueAsideEdges);
        aside?.classList.remove('aside-card-entry');
        restoreAsideCards();
        asideCards = [];
        asideObserver?.disconnect();
        asideObserver = null;
        aside = next;
        if (!aside) return;
        asideCards = [...aside.querySelectorAll('.card-widget')].map(card => ({ card, scale: card.style.scale, opacity: card.style.opacity }));
        aside.addEventListener('scroll', queueAsideEdges, { passive: true });
        asideObserver = new ResizeObserver(queueAsideEdges);
        asideObserver.observe(aside);
        for (const child of new Set([...aside.children, ...asideCards.map(({ card }) => card)])) asideObserver.observe(child);
        queueAsideEdges();
    };

    const init = () => {
        initAsideEdges();
        const toolbar = document.getElementById('rightside');
        const top = document.getElementById('go-up');
        if (!toolbar || !top) return;

        let state = toolbars.get(toolbar);
        if (!state) {
            state = { settings: null, expanded: false, animation: null };
            toolbars.set(toolbar, state);
            toolbar.classList.add('side-switchable');

            // The outer toolbar survives PJAX; resolve its replacement children per click.
            toolbar.addEventListener('click', event => {
                if (event.target.closest('#rightside-config')) {
                    const settings = toolbar.querySelector('#rightside-config-hide');
                    const settingsButton = toolbar.querySelector('#rightside-config');
                    if (!settings || !settingsButton) return;
                    event.stopImmediatePropagation();

                    const fromHeight = settings.getBoundingClientRect().height;
                    const fromOpacity = Number(getComputedStyle(settings).opacity);
                    state.animation?.cancel();
                    state.animation = null;
                    state.expanded = !state.expanded;
                    settings.inert = !state.expanded;
                    settingsButton.setAttribute('aria-expanded', String(state.expanded));

                    const height = state.expanded ? settings.scrollHeight : 0;
                    settings.style.height = state.expanded ? 'auto' : '0px';
                    settings.style.opacity = state.expanded ? '1' : '0';
                    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

                    state.animation = settings.animate([
                        { height: `${fromHeight}px`, opacity: fromOpacity },
                        { height: `${height}px`, opacity: state.expanded ? 1 : 0 }
                    ], {
                        duration: 260,
                        easing: 'cubic-bezier(.22,1,.36,1)'
                    });
                    return;
                }

                if (!event.target.closest('#toolbar-switch-side') || toolbar.classList.contains('side-switching')) return;
                if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
                    changeSide(toolbar);
                    return;
                }

                // Change the anchored side only after fading out; never travel across the page.
                toolbar.classList.add('side-switching');
                window.setTimeout(() => {
                    changeSide(toolbar);
                    toolbar.classList.remove('side-switching');
                }, 300);
            }, { capture: true });
        }

        const settings = toolbar.querySelector('#rightside-config-hide');
        const settingsButton = toolbar.querySelector('#rightside-config');
        if (settings !== state.settings) {
            state.animation?.cancel();
            state.animation = null;
            state.settings = settings;
            state.expanded = false;
            if (settings) {
                settings.inert = true;
                settings.style.height = '0px';
                settings.style.opacity = '0';
            }
        }
        if (settings && settingsButton) {
            settingsButton.setAttribute('aria-expanded', String(state.expanded));
            settingsButton.setAttribute('aria-controls', settings.id);
        }

        if (!toolbar.querySelector('#toolbar-switch-side')) {
            const switcher = document.createElement('button');
            switcher.type = 'button';
            switcher.id = 'toolbar-switch-side';
            switcher.innerHTML = '<i class="fa-solid fa-caret-left" aria-hidden="true"></i>';
            top.before(switcher);
        }
        update(toolbar);
    };

    window.addEventListener('resize', queueAsideEdges);
    window.addEventListener('scroll', queueAsideEdges, { passive: true });
    window.addEventListener('pageshow', queueAsideEdges);
    window.visualViewport?.addEventListener('resize', queueAsideEdges);
    window.visualViewport?.addEventListener('scroll', queueAsideEdges);
    if (asideMotion.addEventListener) asideMotion.addEventListener('change', queueAsideEdges);
    else asideMotion.addListener?.(queueAsideEdges);

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init, { once: true });
    } else {
        init();
    }
    document.addEventListener('pjax:complete', init);
})();
