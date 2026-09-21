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
    tooltip.append(date, value);
    document.body.append(tooltip);
    let active = null;

    function hide() {
        active?.removeAttribute('aria-describedby');
        active = null;
        tooltip.hidden = true;
    }

    function show(bar) {
        if (!bar?.matches('.blog-status__day')) return;
        if (active !== bar) hide();
        active = bar;
        date.textContent = `${bar.dataset.statusDate} · UTC`;
        value.textContent = `当日可用率  ${bar.dataset.statusValue}`;
        tooltip.dataset.state = bar.dataset.state;
        tooltip.hidden = false;
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
