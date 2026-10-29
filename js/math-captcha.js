const services = new Map();
const requests = new WeakMap();
const nativeOpen = XMLHttpRequest.prototype.open;
const nativeSend = XMLHttpRequest.prototype.send;
const fields = new WeakMap();
const nativeFetch = globalThis.fetch;
const commentParents = globalThis.blogCommentParents = new Map();

function configRequest(state) {
    const request = {};
    state.request = request;
    state.checking = true;
    state.failed = false;
    return (data, ok) => {
        if (state.request !== request) return;
        state.request = null;
        state.checking = false;
        if (ok && !data?.code && data?.config && typeof data.config === 'object' && !Array.isArray(data.config)) {
            state.enabled = data.config.BLOG_MATH_CAPTCHA === 'true';
            state.mailNotice = data.config.BLOG_MAIL_NOTICE === 'true';
            state.checked = true;
        } else {
            state.failed = true;
        }
        document.dispatchEvent(new Event('blog:captcha-config'));
    };
}

function requestConfig(endpoint, state) {
    if (state.checking) return;
    const finish = configRequest(state);
    document.dispatchEvent(new Event('blog:captcha-config'));
    nativeFetch(endpoint, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event: 'GET_CONFIG' }), signal: AbortSignal.timeout(10000)
    }).then(async response => finish(await response.json(), response.ok))
        .catch(() => finish(null, false));
}

