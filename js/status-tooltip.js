(() => {
    'use strict';

    const tooltip = document.createElement('div');
    tooltip.id = 'blog-status-tooltip';
    tooltip.className = 'blog-status-tooltip';
    tooltip.setAttribute('role', 'tooltip');
    tooltip.hidden = true;
    const date = document.createElement('div');
    date.className = 'blog-status-tooltip__date';
    const value = document.createElement('div');
    value.className = 'blog-status-tooltip__value';
    const average = document.createElement('div');
    average.className = 'blog-status-tooltip__average';
    const range = document.createElement('div');
    range.className = 'blog-status-tooltip__range';
    const minimum = document.createElement('span');
    const maximum = document.createElement('span');
    range.append(minimum, maximum);
    tooltip.append(date, value, average, range);
    tooltip.setAttribute('aria-hidden', 'true');
    document.body.append(tooltip);
    let active = null;
    let hideTimer = null;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

    function hide() {
        if (!active && (tooltip.hidden || tooltip.dataset.visible === 'false')) return;
        window.clearTimeout(hideTimer);
        active?.removeAttribute('aria-describedby');
        active = null;
        tooltip.dataset.visible = 'false';
        tooltip.setAttribute('aria-hidden', 'true');
        if (reducedMotion.matches) {
            tooltip.hidden = true;
        } else {
            hideTimer = window.setTimeout(() => {
                tooltip.hidden = true;
                hideTimer = null;
            }, 160);
        }
    }

    function show(bar) {
        if (!bar?.matches('.blog-status__day')) return;
        window.clearTimeout(hideTimer);
        hideTimer = null;
        const changed = active !== bar;
        if (changed) active?.removeAttribute('aria-describedby');
        active = bar;
        date.textContent = `${bar.dataset.statusDate} · UTC`;
        value.textContent = `当日可用率  ${bar.dataset.statusValue}`;
        average.textContent = `平均延迟  ${bar.dataset.statusAvgPing || '暂无数据'}`;
        minimum.textContent = `最低  ${bar.dataset.statusMinPing || '暂无数据'}`;
        maximum.textContent = `最高  ${bar.dataset.statusMaxPing || '暂无数据'}`;
        tooltip.dataset.state = bar.dataset.state;
        const wasHidden = tooltip.hidden;
        tooltip.hidden = false;
        // Commit the initial transparent state before the entry transition.
        if (wasHidden) void tooltip.offsetWidth;
        if (changed) tooltip.dataset.phase = tooltip.dataset.phase === 'a' ? 'b' : 'a';
        tooltip.dataset.visible = 'true';
        tooltip.setAttribute('aria-hidden', 'false');
        bar.setAttribute('aria-describedby', tooltip.id);
        const rect = bar.getBoundingClientRect();
        const width = tooltip.offsetWidth;
        const height = tooltip.offsetHeight;
        const left = Math.max(8, Math.min(rect.left + rect.width / 2 - width / 2, window.innerWidth - width - 8));
        const top = rect.top >= height + 16 ? rect.top - height - 10 : rect.bottom + 10;
        tooltip.style.left = `${left}px`;
        tooltip.style.top = `${Math.max(8, Math.min(top, window.innerHeight - height - 8))}px`;
    }

    document.addEventListener('pointerover', event => show(event.target.closest?.('.blog-status__day')));
    document.addEventListener('pointerout', event => {
        if (event.target === active && !active.contains(event.relatedTarget)) hide();
    });
    document.addEventListener('focusin', event => show(event.target.closest?.('.blog-status__day')));
    document.addEventListener('focusout', event => { if (event.target === active) hide(); });
    document.addEventListener('keydown', event => { if (event.key === 'Escape') hide(); });
    document.addEventListener('scroll', hide, { capture: true, passive: true });
    window.addEventListener('resize', hide, { passive: true });
    document.addEventListener('pjax:send', hide);
})();
