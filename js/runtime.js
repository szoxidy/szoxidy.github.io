(() => {
    const voyagerStart = new Date('2022-08-01T00:00:00+08:00').getTime();
    const blogStart = new Date('2023-11-16T00:00:00+08:00').getTime();
    const intervalKey = '__szoxidyRuntimeInterval__';
    const selectors = {
        badge: '#site-status-badge',
        days: '#runtime-days',
        hours: '#runtime-hours',
        minutes: '#runtime-minutes',
        seconds: '#runtime-seconds',
        distance: '#voyager-distance',
        unit: '#voyager-unit'
    };

    const pad = value => String(value).padStart(2, '0');

    const ensureWorkboard = () => {
        let workboard = document.getElementById('workboard');

        if (!workboard) {
            const footer = document.getElementById('footer-wrap') || document.getElementById('footer');

            if (!footer) {
                return null;
            }

            workboard = document.createElement('div');
            workboard.id = 'workboard';
            footer.appendChild(workboard);
        }

        if (!workboard.dataset.runtimeReady) {
            workboard.innerHTML = `
                <img id="site-status-badge" class="boardsign" alt="站点状态">
                <div class="runtime-summary">
                    本站已经运行了 <span id="runtime-days"></span> 天
                    <span id="runtime-hours"></span> 小时
                    <span id="runtime-minutes"></span> 分
                    <span id="runtime-seconds"></span> 秒
                    <span class="fa-solid fa-heart-pulse" id="heartbeat" aria-hidden="true"></span>
                    <br>
                    旅行者 1 号当前距离地球 <span id="voyager-distance"></span> 千米，约为
                    <span id="voyager-unit"></span> 个天文单位 🚀
                </div>`;
            workboard.dataset.runtimeReady = 'true';
        }

        return workboard;
    };

    const getElements = (workboard) => {
        return Object.fromEntries(
            Object.entries(selectors).map(([key, selector]) => [key, workboard.querySelector(selector)])
        );
    };

    const renderRuntime = () => {
        const workboard = ensureWorkboard();
        if (!workboard) {
            return;
        }

        const now = Date.now();
        const elapsedSeconds = Math.max(0, Math.floor((now - blogStart) / 1000));
        const dayCount = Math.floor(elapsedSeconds / 86400);
        const hourCount = Math.floor(elapsedSeconds % 86400 / 3600);
        const minuteCount = Math.floor(elapsedSeconds % 3600 / 60);
        const secondCount = elapsedSeconds % 60;
        const voyagerDistance = Math.trunc(234e8 + Math.max(0, now - voyagerStart) / 1000 * 17);
        const voyagerUnit = (voyagerDistance / 1496e5).toFixed(6);
        const currentHour = new Date(now).getHours();
        const isOpen = currentHour >= 8 && currentHour < 22;
        const badgeUrl = isOpen
            ? 'https://img.shields.io/badge/本站点-营业中-6adea8?style=social&logo=php'
            : 'https://img.shields.io/badge/本站点-打烊了-6adea8?style=social&logo=apache';
        const badgeTitle = isOpen
            ? '距离百年老站也就差不到一百年~'
            : '这个点了应该去睡觉啦，熬夜对身体不好哦';
        const elements = getElements(workboard);

        if (Object.values(elements).some(element => !element)) {
            return;
        }

        elements.days.textContent = dayCount;
        elements.hours.textContent = pad(hourCount);
        elements.minutes.textContent = pad(minuteCount);
        elements.seconds.textContent = pad(secondCount);
        elements.distance.textContent = voyagerDistance;
        elements.unit.textContent = voyagerUnit;

        if (elements.badge.getAttribute('src') !== badgeUrl) {
            elements.badge.src = badgeUrl;
        }
        elements.badge.title = badgeTitle;
    };

    const stopTimer = () => {
        window.clearInterval(window[intervalKey]);
        window[intervalKey] = null;
    };

    const startTimer = () => {
        stopTimer();
        renderRuntime();

        if (!document.hidden) {
            window[intervalKey] = window.setInterval(renderRuntime, 1000);
        }
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', startTimer, { once: true });
    } else {
        startTimer();
    }

    if (window.btf?.addGlobalFn) {
        btf.addGlobalFn('pjaxComplete', renderRuntime, 'szoxidyRuntime');
    } else {
        document.addEventListener('pjax:complete', renderRuntime);
    }

    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            stopTimer();
        } else {
            startTimer();
        }
    });
})();
