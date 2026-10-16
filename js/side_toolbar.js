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

    const init = () => {
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

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init, { once: true });
    } else {
        init();
    }
    document.addEventListener('pjax:complete', init);
})();
