import { improveCommentTooltips, refreshCommentTooltip } from '../comment-tooltips.js?v=a0189d5080';
import {
    SEND_BUTTON_STATES,
    normalizePreviewWebsiteUrl,
    validateCommentFields
} from '../lib/comment-shared.js?v=94b74f8636';
import { readBooleanPref, writeBooleanPref } from '../lib/storage.js?v=3545997d60';
import { animatePanel } from '../ui-motion.js?v=70b3e73716';
import { blogArtalkJSON, bridgeArtalkEditorApi, bridgeArtalkPanels } from './api.js?v=076db1c676';
import { ARTALK_PREFERENCE_KEYS, button, checkbox, element, icon, notifyComment } from './config.js?v=3998dd6238';
import { completeArtalkUserAgent, previewAvatar } from './profile.js?v=a555dc6842';
import { installArtalkHighlights } from './reader.js?v=c41d2f086f';

export function validateArtalkForm(editor, captcha, needsCaptcha = true) {
    const ui = editor.getUI();
    return validateCommentFields({
        content: { input: ui.$textarea, value: editor.getContentRaw() },
        nick: { input: ui.$name, value: ui.$name.value },
        email: { input: ui.$email, value: ui.$email.value },
        link: { input: ui.$link, value: ui.$link.value },
        captcha: captcha
            ? {
                input: captcha.input,
                value: captcha.input.value,
                ready: Boolean(captcha.token),
                disabled: captcha.input.disabled
            }
            : null
    }, { needsCaptcha });
}

function setupHeaderFields(ui, on, isAlive) {
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
            if (isAlive() && current === transitionId && expanded) extra.dataset.tooltipReady = 'true';
        });
    });

    return { extra, toggle };
}

function setupEmoticonPopover(manager, ui, on, listen) {
    const emoticonPlug = manager.getPlugins().find(plug => plug.$panel?.classList.contains('atk-editor-plug-emoticons'));
    if (!emoticonPlug?.$btn) return;

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

function setupPreviewPanel({ manager, editor, ui, markdown, whisper, on, listen, cleanups }) {
    let preview;
    let previewOpen = false;
    let previewImage;
    let avatarTimer;
    cleanups.push(() => clearTimeout(avatarTimer));

    function updatePreview() {
        if (!previewOpen || !preview) return;
        const nick = ui.$name.value.trim() || '未填写昵称';
        const email = ui.$email.value.trim();
        const identity = element('div', 'blog-artalk-preview-identity atk-comment');
        identity.dataset.reply = String(editor.getState() === 'reply');
        const avatar = element('div', 'atk-avatar');
        const image = previewImage ||= element('img', 'blog-artalk-preview-avatar');
        image.alt = `${nick}的头像`;
        const details = element('div', 'atk-main blog-artalk-preview-main');
        const header = element('div', 'atk-header');
        const href = normalizePreviewWebsiteUrl(ui.$link.value);
        const name = element(href ? 'a' : 'span', 'atk-nick blog-artalk-preview-nick', nick);
        if (href) {
            name.href = href;
            name.target = '_blank';
            name.rel = 'noopener noreferrer nofollow ugc';
        }
        header.append(name);
        if (whisper.input.checked) header.append(element('span', 'blog-artalk-private-badge', '悄悄话'));
        const body = element('div', 'atk-body');
        const content = element('div', 'atk-content blog-artalk-preview-content');
        if (markdown.input.checked) content.innerHTML = editor.getContentMarked();
        else { content.classList.add('blog-artalk-plain'); content.textContent = editor.getContentRaw(); }
        body.append(content);
        details.append(header, body);
        avatar.append(image);
        identity.append(avatar, details);
        preview.$panel.replaceChildren(identity);
        avatarTimer = previewAvatar(image, nick, email);
    }

    preview = manager.getPlugins().find(plug => plug.$panel?.classList.contains('atk-editor-plug-preview'));
    if (preview?.$btn) {
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
    }

    return updatePreview;
}

function setupReplySummary({ ctx, root, editor, ui, title, state, syncPrivateReply, updatePreview, on, cleanups, isAlive }) {
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
            if (!isAlive()) return;
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
            } else {
                result = native.apply(this, args);
            }
            if (method !== 'setReplyComment') {
                summary.remove();
                syncPrivateReply(method === 'setEditComment' ? args[0] : null);
                if (wasReplying && method === 'resetState' && !state.resetting) ui.$textarea.focus({ preventScroll: true });
                updatePreview();
                return result;
            }
            const data = args[0];
            syncPrivateReply(data);
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
            updatePreview();
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
}

