(() => {
    'use strict';

    let timer;

    function refresh() {
        window.clearTimeout(timer);
        const section = document.querySelector('.blog-year');
        if (!section || document.hidden) return;

        const now = new Date();
        const year = now.getFullYear();
        const start = new Date(year, 0, 1);
        const end = new Date(year + 1, 0, 1);
        // 使用两次元旦的实际时间差，自动包含闰日和当地时区。
        const percent = Math.min(100, Math.max(0, (now - start) / (end - start) * 100));
        const short = `${percent.toFixed(2)}%`;
        const full = `${percent.toFixed(7)}%`;

        section.querySelector('[data-year-number]').textContent = year;
        section.querySelector('[data-year-short]').textContent = short;
        section.querySelector('[data-year-full]').textContent = full;
        section.querySelector('[data-year-percentage]').setAttribute('aria-label', `${year} 年已过去 ${full}`);
        section.querySelector('[data-year-bar]').value = percent;

        // 只保留一个计时器；后台暂停，返回页面时立即按当前时间重算。
        timer = window.setTimeout(refresh, 1000);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', refresh, { once: true });
    } else {
        refresh();
    }

    document.addEventListener('pjax:complete', refresh);
    document.addEventListener('visibilitychange', refresh);
    window.addEventListener('pageshow', refresh);
})();
