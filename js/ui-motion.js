const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const running = new WeakMap();
const ease = 'cubic-bezier(.22,1,.36,1)';

export function animatePanel(panel, expanded) {
    const fromHeight = panel.hidden ? 0 : panel.getBoundingClientRect().height;
    const fromOpacity = panel.hidden ? 0 : Number(getComputedStyle(panel).opacity);
    const previous = running.get(panel);
    previous?.cancel();
    panel.hidden = false;
    panel.inert = !expanded;
    const targetHeight = expanded ? panel.scrollHeight : 0;
    if (reducedMotion.matches) {
        running.delete(panel);
        panel.style.removeProperty('overflow');
        panel.hidden = !expanded;
        return Promise.resolve();
    }
    const animation = panel.animate([
        { height: `${fromHeight}px`, opacity: fromOpacity },
        { height: `${targetHeight}px`, opacity: expanded ? 1 : 0 }
    ], { duration: 280, easing: ease, fill: 'both' });
    panel.style.overflow = 'clip';
    running.set(panel, animation);
    return animation.finished.then(() => {
        if (running.get(panel) !== animation) return;
        running.delete(panel);
        panel.hidden = !expanded;
        animation.cancel();
        panel.style.removeProperty('overflow');
    }, () => {});
}

function enhanceDisclosures() {
    document.querySelectorAll('details.article-history:not([data-ui-disclosure])').forEach(details => {
        const summary = details.querySelector(':scope > summary');
        if (!summary) return;
        details.dataset.uiDisclosure = 'true';
        const panel = document.createElement('div');
        panel.className = 'ui-disclosure-panel';
        while (summary.nextSibling) panel.appendChild(summary.nextSibling);
        details.appendChild(panel);
        let expanded = details.open;
        panel.hidden = !expanded;
        summary.addEventListener('click', event => {
            if (event.target.closest('a,button,input')) return;
            event.preventDefault();
            expanded = !expanded;
            details.open = true;
            animatePanel(panel, expanded).then(() => {
                if (!expanded && panel.hidden) details.open = false;
            });
        });
    });
}

function enhanceDividers() {
    document.querySelectorAll('#article-container hr').forEach(hr => {
        if (hr.parentElement.classList.contains('article-divider')) return;
        const divider = document.createElement('div');
        divider.className = 'article-divider';
        const scissors = document.createElement('span');
        scissors.className = 'article-divider-scissors fas fa-scissors';
        scissors.setAttribute('aria-hidden', 'true');
        hr.before(divider);
        divider.append(hr, scissors);
        let moving = false;
        scissors.addEventListener('pointerenter', event => {
            if (event.pointerType !== 'mouse' || moving || reducedMotion.matches) return;
            moving = true;
            divider.classList.toggle('scissors-at-end');
        });
        scissors.addEventListener('transitionend', event => {
            if (event.propertyName === 'left') moving = false;
        });
    });
}

function enhancePage() {
    document.querySelectorAll('#pagination.pagination-text a').forEach(link => { link.draggable = false; });
    enhanceDisclosures();
    enhanceDividers();
}

document.addEventListener('pjax:complete', enhancePage);
enhancePage();
