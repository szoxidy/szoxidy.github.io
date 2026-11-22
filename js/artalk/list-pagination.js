import { pageNumbers } from '../comment-pagination.js?v=53ae2c2265';
import { formatCommentError } from './api.js?v=4fc545aa71';
import { button, element, icon } from './config.js?v=3998dd6238';

const REPLIES_PER_PAGE = 5;

// Reuse the native data manager and paginator element. Only its controls change
// to numbered buttons; every page still comes from the server offset.
export function installArtalkPagination(ctx, listen, signal) {
    const defaultFlatMode = ctx.getConf().flatMode;
    const list = ctx.inject('list').getEl();
    const header = list.querySelector('.atk-list-header');
    const title = element('h2', 'blog-artalk-list-title');
    title.append(icon('comments'), document.createTextNode('评论'));
    header.prepend(title);
    list.querySelector('.atk-copyright')?.remove();
    const tools = list.querySelector('.atk-right-action');
    const searchToggle = button('blog-artalk-list-tool', '', 'magnifying-glass');
    searchToggle.setAttribute('aria-label', '搜索评论');
    searchToggle.setAttribute('aria-expanded', 'false');
    searchToggle.title = '搜索评论';
    const refresh = button('blog-artalk-list-tool', '', 'sync');
    refresh.setAttribute('aria-label', '刷新评论');
    refresh.title = '刷新评论';

    listen(ctx, 'mounted', () => {
        // Let the pinned client's mounted hooks bind their original elements.
        tools.replaceChildren(searchToggle, refresh);
        if (ctx.getEl().closest('.comment-wrap')?.dataset.localAdmin === 'true') {
            const admin = button('blog-artalk-list-tool', '', 'cog');
            admin.setAttribute('aria-label', '管理评论');
            admin.title = '管理评论';
            admin.addEventListener('click', () => ctx.showSidebar());
            tools.append(admin);
        }
    });

    const searchRow = element('div', 'blog-artalk-search');
    searchRow.hidden = true;
    const searchField = element('div', 'blog-artalk-search-field');
    const searchInput = element('input');
    searchInput.type = 'search';
    searchInput.maxLength = 100;
    searchInput.placeholder = '搜索评论内容或昵称';
    searchInput.setAttribute('aria-label', '搜索评论');
    const clearSearch = button('blog-artalk-search-clear', '', 'xmark');
    clearSearch.setAttribute('aria-label', '清空搜索');
    clearSearch.hidden = true;
    searchField.append(searchInput, clearSearch);
    const searchButton = button('blog-artalk-search-submit', '搜索');
    searchRow.append(searchField, searchButton);
    header.after(searchRow);

    const status = element('div', 'blog-artalk-page-status');
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    status.hidden = true;

    let busy = false;
    let error = '';
    let requested = 1;
    let focus = false;
    let renderedPager;
    let signature;
    let loadedThrough = 1;
    let firstRoot;
    let search = '';

    const select = async (target, scroll = true, preserveEditor = false) => {
        if (busy || target < 1) return;
        requested = target;
        focus = scroll;
        if (!preserveEditor) ctx.inject('editor').resetState();
        const conf = ctx.getConf();
        const data = ctx.getData();
        const params = {
            offset: (target - 1) * conf.pagination.pageSize,
            limit: conf.pagination.pageSize,
            flatMode: search ? true : defaultFlatMode
        };
        const request = {
            limit: params.limit,
            offset: params.offset,
            flat_mode: params.flatMode,
            page_key: conf.pageKey,
            site_name: conf.site,
            ...ctx.getApi().getUserFields()
        };
        conf.listFetchParamsModifier?.(request);
        if (search) request.search = search;
        busy = true;
        error = '';
        data.setLoading(true);
        render();
        // Upstream Fetch rethrows its handled rejection from an event callback.
        // Use its public API/data pipeline here so failed navigation retains the
        // old page and offers the same explicit retry as comment_ui.js.
        try {
            const response = await ctx.getApi().comments.getComments(request, { signal });
            if (signal.aborted) return;
            if (!response.data.page) throw new Error('评论加载失败，请重试。');
            ctx.updateConf({ flatMode: params.flatMode });
            data.setListLastFetch({ params, data: response.data });
            data.clearComments();
            data.loadComments(response.data.comments);
            data.updatePage(response.data.page);
            ctx.trigger('list-fetched', { params, data: response.data });
        } catch (failure) {
            if (signal.aborted) return;
            error = formatCommentError(failure, '评论加载失败，请重试。');
            ctx.getEl().dataset.commentState = 'error';
        } finally {
            busy = false;
            data.setLoading(false);
            if (!signal.aborted) render();
        }
    };

    const render = () => {
        const pager = list.querySelector('.atk-pagination');
        if (!pager) return;
        const last = ctx.getData().getListLastFetch();
        const pageSize = ctx.getConf().pagination.pageSize;
        const total = Math.max(1, Math.ceil(((last?.params.flatMode ? last.data?.count : last?.data?.roots_count) || 0) / pageSize));
        const page = Math.min(total, Math.floor((last?.params.offset || 0) / pageSize) + 1);
        const count = last?.data?.count || 0;
        const counter = list.querySelector('.atk-comment-count');
        counter.hidden = !count && !search;
        const countText = counter.querySelector('.atk-text');
        countText.replaceChildren(
            document.createTextNode(search ? '找到 ' : ''),
            element('span', 'atk-comment-count-num', String(count)),
            document.createTextNode(' 条评论')
        );
        const empty = list.querySelector('.atk-list-no-comment');
        if (empty) empty.textContent = search ? '没有找到评论' : '没有评论';
        searchToggle.hidden = refresh.hidden = busy;
        searchButton.disabled = busy;
        const first = !last?.params.offset && last?.data?.comments[0]?.id;
        if (first && first !== firstRoot) { firstRoot = first; loadedThrough = 1; }
        loadedThrough = Math.max(loadedThrough, page);
        const reachable = Math.min(total, loadedThrough + 1);
        const nextSignature = JSON.stringify([page, total, reachable, busy, error, requested]);
        if (renderedPager === pager && signature === nextSignature) return;
        renderedPager = pager;
        signature = nextSignature;
        const wrap = pager.closest('.atk-pagination-wrap');
        wrap.hidden = total <= 1 && !busy && !error;
        pager.setAttribute('role', 'navigation');
        pager.setAttribute('aria-label', '评论分页');
        pager.setAttribute('aria-busy', String(busy));
        pager.replaceChildren();
        const add = (label, target, disabled, className = '') => {
            const control = button(`atk-btn ${className}`.trim(), label);
            control.disabled = busy || disabled;
            if (String(page) === label) control.setAttribute('aria-current', 'page');
            control.setAttribute('aria-label', /^\d+$/.test(label) ? `评论第 ${label} 页` : `${label}评论`);
            control.addEventListener('click', () => select(target));
            pager.append(control);
        };
        if (total > 1) {
            add('上一页', page - 1, page === 1, 'atk-btn-prev');
            for (const number of pageNumbers(page, reachable)) {
                if (typeof number === 'number') add(String(number), number, false);
                else pager.append(element('span', '', number));
            }
            add('下一页', page + 1, page === total, 'atk-btn-next');
        }
        wrap.after(status);
        status.replaceChildren();
        status.hidden = !busy && !error;
        if (busy) status.textContent = '正在加载评论…';
        else if (error) {
            status.append(document.createTextNode(error));
            const retry = button('', '重试');
            retry.addEventListener('click', () => select(requested));
            status.append(retry);
        }
        if (focus && !busy && !error) {
            focus = false;
            list.scrollIntoView({ block: 'start', behavior: 'auto' });
            pager.querySelector('[aria-current="page"]')?.focus({ preventScroll: true });
        }
    };

    listen(ctx, 'list-fetch', () => { busy = true; error = ''; render(); });
    listen(ctx, 'list-failed', failure => { busy = false; error = formatCommentError(failure, '评论加载失败，请重试。'); render(); });
    listen(ctx, 'list-fetched', () => { busy = false; render(); });
    listen(ctx, 'list-loaded', render);
    listen(ctx, 'updated', render);

    const applySearch = () => {
        if (busy) return;
        searchInput.value = searchInput.value.trim();
        search = searchInput.value;
        loadedThrough = 1;
        firstRoot = undefined;
        select(1, false);
    };
    searchToggle.addEventListener('click', () => {
        searchRow.hidden = !searchRow.hidden;
        searchToggle.setAttribute('aria-expanded', String(!searchRow.hidden));
        if (!searchRow.hidden) searchInput.focus({ preventScroll: true });
        else {
            searchInput.value = '';
            clearSearch.hidden = true;
            if (search) applySearch();
        }
    });
    refresh.addEventListener('click', () => { loadedThrough = 1; firstRoot = undefined; select(1, false); });
    searchButton.addEventListener('click', applySearch);
    searchInput.addEventListener('input', () => { clearSearch.hidden = !searchInput.value; });
    searchInput.addEventListener('keydown', event => {
        if (event.key === 'Enter') { event.preventDefault(); applySearch(); }
    });
    clearSearch.addEventListener('click', () => {
        searchInput.value = '';
        clearSearch.hidden = true;
        if (search) applySearch();
        searchInput.focus({ preventScroll: true });
    });

    return {
        refresh: () => select(Math.floor((ctx.getData().getListLastFetch()?.params.offset || 0) / ctx.getConf().pagination.pageSize) + 1, false, true)
    };
}