export function installArtalkComposer(ctx, { root, on, listen, cleanups, signal, isAlive, selfDelete }) {
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

    const { extra, toggle } = setupHeaderFields(ui, on, isAlive);

    improveCommentTooltips(root);
    cleanups.push(() => root.dispatchEvent(new MouseEvent('mouseout', { bubbles: true })));

    const renderSend = phase => {
        state.phase = phase;
        const sending = phase === 'sending';
        ui.$submitBtn.disabled = sending;
        ui.$submitBtn.dataset.state = phase;
        ui.$submitBtn.setAttribute('aria-busy', String(sending));
        ui.$sendReplyBtn?.setAttribute('aria-disabled', String(sending));
        const visual = SEND_BUTTON_STATES[phase];
        ui.$submitBtn.replaceChildren(icon(visual.icon), element('span', '', visual.label));
    };
    renderSend('idle');

    let updatePreview = () => {};
    const choices = element('div', 'blog-artalk-choices');
    const markdown = checkbox(
        'blog-artalk-checkbox blog-artalk-markdown-toggle',
        'blog_markdown',
        'Markdown',
        readBooleanPref(ARTALK_PREFERENCE_KEYS.markdown, true),
        checked => {
            writeBooleanPref(ARTALK_PREFERENCE_KEYS.markdown, checked);
            updatePreview();
        }
    );
    const mail = checkbox(
        'blog-artalk-checkbox blog-artalk-mail-notice',
        'blog_mail_notice',
        '邮件提醒',
        readBooleanPref(ARTALK_PREFERENCE_KEYS.mail, true),
        checked => {
            writeBooleanPref(ARTALK_PREFERENCE_KEYS.mail, checked);
        }
    );
    mail.label.title = '有回复时邮件通知我';
    mail.input.setAttribute('aria-label', '邮件提醒：有回复时邮件通知我');
    mail.label.hidden = true;

    const whisper = checkbox(
        'blog-artalk-checkbox blog-artalk-private',
        'blog_private',
        '悄悄话',
        readBooleanPref(ARTALK_PREFERENCE_KEYS.private, false),
        checked => {
            writeBooleanPref(ARTALK_PREFERENCE_KEYS.private, checked);
            updatePreview();
        }
    );
    whisper.label.title = '评论仅发送者和博主可见';
    whisper.input.setAttribute('aria-label', '悄悄话：评论仅发送者和博主可见');
    whisper.label.hidden = true;

    const syncPrivateReply = data => {
        const locked = data?.blog_private === true;
        // Cancelling a reply changes its target, not the visibility of the
        // text still in the composer. Only an explicit uncheck may publish it.
        if (locked) whisper.input.checked = true;
        whisper.input.disabled = locked;
        writeBooleanPref(ARTALK_PREFERENCE_KEYS.private, whisper.input.checked);
    };

    choices.append(markdown.label, whisper.label, mail.label);
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
            const captcha = await blogArtalkJSON(
                latest.server,
                'captcha',
                { site_name: latest.site, page_key: latest.pageKey },
                signal
            );
            if (!isAlive() || request !== state.captchaRequest) return;
            if (!captcha.token || !captcha.question) throw new Error('验证码响应缺少题目，请重新加载');
            state.captcha.token = captcha.token;
            answer.disabled = false;
            const question = /\?\s*$/.test(captcha.question) ? captcha.question : `${captcha.question} = ?`;
            answer.placeholder = '验证码';
            answer.setAttribute('aria-label', `算术验证码：${question}`);
            captchaField.dataset.commentTooltip = question;
            refreshCommentTooltip(root);
        } catch (error) {
            if (!isAlive() || request !== state.captchaRequest) return;
            answer.placeholder = '点击钥匙重试';
            captchaField.dataset.commentTooltip = '点击钥匙重试';
            refreshCommentTooltip(root);
            notifyComment('验证码加载失败', error.message || '验证码加载失败，请重试。', 'error');
        } finally {
            if (isAlive() && request === state.captchaRequest) reload.disabled = false;
        }
    };

    const loadFeatures = async () => {
        try {
            const response = await blogArtalkJSON(conf.server, 'config', {}, signal);
            if (!isAlive()) return;
            if (typeof response.math_captcha !== 'boolean' || typeof response.mail_notice !== 'boolean') {
                throw new Error('评论服务尚未配置完成，请稍后重试。');
            }
            const features = {
                mathCaptcha: response.math_captcha,
                mailNotice: response.mail_notice,
                markdown: response.markdown,
                privateComments: response.private_comments === true
            };
            state.features = features;
            selfDelete.enable(response.self_delete === true);
            mail.label.hidden = !features.mailNotice;
            whisper.label.hidden = !features.privateComments;
            captchaField.hidden = !features.mathCaptcha;
            ui.$header.dataset.captcha = String(features.mathCaptcha);
            if (features.mathCaptcha) await loadCaptcha();
        } catch (error) {
            if (!isAlive()) return;
            notifyComment('暂时无法发送', `${error.message || '评论服务连接失败'}，点击钥匙重新连接。`, 'warning');
            answer.placeholder = '点击钥匙重试';
        }
    };
    on(reload, 'click', () => state.features ? loadCaptcha() : loadFeatures());

    setupEmoticonPopover(manager, ui, on, listen);
    updatePreview = setupPreviewPanel({ manager, editor, ui, markdown, whisper, on, listen, cleanups });
    setupReplySummary({ ctx, root, editor, ui, title, state, syncPrivateReply, updatePreview, on, cleanups, isAlive });

    // Redirect this editor's native notifications at their source. Native
    // Submit still catches the real rejection and performs its own cleanup.
    const showNotify = (message, type) => {
        if (!isAlive()) return;
        const error = type === 'e';
        if (error && state.phase === 'sending') renderSend('error');
        notifyComment(
            error ? '评论发送失败' : '评论提示',
            state.failure?.message || message,
            error ? 'error' : type === 's' ? 'success' : type === 'w' ? 'warning' : 'info'
        );
        state.failure = null;
    };
    editor.showNotify = showNotify;

    const nativeShowLoading = editor.showLoading;
    const nativeHideLoading = editor.hideLoading;
    // The composer stays readable while its real send button is busy.
    // Native Submit still owns the request and always calls hideLoading.
    const showLoading = () => { ui.$el.setAttribute('aria-busy', 'true'); };
    const hideLoading = () => { ui.$el.setAttribute('aria-busy', 'false'); };
    editor.showLoading = showLoading;
    editor.hideLoading = hideLoading;
    cleanups.push(() => {
        if (editor.showLoading === showLoading) editor.showLoading = nativeShowLoading;
        if (editor.hideLoading === hideLoading) editor.hideLoading = nativeHideLoading;
    });

    cleanups.push(bridgeArtalkEditorApi(
        manager,
        async data => ({ ...state.submission || {}, ua: await completeArtalkUserAgent(data.ua) }),
        error => {
            if (!isAlive()) return;
            state.failure = error;
            renderSend('error');
            if (state.features?.mathCaptcha) loadCaptcha();
        },
        signal
    ));

    const beforeSubmit = (activeEditor, next) => {
        if (state.phase === 'sending') return;
        if (!state.features) {
            notifyComment('暂时无法发送', '评论服务尚未连接，请点击钥匙重新连接。', 'warning');
            return;
        }
        if (whisper.input.checked && !state.features.privateComments) {
            notifyComment('暂时无法发送', '当前评论服务尚未启用悄悄话，草稿未发送。', 'warning');
            return;
        }
        ui.$el.querySelectorAll('[aria-invalid]').forEach(input => input.removeAttribute('aria-invalid'));
        const errors = validateArtalkForm(
            activeEditor,
            state.captcha,
            state.features.mathCaptcha && activeEditor.getState() !== 'edit'
        );
        if (errors.length) {
            errors.forEach(({ input }) => input.setAttribute('aria-invalid', 'true'));
            notifyComment('评论格式错误', errors.map(error => error.message).join('\n'), 'error');
            const first = errors.find(error => !error.input.disabled)?.input;
            if (first === ui.$link && extra.inert) toggle.click();
            first?.focus({ preventScroll: true });
            return;
        }
        ctx.getUser().update({ name: ui.$name.value.trim(), email: ui.$email.value.trim(), link: ui.$link.value.trim() });
        const proceed = () => {
            if (!isAlive() || state.phase === 'sending') return;
            state.submission = {
                name: ui.$name.value.trim(),
                email: ui.$email.value.trim(),
                link: ui.$link.value.trim(),
                blog_captcha_token: state.captcha.token,
                blog_captcha_answer: answer.value.trim(),
                blog_mail_notice: state.features.mailNotice && mail.input.checked,
                blog_markdown: markdown.input.checked,
                blog_private: whisper.input.checked
            };
            renderSend('sending');
            notifyComment('正在发送', '评论正在发送中…', 'info', 0);
            next();
        };
        if (nativeBeforeSubmit) nativeBeforeSubmit(activeEditor, proceed);
        else proceed();
    };
    ctx.updateConf({ beforeSubmit });
    cleanups.push(() => { if (ctx.getConf().beforeSubmit === beforeSubmit) ctx.updateConf({ beforeSubmit: nativeBeforeSubmit }); });

    listen(manager.getEvents(), 'editor-submitted', () => {
        if (!isAlive()) return;
        renderSend('success');
        notifyComment('发送成功', '你的评论已发送。', 'success');
        state.submission = null;
        whisper.input.checked = false;
        whisper.input.disabled = false;
        writeBooleanPref(ARTALK_PREFERENCE_KEYS.private, false);
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

    cleanups.push(installArtalkHighlights(root));
    cleanups.push(() => {
        manager.closePluginPanel();
        manager.getEvents().trigger('unmounted');
    });
    loadFeatures();
}
