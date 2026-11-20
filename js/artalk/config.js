// Central Artalk defaults, verified backend version contract and UI element primitives.
export const UPSTREAM_API_VERSION = '2.10.1';

// Known blog backend builds that extend fields without breaking the 2.10.1 API.
// Keep this list explicit so unverified releases still trigger the native version check.
export const COMPATIBLE_API_VERSIONS = [
    '2.10.1-blog.1',
    '2.10.1-blog.2',
    '2.10.1-blog.3',
    '2.10.1-blog.4'
];

export const ARTALK_PREFERENCE_KEYS = {
    markdown: 'blog-comment-draft-markdown',
    mail: 'blog-comment-mail-notice',
    private: 'blog-comment-draft-private'
};

export function normalizeCompatApiVersion(apiVersion) {
    return COMPATIBLE_API_VERSIONS.includes(apiVersion) ? UPSTREAM_API_VERSION : apiVersion;
}

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

export function notifyComment(title, message, type, duration = 5000) {
    if (message === '内容已自动恢复') message = '已恢复上次输入的评论';
    return globalThis.siteNotify?.({ title, message, type, duration, key: 'comment-submit', variant: 'comment' });
}

export function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
}

export function icon(name) {
    const node = element('i', `fas fa-${name}`);
    node.setAttribute('aria-hidden', 'true');
    return node;
}

export function button(className, caption, symbol) {
    const node = element('button', className);
    node.type = 'button';
    if (symbol) node.append(icon(symbol));
    node.append(element('span', '', caption));
    return node;
}

export function checkbox(className, name, caption, checked, change) {
    const label = element('label', className);
    const input = element('input');
    input.type = 'checkbox';
    input.name = name;
    input.checked = checked;
    input.addEventListener('change', () => change(input.checked));
    label.append(input, element('span', '', caption));
    return { label, input };
}