export function plainComment(value) {
    const escaped = String(value).replace(/[&<>"']/g, char => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[char]));
    return `<p>${escaped.replace(/\r\n?|\n/g, '<br>')}</p>`;
}

// Twikoo 1.x's URL adapter uses XHR. Scope compose options to the configured
// comment endpoint and keep all reading, login and like payloads intact.
XMLHttpRequest.prototype.open = function(method, url, ...args) {
    requests.set(this, { method, url: new URL(url, location.href).href });
    return nativeOpen.call(this, method, url, ...args);
};
XMLHttpRequest.prototype.send = function(body) {
    registerAll();
    const request = requests.get(this);
    const state = request?.method?.toUpperCase() === 'POST' && services.get(request.url);
    if (state && typeof body === 'string') {
        let data;
        try { data = JSON.parse(body); } catch { /* Other requests pass through. */ }
        if (data?.event === 'GET_CONFIG') {
            const finish = configRequest(state);
            this.addEventListener('load', () => {
                try {
                    finish(JSON.parse(this.responseText), this.status >= 200 && this.status < 300);
                } catch { finish(null, false); }
            }, { once: true });
            for (const event of ['error', 'timeout', 'abort']) {
                this.addEventListener(event, () => finish(null, false), { once: true });
            }
        } else if (data?.event === 'COMMENT_SUBMIT') {
            const forms = Array.from(document.querySelectorAll('#twikoo .tk-submit'));
            const sending = forms.filter(element => {
                const composer = element.__vue__;
                return composer?.isSending
                    && element.querySelector('input[name="nick"]')?.value.trim() === (data.nick || '').trim()
                    && element.querySelector('input[name="mail"]')?.value.trim() === (data.mail || '').trim()
                    && (composer.pid || composer.replyId || '') === (data.pid || '')
                    && (composer.replyId || '') === (data.rid || '');
            });
            // Legacy single forms can match raw text; never choose an idle sibling by content.
            const single = forms.length === 1 && !forms[0].__vue__ ? forms[0] : null;
            const rawMatch = single && typeof data.comment === 'string'
                && single.querySelector('textarea')?.value.trim() === data.comment.trim();
            const submit = sending.length === 1 ? sending[0] : rawMatch ? single : null;
            if (submit?.dataset?.markdown === 'false') {
                data.comment = plainComment(submit.querySelector('textarea').value);
            }
            if (state.enabled) {
                const field = submit?.querySelector('.blog-math-captcha');
                data.blogCaptcha = { token: field?.dataset.token || '', answer: field?.querySelector('input')?.value || '' };
                this.addEventListener('load', () => { field?.dispatchEvent(new Event('captcha:refresh')); }, { once: true });
            }
            if (state.enabled || submit?.dataset?.markdown === 'false') body = JSON.stringify(data);
        }
    }
    return nativeSend.call(this, body);
};

// Twikoo 2 uses fetch and its public onSubmit hook. Keep the original response,
// credentials, cancellation signal and all unrelated requests unchanged.
if (nativeFetch) globalThis.fetch = async function(input, options) {
    registerAll();
    const endpoint = new URL(typeof input === 'string' || input instanceof URL ? input : input.url, location.href).href;
    const state = options?.method?.toUpperCase() === 'POST' && services.get(endpoint);
    let data;
    if (state && typeof options.body === 'string') {
        try { data = JSON.parse(options.body); } catch { /* Not a Twikoo event. */ }
    }
    const finish = data?.event === 'GET_CONFIG' ? configRequest(state) : null;
    let response;
    try { response = await nativeFetch.call(this, input, options); }
    catch (error) { finish?.(null, false); throw error; }
    if (finish || data?.event === 'COMMENT_GET') {
        try {
            const result = await response.clone().json();
            finish?.(result, response.ok);
            if (response.ok && !result.code && Array.isArray(result.data)) {
                const remember = rows => rows.forEach(row => {
                    if (typeof row.id === 'string') commentParents.set(row.id, row.pid || '');
                    if (Array.isArray(row.replies)) remember(row.replies);
                });
                remember(result.data);
                while (commentParents.size > 4096) commentParents.delete(commentParents.keys().next().value);
            }
        } catch { finish?.(null, false); }
    }
    if (data?.event === 'COMMENT_SUBMIT' && data.blogCaptcha?.token) {
        document.querySelectorAll('.blog-math-captcha').forEach(field => {
            if (field.dataset.token === data.blogCaptcha.token) field.dispatchEvent(new Event('captcha:refresh'));
        });
    }
    return response;
};

export function prepareComment(payload, endpoint) {
    registerAll();
    const forms = Array.from(document.querySelectorAll('#twikoo .tk-submit')).filter(form => {
        if (form.closest('[data-service]')?.dataset.service !== endpoint) return false;
        const target = form.closest('.tk-comment');
        let root = target;
        for (let parent = root?.parentElement?.closest('.tk-comment'); parent; parent = root?.parentElement?.closest('.tk-comment')) root = parent;
        return (target?.id || '') === (payload.pid || '') && (root?.id || '') === (payload.rid || '')
            && form.querySelector('input[name="nick"]')?.value.trim() === (payload.nick || '').trim()
            && form.querySelector('input[name="mail"]')?.value.trim() === (payload.mail || '').trim();
    });
    if (forms.length !== 1) throw Error('无法确认发送表单，请重新打开评论后重试。');
    const form = forms[0];
    if (form.dataset.markdown === 'false') payload.comment = plainComment(form.querySelector('textarea').value);
    const state = services.get(endpoint);
    if (!state?.checked) throw Error('评论配置尚未就绪，请稍后重试。');
    if (state.mailNotice) {
        const choice = form.querySelector('input[name="mailNotice"]');
        if (!choice) throw Error('邮件提醒选项尚未就绪，请稍后重试。');
        payload.blogMailNotice = choice.checked;
    }
    if (state.enabled) {
        const field = form.querySelector('.blog-math-captcha');
        payload.blogCaptcha = { token: field?.dataset.token || '', answer: field?.querySelector('input')?.value || '' };
    }
}
globalThis.blogPrepareComment = prepareComment;

export function mailNoticeSupported(root) {
    const endpoint = root.closest('[data-service]')?.dataset.service;
    return services.get(endpoint)?.mailNotice === true;
}

export function registerCaptchaService(root) {
    const endpoint = root.closest('[data-service]')?.dataset.service;
    if (endpoint && !services.has(endpoint)) services.set(endpoint, { enabled: false, checked: false, checking: false, failed: false });
    return endpoint;
}

export function enhanceMathCaptcha(root) {
    const endpoint = registerCaptchaService(root);
    const state = services.get(endpoint);
    if (!state) return;
    const metas = root.querySelectorAll('.tk-meta-input');
    if (!metas.length) return;
    // Reuse Twikoo's in-flight GET_CONFIG. Only a mounted form whose initial
    // request was missed needs a lookup; failures wait for explicit retry.
    if (!state.checked && !state.checking && !state.failed) requestConfig(endpoint, state);
    metas.forEach(meta => {
        let field = meta.querySelector('.blog-math-captcha');
        if (state.checked && !state.enabled) {
            field?.remove();
            return;
        }
        if (field) {
            fields.get(field)?.();
            return;
        }
        field = document.createElement('div');
        // 与同一行的昵称/邮箱/网址对齐：它们都是 tk-input--small（13px），少了这个
        // 类，验证码会按基础字号 14px 渲染，和相邻输入框差一号。
        field.className = 'tk-input tk-input--small tk-input-group tk-input-group--prepend blog-math-captcha';
        field.innerHTML = '<button type="button" class="tk-input-group__prepend blog-captcha-question" title="换一道题" aria-label="换一道验证码题目"><i class="fas fa-key" aria-hidden="true"></i></button><input class="tk-input__inner" type="text" inputmode="numeric" autocomplete="off" placeholder="验证码" aria-label="算术验证码答案"><span class="blog-captcha-tooltip" role="tooltip">出题中…</span>';
        const question = field.querySelector('button');
        const input = field.querySelector('input');
        input.name = 'blogCaptchaAnswer';
        const tooltip = field.querySelector('.blog-captcha-tooltip');
        tooltip.id = `comment-captcha-${crypto.randomUUID()}`;
        input.setAttribute('aria-describedby', tooltip.id);
        question.setAttribute('aria-describedby', tooltip.id);
        let sequence = 0;
        let active = false;
        async function refresh() {
            if (!state.enabled) return;
            const current = ++sequence;
            delete field.dataset.token;
            field.dataset.state = 'loading';
            input.value = '';
            input.disabled = true;
            input.placeholder = '出题中…';
            question.disabled = true;
            tooltip.textContent = '出题中…';
            question.setAttribute('aria-label', '换一道验证码题目');
            question.title = '换一道题';
            try {
                const response = await fetch(endpoint, {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ event: 'BLOG_CAPTCHA_GET', url: root.closest('[data-service]')?.dataset.commentPath || location.pathname }),
                    signal: AbortSignal.timeout(10000)
                });
                const data = await response.json();
                if (current !== sequence || !field.isConnected) return;
                if (!response.ok || data.code || !data.token || !data.question) throw Error('Unavailable');
                field.dataset.token = data.token;
                field.dataset.state = 'ready';
                input.disabled = false;
                input.placeholder = '验证码';
                tooltip.textContent = data.question;
                input.setAttribute('aria-label', `验证码：${data.question}`);
            } catch {
                if (current === sequence && field.isConnected) {
                    field.dataset.state = 'error';
                    input.placeholder = '点击钥匙重试';
                    tooltip.textContent = '出题失败，点击重试';
                    question.setAttribute('aria-label', '重新获取验证码');
                    question.title = '重新获取验证码';
                }
            } finally { if (current === sequence) question.disabled = false; }
        }
        function update() {
            if (state.enabled) {
                if (!active) {
                    active = true;
                    refresh();
                }
                return;
            }
            field.dataset.state = state.failed ? 'error' : 'pending';
            input.disabled = true;
            input.placeholder = state.failed ? '点击钥匙重试' : '加载验证码…';
            question.disabled = state.checking;
            tooltip.textContent = state.failed ? '验证码配置加载失败，点击重试' : '加载验证码…';
            question.setAttribute('aria-label', '重新加载验证码配置');
            question.title = '重新加载验证码配置';
        }
        fields.set(field, update);
        question.addEventListener('click', () => {
            if (state.checked) refresh();
            else requestConfig(endpoint, state);
        });
        field.addEventListener('captcha:refresh', refresh);
        meta.appendChild(field);
        update();
    });
}

// Register before Twikoo's lazy GET_CONFIG request, including after PJAX.
function registerAll() { document.querySelectorAll('[data-local-admin][data-service]').forEach(registerCaptchaService); }
document.addEventListener('pjax:complete', registerAll);
registerAll();
