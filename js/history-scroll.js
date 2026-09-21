(() => {
    'use strict';

    let navigating = false;
    let frame = 0;
    let currentUid = history.state?.uid;
    const positions = new Map();
    function remember() {
        if (!navigating && currentUid) positions.set(currentUid, [window.scrollX, window.scrollY]);
    }
    function save() {
        frame = 0;
        const state = history.state;
        if (navigating || !state?.uid) return;
        currentUid = state.uid;
        remember();
        history.replaceState({ ...state, scrollPos: [window.scrollX, window.scrollY] }, '', location.href);
    }
    function pause() {
        navigating = true;
        cancelAnimationFrame(frame);
        frame = 0;
    }
    // Keep scrolling in memory; repeated replaceState calls can hit browser
    // rate limits during long reading sessions.
    window.addEventListener('scroll', remember, { passive: true });
    // popstate already points to the destination entry: never save the outgoing
    // article's coordinates there while Pjax is still replacing the page.
    window.addEventListener('popstate', event => {
        remember();
        if (event.state?.uid && positions.has(event.state.uid)) {
            event.state.scrollPos = positions.get(event.state.uid);
        }
        pause();
    }, { capture: true });
    document.addEventListener('pjax:send', () => { remember(); pause(); });
    document.addEventListener('pjax:success', () => {
        // Pjax 0.2.8 writes outgoing coordinates to the destination history entry
        // during handleResponse. Repair it after its own restoration completes.
        cancelAnimationFrame(frame);
        frame = requestAnimationFrame(() => {
            navigating = false;
            save();
        });
    });
})();
