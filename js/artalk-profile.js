// Identity-only state survives PJAX remounts; editor and reader state live in artalk-ui.
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
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return;
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
