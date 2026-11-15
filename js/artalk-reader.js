// Pointer, keyboard and reply-reference highlighting stay scoped to one mount.
// Read all geometry before changing classes/styles, and reuse unchanged targets.
export function installArtalkHighlights(root) {
    const state = { hovered: {}, focused: {} };
    const listeners = [];
    let activeRows = new Set();
    let targets = new Set();
    const on = (name, handler, options) => {
        root.addEventListener(name, handler, options);
        listeners.push(() => root.removeEventListener(name, handler, options));
    };
    const render = () => {
        const rows = new Set(Object.values(state).map(item => item.row).filter(row => row && root.contains(row)));
        const references = new Set();
        for (const { link } of Object.values(state)) {
            if (!link || !root.contains(link)) continue;
            const target = root.querySelector(`#atk-comment-${CSS.escape(link.dataset.blogReplyTarget)}`);
            if (target) references.add(target);
        }
        const bounds = new Map();
        const rect = node => {
            if (!bounds.has(node)) bounds.set(node, node.getBoundingClientRect());
            return bounds.get(node);
        };
        const actions = [...rows].map(row => ({ row, top: Math.max(0,
            rect(row.querySelector(':scope > .atk-main > .atk-body')).bottom - rect(row).top - 24) }));
        const highlights = [...references].map(target => {
            const row = target.querySelector(':scope > .atk-comment');
            const body = row.querySelector(':scope > .atk-main > .atk-body');
            const avatar = row.querySelector(':scope > .atk-avatar');
            const vote = row.querySelector(':scope > .atk-main > .atk-footer .blog-artalk-vote');
            const footer = row.querySelector(':scope > .atk-main > .atk-footer');
            const bottom = Math.max(rect(body).bottom, rect(avatar).bottom,
                vote ? rect(vote).bottom : 0, footer ? rect(footer).bottom : 0);
            return { row, height: Math.ceil(bottom - rect(row).top + 12) };
        });
        for (const row of activeRows) if (!rows.has(row)) row.classList.remove('blog-artalk-row-active');
        for (const { row, top } of actions) {
            row.style.setProperty('--reader-action-top', `${top}px`);
            row.classList.add('blog-artalk-row-active');
        }
        for (const { row, height } of highlights) row.style.setProperty('--reply-highlight-height', `${height}px`);
        for (const target of targets) if (!references.has(target)) target.classList.remove('blog-artalk-reply-highlight');
        for (const target of references) target.classList.add('blog-artalk-reply-highlight');
        activeRows = rows;
        targets = references;
    };
    for (const [name, entering] of [['pointerover', true], ['pointerout', false], ['focusin', true], ['focusout', false]]) {
        on(name, event => {
            const node = entering ? event.target : event.relatedTarget;
            const key = name.startsWith('pointer') ? 'hovered' : 'focused';
            const link = node?.closest?.('[data-blog-reply-target]');
            const row = node?.closest?.('.atk-comment');
            if (state[key].link === link && state[key].row === row) return;
            state[key] = { link, row };
            render();
        });
    }
    on('keydown', event => {
        if (!['Enter', ' '].includes(event.key) || !event.target.matches('[data-blog-reply-target], .blog-artalk-action, .atk-state-btn')) return;
        event.preventDefault();
        if (event.target.getAttribute('aria-disabled') !== 'true') event.target.click();
    });
    const remeasure = () => { if (activeRows.size || targets.size) render(); };
    on('load', remeasure, true);
    const view = root.ownerDocument.defaultView;
    view.addEventListener('resize', remeasure);
    listeners.push(() => view.removeEventListener('resize', remeasure));
    return () => {
        listeners.forEach(remove => remove());
        activeRows.forEach(row => row.classList.remove('blog-artalk-row-active'));
        targets.forEach(target => target.classList.remove('blog-artalk-reply-highlight'));
    };
}
