// Post URL normalization and archive traversal used by right-menu actions.
export const POST_PATH_PATTERN = /^\/posts\/[^/]+(?:\/(?:index\.html)?)?$/;
export const ARCHIVE_PATH_PATTERN = /^\/archives(?:\/page\/\d+)?\/?$/;

export function normalizePostUrl(url, origin = location.origin) {
    const parsed = new URL(url, origin);
    parsed.hash = '';
    parsed.search = '';
    parsed.pathname = parsed.pathname.replace(/index\.html$/, '').replace(/\/?$/, '/');
    return parsed.href;
}

export function isPostUrl(url, origin = location.origin) {
    try {
        const parsed = new URL(url, origin);
        return parsed.origin === origin && POST_PATH_PATTERN.test(parsed.pathname);
    } catch {
        return false;
    }
}

export function collectPostUrls(root = document, origin = location.origin) {
    const urls = new Set();
    for (const link of root.querySelectorAll('a[href]')) {
        const href = link.getAttribute('href');
        if (!href || href.startsWith('#') || href.startsWith('javascript:')) continue;
        try {
            const url = new URL(href, origin);
            if (url.origin === origin && POST_PATH_PATTERN.test(url.pathname)) {
                urls.add(normalizePostUrl(url.href, origin));
            }
        } catch {
            // Ignore malformed hrefs from third-party widgets.
        }
    }
    return Array.from(urls);
}

export function collectArchiveUrls(root, origin = location.origin) {
    const urls = new Set();
    for (const link of root.querySelectorAll('a[href]')) {
        try {
            const url = new URL(link.getAttribute('href'), origin);
            if (url.origin === origin && ARCHIVE_PATH_PATTERN.test(url.pathname)) {
                urls.add(url.pathname);
            }
        } catch {
            // Ignore malformed hrefs from third-party widgets.
        }
    }
    return urls;
}

export function createPostDirectory({
    fetchImpl = (...args) => fetch(...args),
    parseHtml = html => new DOMParser().parseFromString(html, 'text/html'),
    getDocument = () => document,
    getOrigin = () => location.origin
} = {}) {
    let cache = null;

    const loadAll = async () => {
        const origin = getOrigin();
        const urls = new Set(collectPostUrls(getDocument(), origin));
        const archiveQueue = ['/archives/'];
        const visitedArchives = new Set();

        while (archiveQueue.length && visitedArchives.size < 100) {
            const archivePath = archiveQueue.shift();
            if (visitedArchives.has(archivePath)) continue;
            visitedArchives.add(archivePath);

            try {
                const response = await fetchImpl(archivePath, { credentials: 'same-origin' });
                if (!response.ok) continue;
                const archiveDoc = parseHtml(await response.text());
                collectPostUrls(archiveDoc, origin).forEach(url => urls.add(url));
                collectArchiveUrls(archiveDoc, origin).forEach(path => {
                    if (!visitedArchives.has(path)) archiveQueue.push(path);
                });
            } catch (error) {
                console.debug('Archive page could not be read:', archivePath, error);
            }
        }

        return Array.from(urls);
    };

    const getAllUrls = () => {
        if (!cache) cache = loadAll();
        return cache;
    };

    const pickRandomUrl = async (currentHref, random = Math.random) => {
        const urls = await getAllUrls();
        const currentUrl = normalizePostUrl(currentHref, getOrigin());
        const candidates = urls.filter(url => url !== currentUrl);
        const pool = candidates.length ? candidates : urls;
        if (!pool.length) return '/archives/';
        return pool[Math.floor(random() * pool.length)];
    };

    return { getAllUrls, pickRandomUrl };
}
