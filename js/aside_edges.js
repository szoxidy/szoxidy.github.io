import { onPageReady, subscribeMediaQuery } from './lib/lifecycle.js?v=7101918e85';

// Home aside scroll-edge fade, rounded bottom corners and card entry scaling.
let aside = null;
let asideObserver = null;
let asideFrame = 0;
let asideCards = [];

const restoreAsideCards = () => {
    for (const { card, scale, opacity } of asideCards) {
        card.style.scale = scale;
        card.style.opacity = opacity;
    }
};

const { media: asideMotion } = subscribeMediaQuery('(prefers-reduced-motion: reduce)', () => queueAsideEdges());

const updateAsideEdges = () => {
    asideFrame = 0;
    if (!aside?.isConnected) return;
    const viewport = window.visualViewport;
    const viewportTop = viewport?.offsetTop || 0;
    const bottom = viewportTop + (viewport?.height || window.innerHeight);
    const asideTop = aside.getBoundingClientRect().top;
    const scrollable = ['auto', 'scroll'].includes(getComputedStyle(aside).overflowY);
    if (scrollable) {
        // CSS subtracts the sticky offset so navigation changes take effect
        // immediately, independent of the two scroll handlers' frame order.
        const height = Math.floor(viewport?.height || window.innerHeight);
        if (height > 0) aside.style.setProperty('--aside-viewport-height', `${height}px`);
    } else {
        aside.style.removeProperty('--aside-viewport-height');
    }
    const remaining = scrollable ? Math.max(0, aside.scrollHeight - aside.clientHeight - aside.scrollTop) : 0;
    aside.style.setProperty('--aside-edge-fade', `${Math.min(48, remaining, aside.clientHeight / 2)}px`);
    aside.style.setProperty('--aside-edge-corner', `${Math.min(20, remaining / 3, aside.clientHeight / 4)}px`);
    aside.classList.toggle('aside-scroll-edges', remaining > 1);
    const animateCards = scrollable && window.matchMedia('(min-width: 901px)').matches && !asideMotion?.matches;
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

function queueAsideEdges() {
    if (aside && !asideFrame) asideFrame = requestAnimationFrame(updateAsideEdges);
}

export function initAsideEdges() {
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
    asideCards = [...aside.querySelectorAll('.card-widget')].map(card => ({
        card,
        scale: card.style.scale,
        opacity: card.style.opacity
    }));
    aside.addEventListener('scroll', queueAsideEdges, { passive: true });
    asideObserver = new ResizeObserver(queueAsideEdges);
    asideObserver.observe(aside);
    for (const child of new Set([...aside.children, ...asideCards.map(({ card }) => card)])) {
        asideObserver.observe(child);
    }
    queueAsideEdges();
}

window.addEventListener('resize', queueAsideEdges);
window.addEventListener('scroll', queueAsideEdges, { passive: true });
window.addEventListener('pageshow', queueAsideEdges);
window.visualViewport?.addEventListener('resize', queueAsideEdges);
window.visualViewport?.addEventListener('scroll', queueAsideEdges);

onPageReady(initAsideEdges);