export function installArtalkReplyPages(ctx, root, on, listen) {
    const pagers = new WeakMap();
    const sync = () => {
        for (const replies of root.querySelectorAll('.atk-comment-children')) {
            const rows = [...replies.children].filter(row => row.classList.contains('atk-comment-wrap'));
            if (!rows.length) continue;
            const byId = new Map(ctx.getData().getComments().map(data => [data.id, data]));
            const ids = new Set(rows.map(row => Number(row.id.replace('atk-comment-', ''))));
            const level = (id, seen = new Set()) => {
                if (seen.has(id)) return 0;
                seen.add(id);
                const parent = byId.get(id)?.rid;
                return ids.has(parent) ? Math.min(3, level(parent, seen) + 1) : 0;
            };
            rows.forEach(row => row.style.setProperty('--reply-depth', String(level(Number(row.id.replace('atk-comment-', ''))))));
            let controller = pagers.get(replies);
            if (!controller) {
                let page = 1;
                const nav = element('nav', 'blog-artalk-reply-pagination');
                nav.setAttribute('aria-label', '评论回复分页');
                replies.after(nav);
                const show = (target, focus = false) => {
                    const top = nav.getBoundingClientRect().top;
                    const items = [...replies.children].filter(row => row.classList.contains('atk-comment-wrap'));
                    const total = Math.max(1, Math.ceil(items.length / REPLIES_PER_PAGE));
                    page = Math.min(Math.max(1, target), total);
                    const active = items.findIndex(row => row.querySelector('.atk-main-editor'));
                    if (active >= 0) page = Math.floor(active / REPLIES_PER_PAGE) + 1;
                    items.forEach((row, index) => row.toggleAttribute(
                        'data-reply-page-hidden',
                        index < (page - 1) * REPLIES_PER_PAGE || index >= page * REPLIES_PER_PAGE
                    ));
                    nav.hidden = total <= 1;
                    nav.replaceChildren();
                    if (total > 1) {
                        nav.append(element('span', '', `${items.length} 条回复`));
                        const add = (label, targetPage, disabled = false) => {
                            const control = button('', label);
                            control.disabled = disabled;
                            control.setAttribute('aria-label', /^\d+$/.test(label) ? `回复第 ${label} 页` : `${label}回复`);
                            if (String(page) === label) control.setAttribute('aria-current', 'page');
                            control.addEventListener('click', () => show(targetPage, true));
                            nav.append(control);
                        };
                        add('上一页', page - 1, page === 1);
                        for (const number of pageNumbers(page, total)) {
                            if (typeof number === 'number') add(String(number), number);
                            else nav.append(element('span', '', number));
                        }
                        add('下一页', page + 1, page === total);
                    }
                    if (focus) {
                        const shift = nav.getBoundingClientRect().top - top;
                        if (shift) window.scrollBy({ top: shift, behavior: 'instant' });
                        nav.querySelector('[aria-current="page"]')?.focus({ preventScroll: true });
                    }
                };
                controller = {
                    sync: () => show(page),
                    reveal: row => show(Math.floor([...replies.children].indexOf(row) / REPLIES_PER_PAGE) + 1)
                };
                pagers.set(replies, controller);
            }
            controller.sync();
        }
    };
    listen(ctx, 'list-loaded', sync);
    on(root, 'click', event => {
        const link = event.target.closest?.('[data-blog-reply-target]');
        if (!link) return;
        const target = root.querySelector(`#atk-comment-${CSS.escape(link.dataset.blogReplyTarget)}`);
        if (target?.parentElement.classList.contains('atk-comment-children')) {
            pagers.get(target.parentElement)?.reveal(target);
        }
    }, true);
}
