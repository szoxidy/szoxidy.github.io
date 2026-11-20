import { emailAvatarHash, initialAvatar, isValidEmail } from '../lib/comment-shared.js?v=94b74f8636';

// Identity-only state survives PJAX remounts; editor and reader state live in artalk/*.
const avatarSources = new WeakMap();
const avatarResults = new Map();
const previewAvatars = new WeakMap();
const ownerHashes = new Set([
    'b1c38013f782303cff26dc625fccbdfc',
    'a9c0485877817324447cd604f579e536b3dc1d7efe7acac83d60fe25ec8be3be'
]);

export async function completeArtalkUserAgent(ua = navigator.userAgent, hints = navigator.userAgentData) {
    if (typeof hints?.getHighEntropyValues !== 'function') return ua;
    try {
        const { platformVersion, fullVersionList = [] } = await hints.getHighEntropyValues(['platformVersion', 'fullVersionList']);
        const versionFor = brands => fullVersionList.find(item => brands.includes(item.brand)
            && /^\d+\.\d+\.\d+\.\d+$/.test(item.version))?.version;
        for (const [token, version] of [
            ['Chrome', versionFor(['Google Chrome']) || versionFor(['Chromium'])],
            ['Edg', versionFor(['Microsoft Edge'])], ['OPR', versionFor(['Opera'])]
        ]) {
            if (version) ua = ua.replace(new RegExp(`${token}/[\\d.]+`), `${token}/${version}`);
        }
        const major = parseInt(String(platformVersion).split('.')[0], 10);
        if (hints.platform === 'Windows' && major >= 13) ua = ua.replace(/Windows NT 10\.0/i, 'Windows NT 11.0');
        else if (hints.platform === 'macOS' && /^\d+(?:\.\d+)*$/.test(platformVersion) && major >= 11) {
            ua = ua.replace(/Mac OS X \d+_\d+(?:_\d+)?/i, `Mac OS X ${platformVersion.replaceAll('.', '_')}`);
        }
    } catch { /* Browsers without these details retain their actual available UA. */ }
    return ua;
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
    return [...new Set(urls)];
}

export function enhanceArtalkAvatar(img, data = {}) {
    if (!img) return;
    const previous = avatarSources.get(img);
    const current = img.getAttribute('src') || '';
    const source = previous && current === previous.output ? previous.source : current;
    const candidates = avatarCandidates(source, data).filter(url => !url.startsWith('data:'));
    const key = JSON.stringify(candidates);
    img.alt = `${data.nick || '访客'}的头像`;
    img.referrerPolicy = 'no-referrer';
    if (previous?.key === key) {
        previous.nick = data.nick;
        if (!previous.result) {
            previous.output = initialAvatar(data.nick || '访客');
            if (img.getAttribute('src') !== previous.output) img.src = previous.output;
        }
        return;
    }
    const state = { key, source, nick: data.nick, result: '' };
    avatarSources.set(img, state);
    const apply = result => {
        if (avatarSources.get(img) !== state) return;
        state.result = result;
        state.output = result || initialAvatar(state.nick || '访客');
        if (img.getAttribute('src') !== state.output) img.src = state.output;
    };
    if (candidates[0] === '/img/site-avatar.jpg?v=f600c1b0df') { apply(candidates[0]); return; }
    let cached = avatarResults.get(key);
    if (cached && Date.now() < cached.expires && cached.result !== undefined) {
        apply(cached.result);
        return;
    }
    apply('');
    if (!candidates.length) return;
    if (!cached || Date.now() >= cached.expires) {
        cached = { expires: Infinity };
        cached.promise = (async () => {
            for (const url of candidates) {
                const loaded = await new Promise(resolve => {
                    const probe = new Image();
                    probe.referrerPolicy = 'no-referrer';
                    probe.onload = () => resolve(probe.naturalWidth > 0);
                    probe.onerror = () => resolve(false);
                    probe.src = url;
                });
                if (loaded) return url;
            }
            return '';
        })().then(result => {
            cached.result = result;
            cached.expires = result ? Infinity : Date.now() + 60000;
            return result;
        });
        avatarResults.set(key, cached);
    }
    cached.promise.then(apply);
}

export function previewAvatar(img, nick, email) {
    email = email.trim().toLowerCase();
    const previous = previewAvatars.get(img);
    img.alt = `${nick}的头像`;
    if (previous?.email === email) {
        previous.nick = nick;
        if (previous.started) enhanceArtalkAvatar(img, { nick, email, email_encrypted: previous.hash });
        else {
            const fallback = initialAvatar(nick);
            if (img.getAttribute('src') !== fallback) img.src = fallback;
        }
        return previous.timer;
    }
    clearTimeout(previous?.timer);
    avatarSources.delete(img);
    const state = { email, nick };
    previewAvatars.set(img, state);
    img.src = initialAvatar(nick);
    if (!email || !isValidEmail(email)) return;
    state.hash = emailAvatarHash(email);
    if (ownerHashes.has(state.hash)) {
        state.started = true;
        enhanceArtalkAvatar(img, { nick, email, email_encrypted: state.hash });
        return;
    }
    state.timer = setTimeout(() => {
        state.timer = undefined;
        if (img.isConnected && previewAvatars.get(img) === state) {
            state.started = true;
            enhanceArtalkAvatar(img, { nick: state.nick, email, email_encrypted: state.hash });
        }
    }, 500);
    return state.timer;
}
