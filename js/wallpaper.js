(() => {
    'use strict';

    const init = () => {
        const background = document.getElementById('web_bg');
        const full = background?.dataset.backgroundFull;
        if (!full || background.dataset.wallpaperState) return;

        const connection = navigator.connection;
        if (connection?.saveData) {
            background.dataset.wallpaperState = 'preview';
            return;
        }

        background.dataset.wallpaperState = 'scheduled';
        const upgrade = async () => {
            // Keep the first image painted until the full image has decoded.
            background.dataset.wallpaperState = 'loading';
            const image = new Image();
            image.decoding = 'async';
            image.fetchPriority = 'low';
            image.src = full;
            try {
                await image.decode();
                if (!background.isConnected) return;
                background.style.backgroundImage = `url("${image.src}")`;
                background.dataset.wallpaperState = 'ready';
            } catch (error) {
                background.dataset.wallpaperState = 'error';
                console.warn('高清壁纸加载失败，保留轻量版。', error);
            }
        };
        const schedule = () => {
            if (window.requestIdleCallback) window.requestIdleCallback(upgrade, { timeout: 6000 });
            else window.setTimeout(upgrade, 1200);
        };
        if (document.readyState === 'complete') schedule();
        else window.addEventListener('load', schedule, { once: true });
    };

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
    else init();
    document.addEventListener('pjax:complete', init);
})();
