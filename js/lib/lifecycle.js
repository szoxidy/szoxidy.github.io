// Shared DOM ready, PJAX re-initialization and media query helpers.
export function onDocumentReady(callback) {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', callback, { once: true });
    } else {
        callback();
    }
}

export function onPageReady(callback, { pjaxKey } = {}) {
    onDocumentReady(callback);
    if (pjaxKey && window.btf?.addGlobalFn) {
        window.btf.addGlobalFn('pjaxComplete', callback, pjaxKey);
    } else {
        document.addEventListener('pjax:complete', callback);
    }
}

export function prefersReducedMotion() {
    return Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
}

export function subscribeMediaQuery(query, handler) {
    const media = window.matchMedia?.(query);
    if (!media) return { media: null, unsubscribe() {} };
    if (typeof media.addEventListener === 'function') {
        media.addEventListener('change', handler);
        return { media, unsubscribe: () => media.removeEventListener('change', handler) };
    }
    media.addListener?.(handler);
    return { media, unsubscribe: () => media.removeListener?.(handler) };
}
