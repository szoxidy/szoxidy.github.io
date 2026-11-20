// Pure comment domain rules shared across Artalk and legacy Twikoo integrations.
export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const SEND_BUTTON_STATES = {
    idle: { label: '发送', icon: 'paper-plane' },
    sending: { label: '发送中', icon: 'spinner fa-spin' },
    error: { label: '重试', icon: 'rotate-right' },
    success: { label: '已发送', icon: 'check' }
};

export function isValidEmail(value) {
    return EMAIL_PATTERN.test(String(value || '').trim());
}

export function isValidAbsoluteHttpUrl(value) {
    const text = String(value || '').trim();
    if (!text) return false;
    try {
        const url = new URL(text);
        return /^https?:$/.test(url.protocol) && Boolean(url.hostname) && !url.username && !url.password;
    } catch {
        return false;
    }
}

export function normalizePreviewWebsiteUrl(value) {
    const text = String(value || '').trim();
    const hasUnsupportedScheme = /^[a-z][\w+.-]*:/i.test(text) && !/^https?:\/\//i.test(text);
    if (!text || /\s/.test(text) || hasUnsupportedScheme) return null;
    try {
        const url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`);
        const isWebsite = /^https?:$/.test(url.protocol) && url.hostname.includes('.');
        const hasCredentials = Boolean(url.username || url.password);
        return isWebsite && !hasCredentials ? url.href : null;
    } catch {
        return null;
    }
}

export function validateCommentFields({ content, nick, email, link, captcha }, { needsCaptcha = true } = {}) {
    const errors = [];
    const add = (input, message) => errors.push({ input, message });

    if (!String(content?.value ?? '').trim()) add(content?.input, '评论内容不能为空');
    if (!String(nick?.value ?? '').trim()) add(nick?.input, '昵称不能为空');

    const mailValue = String(email?.value ?? '').trim();
    if (!mailValue) add(email?.input, '邮箱不能为空');
    else if (email?.typeMismatch || !isValidEmail(mailValue)) add(email?.input, '邮箱格式错误');

    const linkValue = String(link?.value ?? '').trim();
    if (linkValue && !isValidAbsoluteHttpUrl(linkValue)) {
        add(link?.input, '网址请填写完整的 http:// 或 https:// 地址');
    }

    if (needsCaptcha && captcha) {
        const captchaValue = String(captcha.value ?? '').trim();
        if (!captcha.ready || captcha.disabled) {
            add(captcha.input, '验证码尚未就绪，请稍后重试或点击钥匙重新加载');
        } else if (!captchaValue) {
            add(captcha.input, '验证码未输入');
        } else if (!/^-?\d+$/.test(captchaValue)) {
            add(captcha.input, '验证码请填写数字');
        }
    }

    return errors;
}

export function normalizeIsoDateString(raw) {
    return typeof raw === 'string'
        ? raw.replace(/^(\d{4})\/(\d{2})\/(\d{2})(?=T)/, '$1-$2-$3')
        : raw;
}

export function formatCommentDate(dateInput) {
    const value = dateInput instanceof Date ? dateInput : new Date(normalizeIsoDateString(dateInput));
    if (Number.isNaN(value.getTime())) return null;
    const pad = number => String(number).padStart(2, '0');
    const shortDate = `${value.getFullYear()}-${value.getMonth() + 1}-${value.getDate()}`;
    const fullDate = `${shortDate} ${pad(value.getHours())}:${pad(value.getMinutes())}:${pad(value.getSeconds())}`;
    return { shortDate, fullDate };
}

const BROWSER_VERSION_PATTERNS = {
    chrome: /(?:Chrome|CriOS)\/([\d.]+)/,
    edge: /(?:Edg(?:A|iOS)?|Edge)\/([\d.]+)/,
    firefox: /(?:Firefox|FxiOS)\/([\d.]+)/,
    safari: /Version\/([\d.]+)/
};

export function parseUserAgentBadge(labelText, { rawUa = '', isBrowser = false } = {}) {
    const value = String(labelText || '').replace(/ /g, ' ').trim();
    const brand = /windows/i.test(value) ? 'windows' : /edge/i.test(value) ? 'edge'
        : /chrome|chromium/i.test(value) ? 'chrome' : /firefox/i.test(value) ? 'firefox'
        : /safari/i.test(value) ? 'safari' : /android/i.test(value) ? 'android'
        : /ubuntu/i.test(value) ? 'ubuntu' : /linux/i.test(value) ? 'linux'
        : /mac|ios|iphone|ipad/i.test(value) ? 'apple' : '';
    const stripped = value.replace(/\s+\d[\d._]*(?:\s.*)?$/, '').trim();
    const browserToken = isBrowser && BROWSER_VERSION_PATTERNS[brand];
    const version = browserToken && String(rawUa || '').match(browserToken)?.[1];
    const description = version && /^\d+(?:\.\d+)*$/.test(version)
        ? `${stripped} ${version}`
        : value;
    // A reduced UA only proves the major version, not a zero-valued build.
    const title = description.replace(/\b(Chrome|Chromium|Edge|Opera)\s+(\d+)(?:\.0){1,3}$/i, '$1 $2');
    return {
        brand,
        title,
        label: brand ? stripped : value
    };
}

export function initialAvatar(nick) {
    const name = String(nick || '').trim() || '访客';
    const letter = Array.from(name)[0].toUpperCase().replace(/[<>&"']/g, char => `&#${char.codePointAt(0)};`);
    let hash = 0;
    for (const char of name) hash = (hash * 31 + char.codePointAt(0)) >>> 0;
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80" viewBox="0 0 80 80">'
        + `<rect width="80" height="80" rx="40" fill="hsl(${hash % 360} 55% 42%)"/>`
        + '<text x="40" y="42" dy=".35em" text-anchor="middle" fill="white"'
        + ` font-family="sans-serif" font-size="36">${letter}</text></svg>`;
    return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

// Gravatar's classic mirror API uses MD5 of the trimmed, lowercase UTF-8 email.
// This is an avatar identifier, not a password hash.
export function emailAvatarHash(email) {
    const bytes = new TextEncoder().encode(String(email || '').trim().toLowerCase());
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
            const mix = round === 0 ? (b & c) | (~b & d)
                : round === 1 ? (d & b) | (~d & c)
                : round === 2 ? b ^ c ^ d
                : c ^ (b | ~d);
            const word = round === 0 ? i
                : round === 1 ? (5 * i + 1) % 16
                : round === 2 ? (3 * i + 5) % 16
                : (7 * i) % 16;
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
