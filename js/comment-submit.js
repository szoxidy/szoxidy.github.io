const controllers = new WeakMap();

export function validateComment(form) {
    const errors = [];
    const read = selector => form.querySelector(selector);
    const content = read('textarea');
    const nick = read('input[name="nick"]');
    const mail = read('input[name="mail"]');
    const link = read('input[name="link"]');
    const captcha = read('input[name="blogCaptchaAnswer"]');
    const value = input => input?.value.trim() || '';
    const add = (input, message) => errors.push({ input, message });

    if (!value(content)) add(content, '评论内容不能为空');
    if (!value(nick)) add(nick, '昵称不能为空');
    if (!value(mail)) add(mail, '邮箱不能为空');
    else if (mail.validity?.typeMismatch || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value(mail))) add(mail, '邮箱格式错误');
    if (value(link)) {
        try {
            const url = new URL(value(link));
            if (!['http:', 'https:'].includes(url.protocol) || !url.hostname || url.username || url.password) throw Error();
        } catch { add(link, '网址请填写完整的 http:// 或 https:// 地址'); }
    }
    if (captcha) {
        if (captcha.disabled) add(captcha, '验证码尚未就绪，请稍后重试或点击钥匙重新加载');
        else if (!value(captcha)) add(captcha, '验证码未输入');
        else if (!/^-?\d+$/.test(value(captcha))) add(captcha, '验证码请填写数字');
    }
    return errors;
}

function notify(title, message, type, duration = 5000) {
    return globalThis.siteNotify?.({ title, message, type, duration, key: 'comment-submit', variant: 'comment' });
}

function render(state, phase) {
    state.phase = phase;
    const sending = phase === 'sending';
    state.button.disabled = sending;
    state.button.dataset.state = phase;
    state.button.setAttribute('aria-busy', String(sending));
    const labels = { idle: '发送', sending: '发送中', error: '重试', success: '已发送' };
    const icons = { idle: 'paper-plane', sending: 'spinner fa-spin', error: 'rotate-right', success: 'check' };
    const label = labels[phase];
    if (state.label.textContent !== label) state.label.textContent = label;
    state.icon.className = `fas fa-${icons[phase]}`;
}

export function enhanceCommentSubmit(form) {
    const native = form.querySelector('.tk-send');
    if (!native) return;
    let state = controllers.get(form);
    if (!state) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'tk-button tk-button--primary tk-button--small comment-send comment-reader-owned';
        const icon = document.createElement('i');
        icon.setAttribute('aria-hidden', 'true');
        const label = document.createElement('span');
        button.append(icon, label);
        // Keep submission, server errors and draft clearing in Twikoo. Its own
        // disabled button cannot explain missing fields, so this control validates first.
        native.setAttribute('aria-hidden', 'true');
        native.tabIndex = -1;
        native.after(button);
        state = { native, button, icon, label, phase: 'idle', observedSending: false };
        controllers.set(form, state);
        render(state, 'idle');

        const send = () => {
            if (state.phase === 'sending') return;
            const errors = validateComment(form);
            form.querySelectorAll('[aria-invalid="true"]').forEach(input => input.removeAttribute('aria-invalid'));
            if (errors.length) {
                errors.forEach(({ input }) => input?.setAttribute('aria-invalid', 'true'));
                notify('评论格式错误', errors.map(error => error.message).join('\n'), 'error');
                const first = errors.find(error => error.input && !error.input.disabled)?.input;
                if (first?.name === 'link' && form.querySelector('.comment-extra-panel')?.inert) form.querySelector('.comment-meta-toggle')?.click();
                first?.focus({ preventScroll: true });
                return;
            }
            if (native.disabled) {
                notify('暂时无法发送', '评论表单尚未就绪，请稍后再试。', 'warning');
                return;
            }
            state.observedSending = false;
            state.result = null;
            render(state, 'sending');
            notify('正在发送', '评论正在发送中…', 'info', 0);
            native.click();
            // Observe Vue's first render even when a response finishes before
            // the page-wide animation-frame observer runs.
            queueMicrotask(() => enhanceCommentSubmit(form));
        };
        button.addEventListener('click', send);
        form.addEventListener('blog:comment-result', event => {
            state.result = event.detail;
            state.observedSending = true;
        });
        form.addEventListener('keyup', event => {
            if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
                event.preventDefault();
                event.stopImmediatePropagation();
                send();
            }
        }, true);
        form.addEventListener('input', event => {
            event.target.removeAttribute('aria-invalid');
            if (state.phase === 'error' || state.phase === 'success') render(state, 'idle');
        });
    }

    const sending = /发送中/.test(native.textContent) || native.classList.contains('is-loading');
    if (sending) state.observedSending = true;
    if (state.phase === 'sending' && state.observedSending && !sending) {
        const error = form.querySelector('.tk-submit-error, .tk-error');
        if (error || (state.result && !state.result.id) || form.querySelector('textarea').value.trim()) {
            render(state, 'error');
            notify('评论发送失败', state.result?.message || error?.textContent.trim() || '评论未发送，请重试。', 'error');
        } else {
            render(state, 'success');
            notify('发送成功', '你的评论已发送。', 'success');
        }
    }
}
