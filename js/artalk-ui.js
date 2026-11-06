import { animatePanel } from './ui-motion.js?v=70b3e73716';
import { improveCommentTooltips, refreshCommentTooltip } from './comment-tooltips.js?v=f4a9dba27d';
import { pageNumbers } from './comment-pagination.js?v=53ae2c2265';

// Artalk 2.10.1 integration. Keep native submission/reply/data ownership while
// restoring the pre-migration fields, reader layout and interaction states.
const installed = new WeakSet();
const avatarSources = new WeakMap();
const voteStates = new WeakMap();
const ownerHashes = new Set([
    'b1c38013f782303cff26dc625fccbdfc',
    'a9c0485877817324447cd604f579e536b3dc1d7efe7acac83d60fe25ec8be3be'
]);
const preferences = {
    markdown: 'blog-comment-draft-markdown',
    mail: 'blog-comment-mail-notice'
};

export function artalkOptions(option = {}) {
    return {
        locale: 'zh-CN',
        placeholder: '写下你的想法，支持 Markdown…',
        sendBtn: '发送',
        noComment: '没有评论',
        editorTravel: false,
        preview: true,
        vote: true,
        voteDown: false,
        uaBadge: true,
        listSort: false,
        heightLimit: { content: 0, children: 0, scrollable: false },
        flatMode: false,
        nestMax: 2,
        nestSort: 'DATE_ASC',
        dateFormatter: date => `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`,
        ...option,
        pagination: { pageSize: 10, ...option.pagination, readMore: false, autoLoad: false }
    };
}

function preference(key) {
    try { return localStorage.getItem(key) !== 'false'; }
    catch { return true; }
}

function savePreference(key, checked) {
    try { localStorage.setItem(key, String(checked)); }
    catch { /* The current form still respects the choice without storage. */ }
}

function notify(title, message, type, duration = 5000) {
    return globalThis.siteNotify?.({ title, message, type, duration, key: 'comment-submit', variant: 'comment' });
}

// Same accepted preview links as comment_ui.js; email never enters the preview.
function websiteUrl(value) {
    const text = value.trim();
    const hasUnsupportedScheme = /^[a-z][\w+.-]*:/i.test(text) && !/^https?:\/\//i.test(text);
    if (!text || /\s/.test(text) || hasUnsupportedScheme) return null;
    try {
        const url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`);
        const isWebsite = /^https?:$/.test(url.protocol) && url.hostname.includes('.');
        const hasCredentials = Boolean(url.username || url.password);
        return isWebsite && !hasCredentials ? url.href : null;
    } catch { return null; }
}

function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
}

function icon(name) {
    const node = element('i', `fas fa-${name}`);
    node.setAttribute('aria-hidden', 'true');
    return node;
}

function button(className, caption, symbol) {
    const node = element('button', className);
    node.type = 'button';
    if (symbol) node.append(icon(symbol));
    node.append(element('span', '', caption));
    return node;
}

function checkbox(className, name, caption, checked, change) {
    const label = element('label', className);
    const input = element('input');
    input.type = 'checkbox';
    input.name = name;
    input.checked = checked;
    input.addEventListener('change', () => change(input.checked));
    label.append(input, element('span', '', caption));
    return { label, input };
}

export function validateArtalkForm(editor, captcha, needsCaptcha = true) {
    const ui = editor.getUI();
    const errors = [];
    const add = (input, message) => errors.push({ input, message });
    if (!editor.getContentRaw().trim()) add(ui.$textarea, '评论内容不能为空');
    if (!ui.$name.value.trim()) add(ui.$name, '昵称不能为空');
    const email = ui.$email.value.trim();
    if (!email) add(ui.$email, '邮箱不能为空');
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) add(ui.$email, '邮箱格式错误');
    const link = ui.$link.value.trim();
    if (link) {
        try {
            const url = new URL(link);
            if (!/^https?:$/.test(url.protocol) || !url.hostname || url.username || url.password) throw Error();
        } catch { add(ui.$link, '网址请填写完整的 http:// 或 https:// 地址'); }
    }
    if (needsCaptcha) {
        if (!captcha.token || captcha.input.disabled) add(captcha.input, '验证码尚未就绪，请稍后重试或点击钥匙重新加载');
        else if (!captcha.input.value.trim()) add(captcha.input, '验证码未输入');
        else if (!/^-?\d+$/.test(captcha.input.value.trim())) add(captcha.input, '验证码请填写数字');
    }
    return errors;
}

// EditorPluginManager.getOptions().getApi is the public API provider consumed
// by the native Submit and StateReply plugs. Return an adapter for that editor
// only: never patch the library, the global API, XMLHttpRequest or fetch.
export function bridgeArtalkEditorApi(manager, getFields, onFailure, signal) {
    const options = manager.getOptions();
    const original = options.getApi;
    options.getApi = () => {
        const native = original();
        const api = Object.create(native);
        api.comments = { ...native.comments };
        const request = async action => {
            signal?.throwIfAborted();
            const response = await action();
            // A retired editor must not insert into a new PJAX page, even when
            // a completed response races with cancellation.
            signal?.throwIfAborted();
            return response;
        };
        api.comments.createComment = async (data, params) => {
            try { return await request(() => native.comments.createComment({ ...data, ...getFields(data) }, { ...params, signal })); }
            catch (error) { if (!signal?.aborted) onFailure(error); throw error; }
        };
        api.comments.updateComment = async (id, data, params) => {
            try { return await request(() => native.comments.updateComment(id, data, { ...params, signal })); }
            catch (error) { if (!signal?.aborted) onFailure(error); throw error; }
        };
        api.user = { ...native.user, getUser: async (query, params) => {
            // HeaderUser supplies its own cancel token, which takes precedence
            // over RequestInit.signal in the pinned native HTTP client.
            const cancel = () => { if (params?.cancelToken) native.abortRequest(params.cancelToken); };
            signal?.addEventListener('abort', cancel, { once: true });
            try { return await request(() => native.user.getUser(query, { ...params, signal })); }
            finally { signal?.removeEventListener('abort', cancel); }
        } };
        return api;
    };
    // Native header lookups are debounced. Leave the abort guard on retired
    // instances so their pending timer cannot make another network request.
    return () => { if (!signal?.aborted) options.getApi = original; };
}

function bridgeArtalkPanels(manager) {
    const original = manager.openPluginPanel;
    const open = function (active) {
        const events = manager.getEvents();
        const trigger = events.trigger;
        const hidden = manager.getPlugins().filter(plug => plug.$panel && plug !== active);
        // The pinned 2.10.1 bundle sends the selected plug in each panel-hide
        // event. Correct that payload for this call; the native manager still
        // owns opening, closing and its active plug. Fixed clients pass through.
        events.trigger = function (name, payload) {
            return trigger.call(this, name, name === 'panel-hide' && payload === active ? hidden.shift() : payload);
        };
        try { return original.call(this, active); }
        finally { events.trigger = trigger; }
    };
    manager.openPluginPanel = open;
    return () => { if (manager.openPluginPanel === open) manager.openPluginPanel = original; };
}

export async function blogArtalkJSON(server, path, query = {}, signal, options = {}) {
    const base = server.replace(/\/+$/, '').replace(/\/api(?:\/v2)?$/, '');
    const url = new URL(`${base}/api/blog/${path}`, location.href);
    Object.entries(query).forEach(([key, value]) => url.searchParams.set(key, value));
    const response = await fetch(url, { ...options, signal, credentials: 'omit', headers: { Accept: 'application/json', ...options.headers } });
    const data = await response.json();
    if (!response.ok) throw new Error(data.msg || data.message || `评论服务返回 ${response.status}`);
    return data;
}

function avatarCandidates(source, data) {
    const hash = data.email_encrypted || source.match(/\/avatar\/([a-f\d]{32,64})(?:[/?]|$)/i)?.[1] || '';
    if (ownerHashes.has(hash.toLowerCase())) return ['/img/site-avatar.jpg?v=f600c1b0df'];
    const urls = [];
    if (source && !source.startsWith('data:') && source !== '/img/comment-avatar.svg?v=a5c1553b06') {
        const url = new URL(source, location.href);
        if (/^(weavatar\.com|cravatar\.cn|(?:[^.]+\.)?gravatar\.(com|loli\.net))$/.test(url.hostname)) {
            url.searchParams.set('d', '404');
            url.searchParams.delete('name');
        }
        urls.push(url.href);
    }
    let gravatar;
    if (/^(?:[a-f\d]{32}|[a-f\d]{64})$/i.test(hash)) {
        const params = hash.length === 64 ? 'sha256=1&d=404&s=80' : 'd=404&s=80';
        urls.push(`https://weavatar.com/avatar/${hash}?${params}`);
        gravatar = `https://www.gravatar.com/avatar/${hash}?${params}`;
    }
    const qq = data.email?.match(/^([1-9]\d{4,10})@qq\.com$/i)?.[1];
    if (qq) urls.push(`https://q1.qlogo.cn/g?b=qq&nk=${qq}&s=640`);
    if (gravatar) urls.push(gravatar);
    return [...new Set([...urls, initialAvatar(data.nick || '访客')])];
}

