(() => {
    'use strict';

    const storageKey = 'szoxidy-toolbar-side';
    let side = 'right';
    try { side = localStorage.getItem(storageKey) === 'left' ? 'left' : 'right'; } catch (_) { /* Storage may be disabled. */ }

    const init = () => {
        const toolbar = document.getElementById('rightside');
        const top = document.getElementById('go-up');
        if (!toolbar || !top || toolbar.dataset.sideReady) return;
        toolbar.dataset.sideReady = 'true';
        toolbar.classList.add('side-switchable');

        const switcher = document.createElement('button');
        switcher.type = 'button';
        switcher.id = 'toolbar-switch-side';
        switcher.innerHTML = '<i class="fa-solid fa-caret-left" aria-hidden="true"></i>';
        top.before(switcher);

        const update = () => {
            toolbar.classList.toggle('toolbar-on-left', side === 'left');
            const label = side === 'left' ? '移至右侧' : '移至左侧';
            switcher.title = label;
            switcher.setAttribute('aria-label', label);
            switcher.firstElementChild.className = `fa-solid fa-caret-${side === 'left' ? 'right' : 'left'}`;
        };

        const changeSide = () => {
            side = side === 'left' ? 'right' : 'left';
            update();
            try { localStorage.setItem(storageKey, side); } catch (_) { /* Keep the choice for this page. */ }
        };
        switcher.addEventListener('click', () => {
            if (toolbar.classList.contains('side-switching')) return;
            if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
                changeSide();
                return;
            }
            // Change the anchored side only after fading out; never travel across the page.
            toolbar.classList.add('side-switching');
            window.setTimeout(() => {
                changeSide();
                toolbar.classList.remove('side-switching');
            }, 300);
        });
        update();
    };

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
    else init();
    document.addEventListener('pjax:complete', init);
})();