function initialAvatar(nick) {
    const name = nick.trim() || '访客';
    const letter = Array.from(name)[0].toUpperCase().replace(/[<>&"']/g, char => `&#${char.codePointAt(0)};`);
    let hash = 0;
    for (const char of name) hash = (hash * 31 + char.codePointAt(0)) >>> 0;
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80" viewBox="0 0 80 80">'
        + `<rect width="80" height="80" rx="40" fill="hsl(${hash % 360} 55% 42%)"/>`
        + '<text x="40" y="42" dy=".35em" text-anchor="middle" fill="white"'
        + ` font-family="sans-serif" font-size="36">${letter}</text></svg>`;
    return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

// The pre-migration preview uses Gravatar's public MD5 identifier for raw mail;
// published SHA-256 identifiers stay SHA-256 in avatarCandidates above.
function emailAvatarHash(email) {
    const bytes = new TextEncoder().encode(email.trim().toLowerCase());
    const size = Math.ceil((bytes.length + 9) / 64) * 64;
    const buffer = new Uint8Array(size);
    buffer.set(bytes);
    buffer[bytes.length] = 0x80;
    const view = new DataView(buffer.buffer);
    view.setUint32(size - 8, bytes.length * 8, true);
    view.setUint32(size - 4, Math.floor(bytes.length / 0x20000000), true);
    const shifts = [7, 12, 17, 22, 5, 9, 14, 20, 4, 11, 16, 23, 6, 10, 15, 21];
    const state = [0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476];
    for (let offset = 0; offset < size; offset += 64) {
        let [a, b, c, d] = state;
        for (let i = 0; i < 64; i++) {
            const round = Math.floor(i / 16);
            const mix = round === 0 ? (b & c) | (~b & d) : round === 1 ? (d & b) | (~d & c) : round === 2 ? b ^ c ^ d : c ^ (b | ~d);
            const word = round === 0 ? i : round === 1 ? (5 * i + 1) % 16 : round === 2 ? (3 * i + 5) % 16 : (7 * i) % 16;
            const sum = (a + mix + Math.floor(Math.abs(Math.sin(i + 1)) * 0x100000000) + view.getUint32(offset + word * 4, true)) | 0;
            const shift = shifts[round * 4 + i % 4];
            const next = (b + ((sum << shift) | (sum >>> (32 - shift)))) | 0;
            [a, b, c, d] = [d, next, b, c];
        }
        [a, b, c, d].forEach((value, index) => { state[index] = (state[index] + value) | 0; });
    }
    return state.map(word => [0, 8, 16, 24].map(shift =>
        ((word >>> shift) & 0xff).toString(16).padStart(2, '0')).join('')).join('');
}

export function enhanceArtalkAvatar(img, data = {}) {
    if (!img) return;
    const source = img.getAttribute('src') || '';
    const signature = JSON.stringify([data.email_encrypted, data.email, data.nick, source]);
    if (avatarSources.get(img) === signature) return;
    img.alt = `${data.nick || '访客'}的头像`;
    img.referrerPolicy = 'no-referrer';
    const candidates = avatarCandidates(source, data);
    let index = 0;
    const next = () => {
        if (index >= candidates.length) { img.removeEventListener('error', next); return; }
        img.src = candidates[index++];
        avatarSources.set(img, JSON.stringify([data.email_encrypted, data.email, data.nick, img.getAttribute('src')]));
    };
    img.addEventListener('error', next);
    next();
}

function previewAvatar(img, nick, email) {
    img.src = initialAvatar(nick);
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return;
    const hash = emailAvatarHash(email);
    if (ownerHashes.has(hash)) { img.src = '/img/site-avatar.jpg?v=f600c1b0df'; return; }
    return setTimeout(() => {
        if (img.isConnected) enhanceArtalkAvatar(img, { nick, email, email_encrypted: hash });
    }, 500);
}

function decorateArtalkComment(comment, signal) {
    const data = comment.getData();
    // Native CommentNode replaces '-' with '/' even in RFC3339 timestamps.
    // Restore only that ISO form so the date and its full tooltip keep the zone.
    data.date = data.date.replace(/^(\d{4})\/(\d{2})\/(\d{2})(?=T)/, '$1-$2-$3');
    const render = comment.getRender();
    const action = (node, caption) => {
        node.classList.add('blog-artalk-action');
        node.setAttribute('role', 'button');
        node.setAttribute('aria-label', caption);
        node.tabIndex = 0;
    };
    const vote = render.voteBtnUp;
    if (vote) {
        let state = voteStates.get(comment);
        if (!state) {
            state = { revision: 0 };
            voteStates.set(comment, state);
            const options = comment.getOpts();
            const getApi = options.getApi;
            // The blog backend reports is_up with both GET and POST. Use that
            // response, never infer a visitor's choice from the public count.
            getApi().request({ path: `/votes/comment/${data.id}`, method: 'GET', format: 'json', signal })
                .then(response => {
                    if (state.revision || signal.aborted) return;
                    state.isUp = response.data.is_up;
                    const current = comment.getRender().voteBtnUp?.$el;
                    if (current?.isConnected && typeof state.isUp === 'boolean') current.setAttribute('aria-pressed', String(state.isUp));
                }).catch(error => {
                    if (state.revision || signal.aborted) return;
                    state.error = error;
                    const current = comment.getRender().voteBtnUp?.$el;
                    if (current) current.dataset.commentTooltip = '点赞状态加载失败，点击后重试';
                });
            options.getApi = () => {
                const native = getApi();
                const api = Object.create(native);
                api.votes = { ...native.votes };
                api.votes.createVote = async (...args) => {
                    state.revision++;
                    const active = comment.getRender().voteBtnUp;
                    active.isLoading = true;
                    active.$el.setAttribute('aria-busy', 'true');
                    try {
                        const response = await native.votes.createVote(...args);
                        state.isUp = response.data.is_up;
                        if (typeof state.isUp === 'boolean') active.$el.setAttribute('aria-pressed', String(state.isUp));
                        delete active.$el.dataset.commentTooltip;
                        return response;
                    } catch (error) { state.error = error; throw error; }
                    finally { active.isLoading = false; active.$el.setAttribute('aria-busy', 'false'); }
                };
                return api;
            };
        }
        vote.$el.classList.add('blog-artalk-vote');
        if (typeof state.isUp === 'boolean') vote.$el.setAttribute('aria-pressed', String(state.isUp));
        vote.setError = message => notify('点赞失败', state.error?.message || message, 'error');
        vote.updateText(() => {
            const count = String(comment.getData().vote_up || 0);
            action(vote.$el, `点赞 ${count}`);
            return count;
        });
    }
    const reply = [...render.$el.querySelectorAll(':scope > .atk-comment > .atk-main > .atk-footer > .atk-actions > .atk-common-action-btn')]
        .find(node => node !== vote?.$el && !node.hasAttribute('atk-only-admin-show'));
    if (reply) {
        reply.classList.add('blog-artalk-reply');
        action(reply, '回复评论');
    }
    const date = render.$el.querySelector(':scope > .atk-comment > .atk-main > .atk-header > .atk-date');
    if (date) {
        const value = new Date(data.date);
        if (!Number.isNaN(value.getTime())) {
            const pad = number => String(number).padStart(2, '0');
            date.textContent = `${value.getFullYear()}-${value.getMonth() + 1}-${value.getDate()}`;
            date.dataset.fullDate = `${date.textContent} ${pad(value.getHours())}:${pad(value.getMinutes())}:${pad(value.getSeconds())}`;
            date.dataset.commentTooltip = date.dataset.fullDate;
            date.tabIndex = 0;
        }
    }
    for (const badge of render.$el.querySelectorAll(':scope > .atk-comment > .atk-main > .atk-header > .atk-ua-wrap > .atk-ua')) {
        const value = badge.textContent.replace(/\u00a0/g, ' ').trim();
        const brand = /windows/i.test(value) ? 'windows' : /edge/i.test(value) ? 'edge'
            : /chrome|chromium/i.test(value) ? 'chrome' : /firefox/i.test(value) ? 'firefox'
            : /safari/i.test(value) ? 'safari' : /android/i.test(value) ? 'android'
            : /ubuntu/i.test(value) ? 'ubuntu' : /linux/i.test(value) ? 'linux'
            : /mac|ios|iphone|ipad/i.test(value) ? 'apple' : '';
        badge.dataset.agent = brand;
        badge.title = value.replace(/\b(Chrome|Chromium|Edge|Opera)\s+(\d+)(?:\.0){1,3}$/i, '$1 $2');
        if (brand) badge.textContent = value.replace(/\s+\d[\d._]*(?:\s.*)?$/, '').trim();
    }
}

// Reuse the native data manager and paginator element. Only its controls change
// to the old numbered buttons; every page still comes from the server offset.
function installArtalkPagination(ctx, listen, signal) {
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
    searchInput.placeholder = '搜索评论';
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
        const params = { offset: (target - 1) * conf.pagination.pageSize, limit: conf.pagination.pageSize, flatMode: conf.flatMode };
        const request = { limit: params.limit, offset: params.offset, flat_mode: params.flatMode,
            page_key: conf.pageKey, site_name: conf.site, ...ctx.getApi().getUserFields() };
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
            if (!response.data.page) throw new Error('评论响应缺少页面信息，请重试。');
            data.setListLastFetch({ params, data: response.data });
            data.clearComments();
            data.loadComments(response.data.comments);
            data.updatePage(response.data.page);
            ctx.trigger('list-fetched', { params, data: response.data });
        } catch (failure) {
            if (signal.aborted) return;
            error = failure.message || '评论加载失败，请重试。';
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
        countText.replaceChildren(document.createTextNode(search ? '找到 ' : ''),
            element('span', 'atk-comment-count-num', String(count)), document.createTextNode(' 条评论'));
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
    listen(ctx, 'list-failed', failure => { busy = false; error = failure.msg || '评论加载失败，请重试。'; render(); });
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

function installArtalkSelfDelete(ctx, root, on, listen, signal, refreshList) {
    let enabled = false;
    let owned = new Set();
    let ownedProof;
    let pendingRead;
    let readAgain = false;
    let dialog;
    const deleting = new Set();
    const proof = () => ctx.getUser().getGuestToken?.(ctx.getConf().server, false);
    const closeDialog = (restoreFocus = true) => {
        if (!dialog) return;
        const previous = dialog;
        dialog = null;
        previous.panel.remove();
        if (restoreFocus && previous.control.isConnected) previous.control.focus({ preventScroll: true });
    };
    const syncComment = comment => {
        const data = comment.getData();
        const actions = comment.getRender().$actions;
        let control = actions.querySelector('.blog-artalk-delete');
        if (!enabled || !ownedProof || proof() !== ownedProof || !owned.has(data.id) || data.blog_deleted === true) {
            control?.remove();
            return;
        }
        if (!control) {
            control = button('blog-artalk-delete', '删除自己的评论');
            control.setAttribute('aria-label', '删除自己的评论');
            control.dataset.commentId = String(data.id);
            actions.append(control);
        }
        control.disabled = deleting.has(data.id);
    };
    const sync = () => ctx.getCommentNodes().forEach(syncComment);
    const refreshOwned = () => {
        const token = enabled && proof();
        if (!token || signal.aborted) { owned.clear(); ownedProof = undefined; sync(); return; }
        if (pendingRead) { readAgain = true; return pendingRead; }
        const conf = ctx.getConf();
        pendingRead = (async () => {
            try {
                const result = await blogArtalkJSON(conf.server, 'comments/owned', { site_name: conf.site, page_key: conf.pageKey }, signal,
                    { headers: { 'X-Artalk-Guest': token } });
                if (signal.aborted || !enabled || proof() !== token) return;
                if (!Array.isArray(result.ids)) throw new Error('评论归属响应无效，请重试。');
                owned = new Set(result.ids);
                ownedProof = token;
            } catch (error) {
                if (signal.aborted) return;
                owned.clear();
                ownedProof = undefined;
                notify('无法确认评论归属', error.message, 'error');
            } finally {
                pendingRead = null;
                if (!signal.aborted) {
                    sync();
                    if (readAgain) { readAgain = false; refreshOwned(); }
                }
            }
        })();
        return pendingRead;
    };
    on(root, 'click', event => {
        const control = event.target.closest?.('.blog-artalk-delete');
        if (!control || control.disabled || signal.aborted) return;
        if (dialog?.busy) return;
        closeDialog(false);
        const id = Number(control.dataset.commentId);
        const token = proof();
        if (!enabled || !token || token !== ownedProof || !owned.has(id)) return;
        const panel = element('div', 'blog-artalk-delete-confirm');
        panel.setAttribute('role', 'alertdialog');
        const caption = element('p', '', '删除自己的这条评论？已有回复会保留。');
        caption.id = `blog-artalk-delete-${crypto.randomUUID()}`;
        panel.setAttribute('aria-labelledby', caption.id);
        const cancel = button('blog-artalk-delete-cancel', '取消');
        cancel.setAttribute('aria-label', '取消删除');
        const confirm = button('blog-artalk-delete-submit', '确认删除');
        confirm.setAttribute('aria-label', '确认删除');
        panel.append(caption, cancel, confirm);
        control.closest('.atk-footer').after(panel);
        dialog = { panel, control, busy: false };
        const current = dialog;
        cancel.onclick = () => closeDialog();
        confirm.onclick = async () => {
            if (current.busy || signal.aborted || dialog !== current) return;
            current.busy = true;
            deleting.add(id);
            control.disabled = cancel.disabled = confirm.disabled = true;
            panel.setAttribute('aria-busy', 'true');
            try {
                const conf = ctx.getConf();
                const result = await blogArtalkJSON(conf.server, `comments/${id}`, { site_name: conf.site, page_key: conf.pageKey }, signal,
                    { method: 'DELETE', headers: { 'X-Artalk-Guest': token } });
                if (signal.aborted) return;
                if (result.comment?.id !== id || result.comment.blog_deleted !== true) throw new Error('删除响应无效，请刷新后确认。');
                owned.delete(id);
                closeDialog(false);
                sync();
                await refreshList();
                if (!signal.aborted) notify('删除成功', '评论已由作者删除。', 'success');
            } catch (error) {
                if (!signal.aborted) notify('删除失败', error.message || '删除失败，请重试。', 'error');
            } finally {
                deleting.delete(id);
                current.busy = false;
                control.disabled = cancel.disabled = confirm.disabled = false;
                panel.setAttribute('aria-busy', 'false');
            }
        };
        cancel.focus({ preventScroll: true });
    });
    on(root, 'keydown', event => {
        if (event.key === 'Escape' && dialog && !dialog.busy) {
            event.preventDefault();
            closeDialog();
        }
    });
    listen(ctx, 'comment-rendered', syncComment);
    listen(ctx, 'list-loaded', refreshOwned);
    listen(ctx, 'editor-submitted', refreshOwned);
    listen(ctx, 'unmounted', () => closeDialog(false));
    return { enable(value) { enabled = value; return refreshOwned(); } };
}

function installArtalkReplyPages(ctx, root, on, listen) {
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
                    const total = Math.max(1, Math.ceil(items.length / 5));
                    page = Math.min(Math.max(1, target), total);
                    const active = items.findIndex(row => row.querySelector('.atk-main-editor'));
                    if (active >= 0) page = Math.floor(active / 5) + 1;
                    items.forEach((row, index) => row.toggleAttribute('data-reply-page-hidden', index < (page - 1) * 5 || index >= page * 5));
                    nav.hidden = total <= 1;
                    nav.replaceChildren();
                    if (total > 1) {
                        nav.append(element('span', '', `${items.length} 条回复`));
                        const add = (label, target, disabled = false) => {
                            const control = button('', label);
                            control.disabled = disabled;
                            control.setAttribute('aria-label', /^\d+$/.test(label) ? `回复第 ${label} 页` : `${label}回复`);
                            if (String(page) === label) control.setAttribute('aria-current', 'page');
                            control.addEventListener('click', () => show(target, true));
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
                controller = { sync: () => show(page), reveal: row => show(Math.floor([...replies.children].indexOf(row) / 5) + 1) };
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
        if (target?.parentElement.classList.contains('atk-comment-children')) pagers.get(target.parentElement)?.reveal(target);
    }, true);
}

export function blogArtalkPlugin(ctx) {
    const root = ctx.getEl();
    const abort = new AbortController();
    const cleanups = [];
    const on = (target, name, fn, options) => {
        target.addEventListener(name, fn, options);
        cleanups.push(() => target.removeEventListener(name, fn, options));
    };
    const listen = (target, name, fn) => {
        target.on(name, fn);
        cleanups.push(() => target.off(name, fn));
    };
    let alive = true;
    let highlights = new Set();
    root.dataset.commentState = 'loading';
    const pagination = installArtalkPagination(ctx, listen, abort.signal);
    installArtalkReplyPages(ctx, root, on, listen);
    const selfDelete = installArtalkSelfDelete(ctx, root, on, listen, abort.signal, pagination.refresh);

    listen(ctx, 'created', () => {
        ctx.updateConf({ editorTravel: false });
        // These known blog builds extend fields without changing the 2.10.1 API.
        // Normalize it before the native mounted check; keep versionCheck on.
        if (['2.10.1-blog.1', '2.10.1-blog.2', '2.10.1-blog.3'].includes(ctx.getConf().apiVersion)) {
            ctx.updateConf({ apiVersion: '2.10.1' });
        }
        // LocalStorage restores the bottom draft during native plug mounting,
        // before our composer setup runs. Route that notification at its source
        // too, including on PJAX remounts.
        const editor = ctx.inject('editor');
        const original = editor.showNotify;
        const forward = (message, type) => {
            if (alive) notify('评论提示', message, type === 'e' ? 'error' : type === 's' ? 'success' : type === 'w' ? 'warning' : 'info');
        };
        editor.showNotify = forward;
        cleanups.push(() => { if (editor.showNotify === forward) editor.showNotify = original; });
    });

    listen(ctx, 'comment-rendered', comment => {
        const render = comment.getRender();
        const data = comment.getData();
        decorateArtalkComment(comment, abort.signal);
        if (data.blog_deleted === true) {
            render.$content.textContent = '评论已由作者删除。';
            render.$content.classList.add('blog-artalk-deleted');
        } else if (data.blog_markdown === false) {
            render.$content.textContent = data.content;
            render.$content.classList.add('blog-artalk-plain');
        }
        const reply = comment.getOpts().replyTo;
        if ((reply?.blog_deleted === true || reply?.blog_markdown === false) && render.$replyTo) {
            const quoted = render.$replyTo.querySelector('.atk-content');
            quoted.textContent = reply.blog_deleted === true ? '评论已由作者删除。' : reply.content;
            quoted.classList.add('blog-artalk-plain');
        }
        enhanceArtalkAvatar(render.$el.querySelector('.atk-avatar img'), data);
        const target = render.$replyAt || render.$replyTo;
        const link = target?.querySelector('.atk-nick');
        if (link) {
            link.tabIndex = 0;
            link.setAttribute('role', 'button');
            link.dataset.blogReplyTarget = String(data.rid);
        }
    });
    listen(ctx, 'list-loaded', () => { root.dataset.commentState = 'ready'; });
    listen(ctx, 'list-failed', () => { root.dataset.commentState = 'error'; });
    listen(ctx, 'unmounted', () => {
        alive = false;
        abort.abort();
        cleanups.splice(0).forEach(cleanup => cleanup());
        highlights.forEach(target => target.classList.remove('blog-artalk-reply-highlight'));
    });

    listen(ctx, 'mounted', () => {
        const editor = ctx.inject('editor');
        const conf = ctx.getConf();
        const nativeBeforeSubmit = conf.beforeSubmit;
        const ui = editor.getUI();
        const manager = editor.getPlugins();
        cleanups.push(bridgeArtalkPanels(manager));
        const state = { phase: 'idle', features: null, submission: null, captchaRequest: 0 };
        root.dataset.blogArtalk = 'true';
        const title = element('h2', 'blog-artalk-compose-title');
        title.append(icon('comment-dots'), document.createTextNode('发送评论'));
        ui.$el.prepend(title);

        // Keep the native header inputs themselves so Artalk retains identity,
        // login/autofill and change handling.
        for (const [input, symbol, label, autocomplete] of [
            [ui.$name, 'user', '昵称', 'nickname'],
            [ui.$email, 'envelope', '邮箱', 'email'],
            [ui.$link, 'link', '网址（选填）', 'url']
        ]) {
            const field = element('label', 'blog-artalk-field');
            field.append(icon(symbol));
            input.setAttribute('aria-label', label);
            input.autocomplete = autocomplete;
            input.placeholder = label;
            input.before(field);
            field.append(input);
        }
        ui.$email.inputMode = 'email';
        const linkField = ui.$link.closest('label');
        linkField.classList.add('comment-extra-field');
        const extra = element('div', 'blog-artalk-extra comment-extra-panel');
        extra.id = `blog-artalk-extra-${crypto.randomUUID()}`;
        extra.hidden = true;
        extra.inert = true;
        const extraInner = element('div', 'blog-artalk-extra-inner');
        extraInner.append(linkField);
        extra.append(extraInner);
        const toggle = button('blog-artalk-meta-toggle', '', 'chevron-down');
        toggle.setAttribute('aria-expanded', 'false');
        toggle.setAttribute('aria-label', '展开选填网址');
        toggle.title = '展开选填网址';
        toggle.setAttribute('aria-controls', extra.id);
        const toggleRow = element('div', 'blog-artalk-extra-toggle-row');
        toggleRow.append(toggle);
        ui.$header.after(extra, toggleRow);
        let transitionId = 0;
        on(toggle, 'click', () => {
            const expanded = toggle.getAttribute('aria-expanded') !== 'true';
            toggle.setAttribute('aria-expanded', String(expanded));
            toggle.querySelector('i').className = expanded ? 'fas fa-chevron-up' : 'fas fa-chevron-down';
            toggle.setAttribute('aria-label', expanded ? '收起选填网址' : '展开选填网址');
            toggle.title = toggle.getAttribute('aria-label');
            const current = ++transitionId;
            extra.dataset.tooltipReady = 'false';
            animatePanel(extra, expanded).then(() => {
                if (alive && current === transitionId && expanded) extra.dataset.tooltipReady = 'true';
            });
        });
        improveCommentTooltips(root);
        cleanups.push(() => root.dispatchEvent(new MouseEvent('mouseout', { bubbles: true })));
        const renderSend = phase => {
            state.phase = phase;
            const sending = phase === 'sending';
            ui.$submitBtn.disabled = sending;
            ui.$submitBtn.dataset.state = phase;
            ui.$submitBtn.setAttribute('aria-busy', String(sending));
            ui.$sendReplyBtn?.setAttribute('aria-disabled', String(sending));
            const labels = { idle: '发送', sending: '发送中', error: '重试', success: '已发送' };
            const icons = { idle: 'paper-plane', sending: 'spinner fa-spin', error: 'rotate-right', success: 'check' };
            ui.$submitBtn.replaceChildren(icon(icons[phase]), element('span', '', labels[phase]));
        };
        renderSend('idle');

        const choices = element('div', 'blog-artalk-choices');
        const markdown = checkbox('blog-artalk-checkbox blog-artalk-markdown-toggle', 'blog_markdown', 'Markdown', preference(preferences.markdown), checked => {
            savePreference(preferences.markdown, checked);
            updatePreview();
        });
        const mail = checkbox('blog-artalk-checkbox blog-artalk-mail-notice', 'blog_mail_notice', '邮件提醒', preference(preferences.mail), checked => {
            savePreference(preferences.mail, checked);
        });
        mail.label.title = '有回复时邮件通知我';
        mail.input.setAttribute('aria-label', '邮件提醒：有回复时邮件通知我');
        mail.label.hidden = true;
        choices.append(markdown.label, mail.label);
        ui.$bottomLeft.prepend(choices);

        const helpButton = button('blog-artalk-markdown-help', '');
        helpButton.title = 'Markdown 语法说明';
        helpButton.setAttribute('aria-label', '查看 Markdown 语法说明');
        helpButton.setAttribute('aria-expanded', 'false');
        const help = element('div', 'blog-artalk-markdown-guide', '支持 Markdown：**加粗**、*斜体*、`行内代码`、[链接](https://example.com)。换行后可用 > 引用和三个反引号书写代码块。');
        help.id = `blog-artalk-help-${crypto.randomUUID()}`;
        help.hidden = true;
        helpButton.setAttribute('aria-controls', help.id);
        ui.$plugBtnWrap.append(helpButton);
        ui.$submitBtn.parentElement.prepend(ui.$plugBtnWrap, ui.$stateWrap);
        ui.$bottom.after(help);
        on(helpButton, 'click', () => {
            const expanded = helpButton.getAttribute('aria-expanded') !== 'true';
            helpButton.setAttribute('aria-expanded', String(expanded));
            help.hidden = !expanded;
        });

        const captchaField = element('div', 'blog-artalk-field blog-artalk-captcha');
        const reload = button('blog-artalk-captcha-reload', '', 'key');
        reload.setAttribute('aria-label', '重新加载算术验证码');
        const answer = element('input');
        answer.name = 'blog_captcha_answer';
        answer.type = 'text';
        answer.inputMode = 'numeric';
        answer.autocomplete = 'off';
        answer.placeholder = '验证码加载中…';
        answer.setAttribute('aria-label', '算术验证码');
        answer.disabled = true;
        captchaField.append(reload, answer);
        ui.$header.append(captchaField);
        state.captcha = { token: '', input: answer };

        const loadCaptcha = async () => {
            const request = ++state.captchaRequest;
            state.captcha.token = '';
            answer.value = '';
            answer.disabled = true;
            answer.placeholder = '验证码加载中…';
            captchaField.dataset.commentTooltip = '验证码加载中…';
            refreshCommentTooltip(root);
            reload.disabled = true;
            try {
                const latest = ctx.getConf();
                const captcha = await blogArtalkJSON(latest.server, 'captcha', {
                    site_name: latest.site, page_key: latest.pageKey
                }, abort.signal);
                if (!alive || request !== state.captchaRequest) return;
                if (!captcha.token || !captcha.question) throw new Error('验证码响应缺少题目，请重新加载');
                state.captcha.token = captcha.token;
                answer.disabled = false;
                const question = /\?\s*$/.test(captcha.question) ? captcha.question : `${captcha.question} = ?`;
                answer.placeholder = '验证码';
                answer.setAttribute('aria-label', `算术验证码：${question}`);
                captchaField.dataset.commentTooltip = question;
                refreshCommentTooltip(root);
            } catch (error) {
                if (!alive || request !== state.captchaRequest) return;
                answer.placeholder = '点击钥匙重试';
                captchaField.dataset.commentTooltip = '点击钥匙重试';
                refreshCommentTooltip(root);
                notify('验证码加载失败', error.message || '验证码加载失败，请重试。', 'error');
            } finally {
                if (alive && request === state.captchaRequest) reload.disabled = false;
            }
        };
        const loadFeatures = async () => {
            try {
                const response = await blogArtalkJSON(conf.server, 'config', {}, abort.signal);
                if (!alive) return;
                if (typeof response.math_captcha !== 'boolean' || typeof response.mail_notice !== 'boolean') {
                    throw new Error('评论服务尚未配置完成，请稍后重试。');
                }
                const features = { mathCaptcha: response.math_captcha, mailNotice: response.mail_notice, markdown: response.markdown };
                state.features = features;
                selfDelete.enable(response.self_delete === true);
                mail.label.hidden = !features.mailNotice;
                captchaField.hidden = !features.mathCaptcha;
                ui.$header.dataset.captcha = String(features.mathCaptcha);
                if (features.mathCaptcha) await loadCaptcha();
            } catch (error) {
                if (!alive) return;
                notify('暂时无法发送', `${error.message || '评论服务连接失败'}，点击钥匙重新连接。`, 'warning');
                answer.placeholder = '点击钥匙重试';
            }
        };
        on(reload, 'click', () => state.features ? loadCaptcha() : loadFeatures());

        let preview;
        let previewOpen = false;
        let avatarTimer;
        cleanups.push(() => clearTimeout(avatarTimer));
        const emoticonPlug = manager.getPlugins().find(plug => plug.$panel?.classList.contains('atk-editor-plug-emoticons'));
        if (emoticonPlug?.$btn) {
            const control = emoticonPlug.$btn;
            const glyph = element('i', 'far fa-laugh');
            glyph.setAttribute('aria-hidden', 'true');
            control.replaceChildren(glyph);
            const wrapper = element('span', 'blog-artalk-emoticon');
            const popover = element('div', 'blog-artalk-emoticon-popover');
            popover.id = `blog-artalk-emoticons-${crypto.randomUUID()}`;
            popover.dataset.visible = 'false';
            control.before(wrapper);
            wrapper.append(control, popover);
            popover.append(emoticonPlug.$panel);
            control.setAttribute('role', 'button');
            control.setAttribute('aria-label', '选择表情');
            control.setAttribute('aria-expanded', 'false');
            control.setAttribute('aria-controls', popover.id);
            control.dataset.commentTooltip = '选择表情';
            control.tabIndex = 0;
            const positionPopover = () => {
                if (popover.dataset.visible !== 'true') return;
                const anchor = control.closest('.atk-plug-btn-wrap').getBoundingClientRect();
                const viewport = window.visualViewport;
                const viewLeft = viewport?.offsetLeft || 0;
                const viewTop = viewport?.offsetTop || 0;
                const viewWidth = viewport?.width || document.documentElement.clientWidth || window.innerWidth;
                const viewHeight = viewport?.height || window.innerHeight;
                const width = Math.min(340, viewWidth - 32);
                const left = Math.max(viewLeft + 16, Math.min(anchor.right - width, viewLeft + viewWidth - width - 16));
                popover.style.width = `${width}px`;
                popover.style.right = `${anchor.right - left - width}px`;
                const above = anchor.top - viewTop - 28;
                const below = viewTop + viewHeight - anchor.bottom - 28;
                const upwards = above >= 220 || above >= below;
                popover.style.top = upwards ? 'auto' : 'calc(100% + 12px)';
                popover.style.bottom = upwards ? 'calc(100% + 12px)' : 'auto';
                popover.style.transformOrigin = upwards ? 'bottom right' : 'top right';
                popover.style.setProperty('--emoticon-room', `${Math.max(80, Math.min(260, upwards ? above : below))}px`);
            };
            on(window, 'resize', positionPopover);
            on(window, 'scroll', positionPopover, { passive: true });
            if (window.visualViewport) {
                on(window.visualViewport, 'resize', positionPopover);
                on(window.visualViewport, 'scroll', positionPopover, { passive: true });
            }
            listen(manager.getEvents(), 'panel-show', plug => {
                if (plug !== emoticonPlug) return;
                ui.$el.dataset.blogArtalkPanel = 'emoticons';
                emoticonPlug.$panel.style.display = '';
                popover.inert = false;
                popover.dataset.visible = 'true';
                control.setAttribute('aria-expanded', 'true');
                positionPopover();
            });
            listen(manager.getEvents(), 'panel-hide', plug => {
                if (plug !== emoticonPlug) return;
                if (ui.$el.dataset.blogArtalkPanel === 'emoticons') delete ui.$el.dataset.blogArtalkPanel;
                // Leave the real panel mounted for the old fade/scale exit.
                emoticonPlug.$panel.style.display = '';
                popover.inert = true;
                popover.dataset.visible = 'false';
                control.setAttribute('aria-expanded', 'false');
                control.classList.remove('active');
            });
            popover.inert = true;
            on(control, 'keydown', event => {
                if (!['Enter', ' '].includes(event.key)) return;
                event.preventDefault();
                control.click();
            });
            on(document, 'click', event => {
                if (popover.dataset.visible === 'true' && !wrapper.contains(event.target)) manager.closePluginPanel();
            });
            on(wrapper, 'keydown', event => {
                if (event.key !== 'Escape') return;
                manager.closePluginPanel();
                control.focus({ preventScroll: true });
            });
        }
        function updatePreview() {
            if (!previewOpen || !preview) return;
            const nick = ui.$name.value.trim() || '未填写昵称';
            const email = ui.$email.value.trim();
            const identity = element('div', 'blog-artalk-preview-identity');
            const image = element('img', 'blog-artalk-preview-avatar');
            image.alt = `${nick}的头像`;
            const details = element('div');
            const href = websiteUrl(ui.$link.value);
            const name = element(href ? 'a' : 'span', 'blog-artalk-preview-nick', nick);
            if (href) {
                name.href = href;
                name.target = '_blank';
                name.rel = 'noopener noreferrer nofollow ugc';
            }
            details.append(name);
            identity.append(image, details);
            const content = element('div', 'blog-artalk-preview-content');
            if (markdown.input.checked) content.innerHTML = editor.getContentMarked();
            else { content.classList.add('blog-artalk-plain'); content.textContent = editor.getContentRaw(); }
            preview.$panel.replaceChildren(identity, content);
            clearTimeout(avatarTimer);
            avatarTimer = previewAvatar(image, nick, email);
        }
        const bindPreview = () => {
            preview = manager.getPlugins().find(plug => plug.$panel?.classList.contains('atk-editor-plug-preview'));
            if (!preview?.$btn) return;
            const control = preview.$btn;
            control.classList.add('blog-artalk-preview-btn');
            control.replaceChildren(icon('eye'), element('span', '', '预览'));
            control.setAttribute('role', 'button');
            control.setAttribute('aria-label', '预览评论');
            control.setAttribute('aria-pressed', 'false');
            control.tabIndex = 0;
            ui.$submitBtn.before(control);
            on(control, 'keydown', event => {
                if (event.key !== 'Enter' && event.key !== ' ') return;
                event.preventDefault();
                control.click();
            });
            const events = manager.getEvents();
            listen(events, 'panel-show', plug => {
                previewOpen = plug === preview;
                if (previewOpen) ui.$el.dataset.blogArtalkPanel = 'preview';
                control.setAttribute('aria-pressed', String(previewOpen));
                updatePreview();
            });
            listen(events, 'panel-hide', plug => {
                if (plug !== preview) return;
                previewOpen = false;
                control.setAttribute('aria-pressed', 'false');
            });
            listen(events, 'content-updated', updatePreview);
        };
        bindPreview();

        // Keep Artalk's real reply state and request preset; only the reference
        // presentation and the pinned client's instant scrolling are adapted.
        const summary = element('div', 'blog-artalk-reply-summary');
        summary.setAttribute('role', 'note');
        const reference = (data, className) => {
            const link = element('a', className, data.nick || '访客');
            link.href = `#atk-comment-${data.id}`;
            link.dataset.blogReplyTarget = String(data.id);
            return link;
        };
        const scrollOptions = () => ({
            behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
            block: 'start'
        });
        for (const method of ['setReplyComment', 'setEditComment', 'resetState']) {
            const native = editor[method];
            const wrapped = function (...args) {
                if (!alive) return;
                // Preserve the target while native Submit is awaiting the UA or
                // server response. Its own reset() releases it after success.
                if (state.phase === 'sending' && !state.resetting) return;
                const wasReplying = summary.isConnected;
                let result;
                if (method === 'setReplyComment') {
                    const options = editor.getOptions();
                    const getConf = options.getConf;
                    const focus = ui.$textarea.focus;
                    // 2.10.1 hard-codes instant scrolling in its state switch.
                    // Scope that scroll to the non-scrolling editor itself;
                    // scroll the page once, after the full reference is ready.
                    options.getConf = () => ({ ...getConf(), get: () => ({ ...getConf().get(), scrollRelativeTo: () => ui.$el }) });
                    ui.$textarea.focus = () => focus.call(ui.$textarea, { preventScroll: true });
                    try { result = native.apply(this, args); }
                    finally { options.getConf = getConf; ui.$textarea.focus = focus; }
                } else result = native.apply(this, args);
                if (method !== 'setReplyComment') {
                    summary.remove();
                    if (wasReplying && method === 'resetState' && !state.resetting) ui.$textarea.focus({ preventScroll: true });
                    return result;
                }
                const data = args[0];
                const target = args[1];
                const content = target.querySelector(':scope > .atk-comment > .atk-main > .atk-body > .atk-content');
                const compact = (content?.textContent || data.content).replace(/\s+/g, ' ').trim();
                const text = Array.from(compact);
                const meta = element('div', 'blog-artalk-reply-meta');
                meta.append(document.createTextNode('正在回复 '), reference(data, 'blog-artalk-reply-author'));
                if (data.rid) {
                    const parent = ctx.getCommentNodes().find(node => node.getData().id === data.rid)?.getData();
                    const parentName = parent?.nick || target.querySelector('.atk-reply-at > .atk-nick, .atk-reply-to .atk-nick')?.textContent;
                    if (parentName) {
                        const parentInfo = element('span', 'atk-reply-at');
                        parentInfo.append(element('span', 'atk-arrow'), reference({ id: data.rid, nick: parentName }, 'blog-artalk-reply-parent'));
                        meta.append(parentInfo);
                    }
                }
                const agents = element('span', 'atk-ua-wrap');
                for (const badge of target.querySelectorAll(':scope > .atk-comment > .atk-main > .atk-header > .atk-ua-wrap > .atk-ua')) {
                    const copy = element('span', badge.className, badge.textContent);
                    copy.dataset.agent = badge.dataset.agent;
                    copy.title = badge.dataset.commentTooltip || badge.title;
                    agents.append(copy);
                }
                if (agents.childElementCount) meta.append(agents);
                meta.append(document.createTextNode(' 的评论：'));
                const excerpt = element('p', 'blog-artalk-reply-excerpt', text.slice(0, 220).join('') + (text.length > 220 ? '…' : ''));
                summary.replaceChildren(meta, excerpt);
                title.after(summary);
                if (ui.$sendReplyBtn) {
                    ui.$sendReplyBtn.querySelector('.atk-text-wrap').textContent = '取消回复';
                    ui.$sendReplyBtn.setAttribute('role', 'button');
                    ui.$sendReplyBtn.setAttribute('aria-label', '取消回复');
                    ui.$sendReplyBtn.setAttribute('aria-disabled', 'false');
                    ui.$sendReplyBtn.tabIndex = 0;
                    summary.append(ui.$sendReplyBtn);
                }
                ui.$el.scrollIntoView(scrollOptions());
                ui.$textarea.focus({ preventScroll: true });
                return result;
            };
            editor[method] = wrapped;
            cleanups.push(() => { if (editor[method] === wrapped) editor[method] = native; });
        }
        // Native Submit calls reset() before editor-submitted. Distinguish it
        // from an explicit cancel so successful replies still finish normally.
        const nativeReset = editor.reset;
        const reset = function (...args) {
            state.resetting = true;
            try { return nativeReset.apply(this, args); }
            finally { state.resetting = false; }
        };
        editor.reset = reset;
        cleanups.push(() => { if (editor.reset === reset) editor.reset = nativeReset; });
        on(root, 'click', event => {
            const link = event.target.closest?.('.blog-artalk-reply-summary [data-blog-reply-target]');
            if (!link) return;
            event.preventDefault();
            root.querySelector(`#atk-comment-${CSS.escape(link.dataset.blogReplyTarget)}`)?.scrollIntoView(scrollOptions());
        });

        // Redirect this editor's native notifications at their source. Native
        // Submit still catches the real rejection and performs its own cleanup.
        const showNotify = (message, type) => {
            if (!alive) return;
            const error = type === 'e';
            if (error && state.phase === 'sending') renderSend('error');
            notify(error ? '评论发送失败' : '评论提示', state.failure?.message || message,
                error ? 'error' : type === 's' ? 'success' : type === 'w' ? 'warning' : 'info');
            state.failure = null;
        };
        editor.showNotify = showNotify;

        const nativeShowLoading = editor.showLoading;
        const nativeHideLoading = editor.hideLoading;
        // The old composer stays readable while its real send button is busy.
        // Native Submit still owns the request and always calls hideLoading.
        const showLoading = () => { ui.$el.setAttribute('aria-busy', 'true'); };
        const hideLoading = () => { ui.$el.setAttribute('aria-busy', 'false'); };
        editor.showLoading = showLoading;
        editor.hideLoading = hideLoading;
        cleanups.push(() => {
            if (editor.showLoading === showLoading) editor.showLoading = nativeShowLoading;
            if (editor.hideLoading === hideLoading) editor.hideLoading = nativeHideLoading;
        });

        cleanups.push(bridgeArtalkEditorApi(manager, () => state.submission || {}, error => {
            if (!alive) return;
            state.failure = error;
            renderSend('error');
            if (state.features?.mathCaptcha) loadCaptcha();
        }, abort.signal));
        const beforeSubmit = (activeEditor, next) => {
            if (state.phase === 'sending') return;
            if (!state.features) {
                notify('暂时无法发送', '评论服务尚未连接，请点击钥匙重新连接。', 'warning');
                return;
            }
            ui.$el.querySelectorAll('[aria-invalid]').forEach(input => input.removeAttribute('aria-invalid'));
            const errors = validateArtalkForm(activeEditor, state.captcha,
                state.features.mathCaptcha && activeEditor.getState() !== 'edit');
            if (errors.length) {
                errors.forEach(({ input }) => input.setAttribute('aria-invalid', 'true'));
                notify('评论格式错误', errors.map(error => error.message).join('\n'), 'error');
                const first = errors.find(error => !error.input.disabled)?.input;
                if (first === ui.$link && extra.inert) toggle.click();
                first?.focus({ preventScroll: true });
                return;
            }
            ctx.getUser().update({ name: ui.$name.value.trim(), email: ui.$email.value.trim(), link: ui.$link.value.trim() });
            const proceed = () => {
                if (!alive || state.phase === 'sending') return;
                state.submission = {
                    name: ui.$name.value.trim(),
                    email: ui.$email.value.trim(),
                    link: ui.$link.value.trim(),
                    blog_captcha_token: state.captcha.token,
                    blog_captcha_answer: answer.value.trim(),
                    blog_mail_notice: state.features.mailNotice && mail.input.checked,
                    blog_markdown: markdown.input.checked
                };
                renderSend('sending');
                notify('正在发送', '评论正在发送中…', 'info', 0);
                next();
            };
            if (nativeBeforeSubmit) nativeBeforeSubmit(activeEditor, proceed);
            else proceed();
        };
        ctx.updateConf({ beforeSubmit });
        cleanups.push(() => { if (ctx.getConf().beforeSubmit === beforeSubmit) ctx.updateConf({ beforeSubmit: nativeBeforeSubmit }); });
        listen(manager.getEvents(), 'editor-submitted', () => {
            if (!alive) return;
            renderSend('success');
            notify('发送成功', '你的评论已发送。', 'success');
            state.submission = null;
            manager.closePluginPanel();
            if (state.features?.mathCaptcha) loadCaptcha();
        });
        on(ui.$el, 'input', event => {
            event.target.removeAttribute('aria-invalid');
            if (state.phase === 'error' || state.phase === 'success') {
                renderSend('idle');
            }
            if (event.target === ui.$name || event.target === ui.$email || event.target === ui.$link) updatePreview();
        });
        on(ui.$textarea, 'keydown', event => {
            if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
                event.preventDefault();
                editor.submit();
            }
        });

        // Highlight the referenced comment with pointer and keyboard, scoped to
        // this list. Artalk remains responsible for resolving/loading targets.
        const highlightedLinks = { hovered: null, focused: null };
        const activeRows = { hovered: null, focused: null };
        let visibleRows = new Set();
        const highlight = () => {
            const rows = new Set(Object.values(activeRows).filter(row => row && root.contains(row)));
            for (const row of visibleRows) if (!rows.has(row)) row.classList.remove('blog-artalk-row-active');
            for (const row of rows) {
                const body = row.querySelector(':scope > .atk-main > .atk-body');
                const top = Math.max(0, body.getBoundingClientRect().bottom - row.getBoundingClientRect().top - 24);
                row.style.setProperty('--reader-action-top', `${top}px`);
                row.classList.add('blog-artalk-row-active');
            }
            visibleRows = rows;
            const targets = new Set();
            for (const link of Object.values(highlightedLinks)) {
                if (!link || !root.contains(link)) continue;
                const target = root.querySelector(`#atk-comment-${CSS.escape(link.dataset.blogReplyTarget)}`);
                if (!target) continue;
                const row = target.querySelector(':scope > .atk-comment');
                const body = row.querySelector(':scope > .atk-main > .atk-body');
                const avatar = row.querySelector(':scope > .atk-avatar');
                const bottom = Math.max(body.getBoundingClientRect().bottom, avatar.getBoundingClientRect().bottom + 26);
                row.style.setProperty('--reply-highlight-height', `${Math.ceil(bottom - row.getBoundingClientRect().top + 8)}px`);
                targets.add(target);
            }
            for (const target of highlights) {
                if (!targets.has(target)) target.classList.remove('blog-artalk-reply-highlight');
            }
            for (const target of targets) target.classList.add('blog-artalk-reply-highlight');
            highlights = targets;
        };
        for (const [name, entering] of [['pointerover', true], ['pointerout', false], ['focusin', true], ['focusout', false]]) {
            on(root, name, event => {
                const node = entering ? event.target : event.relatedTarget;
                const key = name.startsWith('pointer') ? 'hovered' : 'focused';
                highlightedLinks[key] = node?.closest?.('[data-blog-reply-target]');
                activeRows[key] = node?.closest?.('.atk-comment');
                highlight();
            });
        }
        cleanups.push(() => visibleRows.forEach(row => row.classList.remove('blog-artalk-row-active')));
        on(root, 'keydown', event => {
            if (!['Enter', ' '].includes(event.key) || !event.target.matches('[data-blog-reply-target], .blog-artalk-action, .atk-state-btn')) return;
            event.preventDefault();
            if (event.target.getAttribute('aria-disabled') !== 'true') event.target.click();
        });
        cleanups.push(() => {
            manager.closePluginPanel();
            manager.getEvents().trigger('unmounted');
        });
        loadFeatures();
    });
}

export function installArtalkUI(Artalk) {
    if (installed.has(Artalk)) return;
    installed.add(Artalk);
    Artalk.use(blogArtalkPlugin);
}
